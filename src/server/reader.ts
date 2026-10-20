import { Readability } from "@mozilla/readability";
import { eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { parseHTML } from "linkedom";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { articles, type Highlight } from "#/db/schema";
import { InvalidInput } from "#/lib/effect/errors";
import * as capture from "./capture";
import * as library from "./library";
import { fetchText } from "./metadata";
import { query } from "./runtime";

/*
 * Read later: links saved with the "read-later" tag land in a "Read later"
 * group. Opening one in the reader extracts the article (Mozilla's
 * Readability), sanitizes it to a small allowlist of tags, and keeps that copy
 * so it reads offline. Vault links are never fetched.
 */

export const READ_LATER_TAG = "read-later";
const WORDS_PER_MINUTE = 230;
const MAX_HTML = 3 * 1024 * 1024;

const ALLOWED_TAGS = [
	"p",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"blockquote",
	"ul",
	"ol",
	"li",
	"a",
	"strong",
	"em",
	"b",
	"i",
	"u",
	"s",
	"code",
	"pre",
	"kbd",
	"figure",
	"figcaption",
	"img",
	"br",
	"hr",
	"table",
	"thead",
	"tbody",
	"tfoot",
	"tr",
	"th",
	"td",
	"caption",
	"sup",
	"sub",
	"small",
	"del",
	"ins",
	"mark",
	"abbr",
	"dl",
	"dt",
	"dd",
];

const absolute = (value: string | undefined, base: URL) => {
	if (!value) return undefined;
	try {
		const url = new URL(value, base);
		return /^https?:$/.test(url.protocol) ? url.toString() : undefined;
	} catch {
		return undefined;
	}
};

/** Untrusted article HTML → markup safe to render on tabz's own origin. */
export function cleanArticleHtml(html: string, base: URL) {
	return sanitizeHtml(html, {
		allowedTags: ALLOWED_TAGS,
		// Links and images are rebuilt by transformTags below, which replaces
		// the page's attributes with these (fixed target/rel/loading values).
		allowedAttributes: {
			a: ["href", "title", "target", "rel"],
			img: [
				"src",
				"alt",
				"title",
				"width",
				"height",
				"loading",
				"referrerpolicy",
			],
			td: ["colspan", "rowspan"],
			th: ["colspan", "rowspan", "scope"],
			abbr: ["title"],
		},
		allowedSchemes: ["http", "https"],
		allowProtocolRelative: false,
		// The page's own headings start at h2 under the reader's title.
		transformTags: {
			h1: "h2",
			a: (tagName, attribs) => {
				const href = absolute(attribs.href, base);
				return {
					tagName,
					attribs: href
						? {
								href,
								...(attribs.title ? { title: attribs.title } : {}),
								target: "_blank",
								rel: "noopener noreferrer nofollow",
							}
						: {},
				};
			},
			img: (tagName, attribs) => {
				const src = absolute(attribs.src || attribs["data-src"], base);
				return {
					tagName: src ? tagName : "span",
					attribs: src
						? {
								src,
								alt: attribs.alt ?? "",
								loading: "lazy",
								referrerpolicy: "no-referrer",
								...(attribs.width ? { width: attribs.width } : {}),
								...(attribs.height ? { height: attribs.height } : {}),
							}
						: {},
				};
			},
		},
		allowedSchemesByTag: { img: ["http", "https"] },
	});
}

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

export const readMinutes = (words: number) =>
	Math.max(1, Math.round(words / WORDS_PER_MINUTE));

/** Fetches a page and pulls out its article. */
export const extractArticle = (rawUrl: string) =>
	Effect.gen(function* () {
		const { url, body } = yield* fetchText(
			new URL(rawUrl),
			"text/html,application/xhtml+xml",
			/html/i,
			MAX_HTML,
		).pipe(Effect.timeout("12 seconds"));
		if (!body)
			return yield* new InvalidInput({
				message: "That page has no article to read",
			});
		const { document } = parseHTML(body);
		const parsed = new Readability(document as unknown as Document, {
			charThreshold: 300,
		}).parse();
		if (!parsed?.content)
			return yield* new InvalidInput({
				message: "Couldn't find an article on that page",
			});
		const html = cleanArticleHtml(parsed.content, url);
		const text = parsed.textContent ?? "";
		return {
			title: (parsed.title || "").trim().slice(0, 300),
			byline: parsed.byline?.trim().slice(0, 200) || null,
			siteName: parsed.siteName?.trim().slice(0, 100) || url.hostname,
			excerpt: parsed.excerpt?.trim().slice(0, 400) || null,
			html,
			words: countWords(text),
		};
	}).pipe(
		Effect.catch((error) =>
			error._tag === "InvalidInput"
				? Effect.fail(error)
				: Effect.fail(
						new InvalidInput({ message: "Couldn't load that page right now" }),
					),
		),
	);

/** A link you can read: yours (or shared with you), a link, and not in a vault. */
const readable = (userId: string, id: string) =>
	Effect.gen(function* () {
		const found = yield* library.accessBookmark(userId, id);
		if (found.board.vault || found.bookmark.kind !== "link")
			return yield* new InvalidInput({
				message: "Reader view isn't available for this link",
			});
		return found;
	});

const stored = (bookmarkId: string) =>
	query((db) =>
		db.query.articles.findFirst({ where: eq(articles.bookmarkId, bookmarkId) }),
	);

export const idInput = z.object({ id: z.string().max(64) });

/** The reader copy of a link, made on first open. */
export const getArticle = (userId: string, data: z.infer<typeof idInput>) =>
	Effect.gen(function* () {
		const { bookmark } = yield* readable(userId, data.id);
		let article = yield* stored(bookmark.id);
		if (!article) {
			const extracted = yield* extractArticle(bookmark.url);
			[article] = yield* query((db) =>
				db
					.insert(articles)
					.values({
						bookmarkId: bookmark.id,
						userId: bookmark.userId,
						...extracted,
						title: extracted.title || bookmark.title,
					})
					.onConflictDoNothing()
					.returning(),
			);
			article ??= yield* stored(bookmark.id);
		}
		if (!article) return yield* new InvalidInput({ message: "Not found" });
		return {
			id: bookmark.id,
			url: bookmark.url,
			title: article.title,
			byline: article.byline,
			siteName: article.siteName,
			html: article.html,
			words: article.words,
			minutes: readMinutes(article.words),
			progress: article.progress / 1000,
			highlights: article.highlights,
			unread: bookmark.tags.includes(READ_LATER_TAG),
		};
	});

export const readLaterInput = z.object({
	url: z.string().max(2048),
	title: z.string().max(200).optional(),
	board: z.string().optional(),
});

/** Saves a link to the "Read later" group, then prepares its reader copy. */
export const saveForLater = (
	userId: string,
	data: z.infer<typeof readLaterInput>,
) =>
	Effect.gen(function* () {
		const bookmark = yield* capture.smartAdd(userId, {
			url: data.url,
			title: data.title,
			board: data.board,
			group: "Read later",
			tags: [READ_LATER_TAG],
		});
		// Extract in the background; opening the reader does it otherwise.
		Effect.runFork(getArticle(userId, { id: bookmark.id }).pipe(Effect.ignore));
		return bookmark;
	});

export const progressInput = z.object({
	id: z.string().max(64),
	progress: z.number().min(0).max(1),
});

export const saveProgress = (
	userId: string,
	data: z.infer<typeof progressInput>,
) =>
	Effect.gen(function* () {
		yield* readable(userId, data.id);
		yield* query((db) =>
			db
				.update(articles)
				.set({ progress: Math.round(data.progress * 1000) })
				.where(eq(articles.bookmarkId, data.id)),
		);
		return { ok: true };
	});

export const markReadInput = z.object({
	id: z.string().max(64),
	read: z.boolean(),
});

/** Done reading (drops the read-later tag), or back on the list. */
export const markRead = (userId: string, data: z.infer<typeof markReadInput>) =>
	Effect.gen(function* () {
		const { bookmark } = yield* readable(userId, data.id);
		const others = bookmark.tags.filter((tag) => tag !== READ_LATER_TAG);
		yield* library.updateBookmark(userId, {
			id: bookmark.id,
			tags: data.read ? others : [...others, READ_LATER_TAG],
		});
		return { unread: !data.read };
	});

export const highlightInput = z.object({
	id: z.string().max(64),
	text: z.string().trim().min(1).max(2000),
	note: z.string().trim().max(1000).optional(),
});

export const addHighlight = (
	userId: string,
	data: z.infer<typeof highlightInput>,
) =>
	Effect.gen(function* () {
		yield* readable(userId, data.id);
		const article = yield* stored(data.id);
		if (!article) return yield* new InvalidInput({ message: "Open it first" });
		const highlight: Highlight = {
			id: crypto.randomUUID(),
			text: data.text,
			...(data.note ? { note: data.note } : {}),
			at: Date.now(),
		};
		const highlights = [...article.highlights, highlight].slice(-200);
		yield* query((db) =>
			db
				.update(articles)
				.set({ highlights })
				.where(eq(articles.bookmarkId, data.id)),
		);
		return highlights;
	});

export const removeHighlightInput = z.object({
	id: z.string().max(64),
	highlightId: z.string().max(64),
});

export const removeHighlight = (
	userId: string,
	data: z.infer<typeof removeHighlightInput>,
) =>
	Effect.gen(function* () {
		yield* readable(userId, data.id);
		const article = yield* stored(data.id);
		const highlights = (article?.highlights ?? []).filter(
			(item) => item.id !== data.highlightId,
		);
		yield* query((db) =>
			db
				.update(articles)
				.set({ highlights })
				.where(eq(articles.bookmarkId, data.id)),
		);
		return highlights;
	});

/** Everything tagged read-later that you can see, newest first, with read times. */
export const readingList = (userId: string) =>
	Effect.gen(function* () {
		const home = yield* library.loadHome(userId);
		const links = home.boards
			.filter((board) => !board.vault)
			.flatMap((board) =>
				board.groups.flatMap((group) =>
					library
						.walkTree(group.bookmarks)
						.map(({ item }) => item)
						.filter(
							(item) =>
								item.kind === "link" && item.tags.includes(READ_LATER_TAG),
						),
				),
			)
			.sort((a, b) => +b.createdAt - +a.createdAt)
			.slice(0, 200);
		const copies = links.length
			? yield* query((db) =>
					db
						.select({
							id: articles.bookmarkId,
							words: articles.words,
							progress: articles.progress,
						})
						.from(articles)
						.where(
							inArray(
								articles.bookmarkId,
								links.map((item) => item.id),
							),
						),
				)
			: [];
		const byId = new Map(copies.map((copy) => [copy.id, copy]));
		return links.map((item) => {
			const copy = byId.get(item.id);
			return {
				id: item.id,
				title: item.title,
				url: item.url,
				favicon: item.meta.favicon ?? null,
				minutes: copy ? readMinutes(copy.words) : null,
				progress: copy ? copy.progress / 1000 : 0,
				savedAt: item.createdAt,
			};
		});
	});

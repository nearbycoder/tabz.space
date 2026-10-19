import { and, eq, isNull, sql } from "drizzle-orm";
import { Effect } from "effect";
import { boards, bookmarks, groups, userSettings } from "#/db/schema";
import { FetchError } from "#/lib/effect/errors";
import { resolveSettings } from "#/lib/schemas";
import { query } from "./runtime";

/*
 * Optional AI helpers, powered by Claude when ANTHROPIC_API_KEY is set on the
 * server. Never used for vault links (they're encrypted anyway).
 */

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const MODEL = () => process.env.TABZ_AI_MODEL ?? "claude-haiku-5-5";

type Message = { content: { type: string; text?: string }[] };

const ask = (system: string, user: string, maxTokens = 200) =>
	Effect.tryPromise({
		try: async (signal) => {
			const response = await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				signal,
				headers: {
					"content-type": "application/json",
					"x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: MODEL(),
					max_tokens: maxTokens,
					system,
					messages: [{ role: "user", content: user }],
				}),
			});
			if (!response.ok)
				throw new Error(
					`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`,
				);
			const body = (await response.json()) as Message;
			return body.content.map((part) => part.text ?? "").join("");
		},
		catch: (error) =>
			new FetchError({ url: "anthropic", reason: String(error) }),
	}).pipe(Effect.timeout("20 seconds"));

const cleanTag = (tag: unknown) =>
	typeof tag === "string"
		? tag
				.toLowerCase()
				.replace(/[^\p{L}\p{N} -]/gu, "")
				.trim()
				.replace(/\s+/g, "-")
				.slice(0, 24)
		: "";

/** Up to four short tags for a page, preferring tags the user already uses. */
export const suggestTags = (
	page: {
		title: string;
		url: string;
		description?: string | null;
		text?: string;
	},
	vocabulary: string[],
) =>
	ask(
		"You tag bookmarks for a personal start page. Reply with only a JSON array of 1-4 short, lowercase tags (single words or hyphenated). Prefer tags from the user's existing list when they fit; otherwise use common, general topics. No explanations.",
		[
			`Existing tags: ${vocabulary.slice(0, 80).join(", ") || "(none yet)"}`,
			`Title: ${page.title}`,
			`URL: ${page.url}`,
			page.description ? `Description: ${page.description}` : "",
			page.text ? `Page text (excerpt): ${page.text.slice(0, 2500)}` : "",
		]
			.filter(Boolean)
			.join("\n"),
		100,
	).pipe(
		Effect.map((reply) => {
			const json = reply.match(/\[[\s\S]*\]/)?.[0] ?? "[]";
			let parsed: unknown = [];
			try {
				parsed = JSON.parse(json);
			} catch {}
			const tags = (Array.isArray(parsed) ? parsed : [])
				.map(cleanTag)
				.filter((tag) => tag.length > 1);
			return [...new Set(tags)].slice(0, 4);
		}),
	);

/** Tags a freshly saved link if its owner turned on auto-tagging. */
export const autoTag = (
	bookmarkId: string,
	page: { title?: string; description?: string; text?: string },
) =>
	!aiEnabled()
		? Effect.void
		: Effect.gen(function* () {
				const [row] = yield* query((db) =>
					db
						.select({
							bookmark: bookmarks,
							ownerId: boards.userId,
							vault: boards.vault,
						})
						.from(bookmarks)
						.innerJoin(groups, eq(groups.id, bookmarks.groupId))
						.innerJoin(boards, eq(boards.id, groups.boardId))
						.where(
							and(eq(bookmarks.id, bookmarkId), isNull(bookmarks.deletedAt)),
						),
				);
				if (
					!row ||
					row.vault ||
					row.bookmark.kind !== "link" ||
					row.bookmark.tags.length > 0
				)
					return;
				const settingsRow = yield* query((db) =>
					db.query.userSettings.findFirst({
						where: eq(userSettings.userId, row.ownerId),
					}),
				);
				if (!resolveSettings(settingsRow?.settings).autoTag) return;
				const used = yield* query((db) =>
					db.all<{ tag: string }>(
						sql`SELECT DISTINCT value AS tag FROM bookmarks, json_each(bookmarks.tags) WHERE bookmarks.user_id = ${row.ownerId} LIMIT 200`,
					),
				);
				const tags = yield* suggestTags(
					{
						title: page.title ?? row.bookmark.title,
						url: row.bookmark.url,
						description: page.description ?? row.bookmark.description,
						text: page.text,
					},
					used.map((entry) => entry.tag),
				);
				if (tags.length)
					yield* query((db) =>
						db
							.update(bookmarks)
							.set({ tags, updatedAt: sql`${bookmarks.updatedAt}` })
							// Only if the user hasn't tagged it in the meantime.
							.where(
								and(
									eq(bookmarks.id, bookmarkId),
									sql`json_array_length(${bookmarks.tags}) = 0`,
								),
							),
					);
			}).pipe(Effect.ignore);

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Effect, Schedule } from "effect";
import { FetchError } from "#/lib/effect/errors";

export type PageMetadata = {
	feedUrl?: string;
	/** Readable page text for the full-text index (not stored in meta). */
	text?: string;
	title?: string;
	description?: string;
	favicon?: string;
	siteName?: string;
	image?: string;
};

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;

const isPrivateAddress = (address: string) => {
	if (address.includes(":")) {
		const lower = address.toLowerCase();
		return (
			lower === "::1" ||
			lower.startsWith("fc") ||
			lower.startsWith("fd") ||
			lower.startsWith("fe80") ||
			lower.startsWith("::ffff:")
		);
	}
	const [a, b] = address.split(".").map(Number);
	return (
		a === 10 ||
		a === 127 ||
		a === 0 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 100 && b >= 64 && b <= 127)
	);
};

/** Blocks requests to loopback/private networks so lookups can't probe internal services. */
export const assertPublicHost = (url: URL) =>
	Effect.tryPromise({
		try: async () => {
			const host = url.hostname.replace(/^\[|\]$/g, "");
			if (host === "localhost" || host.endsWith(".internal"))
				throw new Error("private host");
			const addresses = isIP(host)
				? [{ address: host }]
				: await lookup(host, { all: true });
			if (addresses.some(({ address }) => isPrivateAddress(address)))
				throw new Error("private address");
		},
		catch: (error) =>
			new FetchError({ url: url.toString(), reason: String(error) }),
	});

const readLimited = async (response: Response) => {
	const reader = response.body?.getReader();
	if (!reader) return "";
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (size < MAX_BYTES) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		size += value.byteLength;
	}
	await reader.cancel().catch(() => {});
	return new TextDecoder().decode(Buffer.concat(chunks));
};

const HTML = "text/html,application/xhtml+xml";
const FEED =
	"application/rss+xml,application/atom+xml,application/xml;q=0.9,text/xml;q=0.8";

// Interrupting the effect (e.g. on timeout) aborts the underlying fetch.
const request = (url: URL, accept: string, method = "GET") =>
	Effect.tryPromise({
		try: (signal) =>
			fetch(url, {
				method,
				redirect: "manual",
				signal,
				headers: {
					"user-agent":
						"Mozilla/5.0 (compatible; TabzBot/1.0; +https://tabz.space)",
					accept,
				},
			}),
		catch: (error) =>
			new FetchError({ url: url.toString(), reason: String(error) }),
	});

/** Follows redirects by hand so every hop is checked against private networks. */
const follow = (
	start: URL,
	accept: string,
	method = "GET",
	maxRedirects = MAX_REDIRECTS,
) =>
	Effect.gen(function* () {
		let url = start;
		// True when every hop was a permanent (301/308) redirect.
		let permanent: boolean | null = null;
		for (let hop = 0; hop <= maxRedirects; hop++) {
			yield* assertPublicHost(url);
			const response = yield* request(url, accept, method);
			const location = response.headers.get("location");
			if (response.status >= 300 && response.status < 400 && location) {
				response.body?.cancel().catch(() => {});
				permanent =
					(permanent ?? true) &&
					(response.status === 301 || response.status === 308);
				url = new URL(location, url);
				continue;
			}
			return { url, response, permanent: permanent === true };
		}
		return yield* new FetchError({
			url: start.toString(),
			reason: "too many redirects",
		});
	});

const fetchText = (start: URL, accept: string, accepts: RegExp) =>
	Effect.gen(function* () {
		const { url, response } = yield* follow(start, accept);
		if (!response.ok)
			return yield* new FetchError({
				url: url.toString(),
				reason: `HTTP ${response.status}`,
			});
		if (!accepts.test(response.headers.get("content-type") ?? "")) {
			response.body?.cancel().catch(() => {});
			return { url, body: "" };
		}
		const body = yield* Effect.tryPromise({
			try: () => readLimited(response),
			catch: (error) =>
				new FetchError({ url: url.toString(), reason: String(error) }),
		});
		return { url, body };
	});

const fetchHtml = (start: URL) =>
	fetchText(start, HTML, /html/i).pipe(
		Effect.map(({ url, body }) => ({ url, html: body })),
	);

const decode = (value: string) =>
	value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/\s+/g, " ")
		.trim();

const metaContent = (html: string, key: string) => {
	const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
	for (const tag of tags) {
		const name = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
		if (name?.toLowerCase() !== key) continue;
		const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
		if (content) return decode(content);
	}
	return undefined;
};

const iconHref = (html: string) => {
	const links = html.match(/<link\b[^>]*>/gi) ?? [];
	const ranked = links
		.map((tag) => ({
			rel: tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "",
			href: tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1],
		}))
		.filter((link) => link.href && link.rel.includes("icon"));
	return (
		ranked.find((link) => link.rel.includes("apple-touch-icon")) ??
		ranked.find(
			(link) => link.rel === "icon" || link.rel === "shortcut icon",
		) ??
		ranked[0]
	)?.href;
};

const feedHref = (html: string) => {
	const links = html.match(/<link\b[^>]*>/gi) ?? [];
	for (const tag of links) {
		const type =
			tag.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "";
		const rel =
			tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "";
		if (
			rel.includes("alternate") &&
			(type.includes("rss") || type.includes("atom"))
		)
			return tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
	}
	return undefined;
};

export const parseMetadata = (html: string, base: URL): PageMetadata => {
	const absolute = (href?: string) => {
		if (!href) return undefined;
		try {
			return new URL(decode(href), base).toString();
		} catch {
			return undefined;
		}
	};
	const title =
		metaContent(html, "og:title") ??
		html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
	return {
		title: title ? decode(title).slice(0, 200) : undefined,
		description: (
			metaContent(html, "og:description") ?? metaContent(html, "description")
		)?.slice(0, 500),
		siteName: metaContent(html, "og:site_name"),
		image: absolute(metaContent(html, "og:image")),
		favicon: absolute(iconHref(html)),
		feedUrl: absolute(feedHref(html)),
		text: pageText(html),
	};
};

const MAX_TEXT = 20_000;

/** Visible text of a page, minus scripts, styles and chrome, for search. */
export const pageText = (html: string) => {
	const body = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
	const text = decode(
		body
			.replace(
				/<(script|style|noscript|svg|template|nav|footer|header|form|iframe)\b[\s\S]*?<\/\1>/gi,
				" ",
			)
			.replace(/<!--[\s\S]*?-->/g, " ")
			.replace(/<[^>]+>/g, " "),
	);
	return text ? text.slice(0, MAX_TEXT) : undefined;
};

/**
 * Best-effort page lookup: bounded by a timeout with one quick retry, and never
 * fails — callers get an empty object when the site can't be reached.
 */
export const fetchPageMetadata = (rawUrl: string) =>
	Effect.gen(function* () {
		const { url, html } = yield* fetchHtml(new URL(rawUrl));
		return html ? parseMetadata(html, url) : {};
	}).pipe(
		Effect.timeout("4 seconds"),
		Effect.retry({ times: 1, schedule: Schedule.spaced("250 millis") }),
		Effect.catch(() => Effect.succeed<PageMetadata>({})),
	);

/* ----------------------------------- feeds ---------------------------------- */

const tagText = (xml: string, tag: string) => {
	const raw = xml.match(
		new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"),
	)?.[1];
	if (!raw) return undefined;
	return decode(raw.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1"));
};

const MAX_FEED_ITEMS = 15;

/** Parses RSS 2.0, RSS 1.0 and Atom into dated items, newest first. */
export const parseFeed = (xml: string, base: URL) => {
	const blocks =
		xml.match(/<item\b[\s\S]*?<\/item>/gi) ??
		xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ??
		[];
	const items = blocks.flatMap((block) => {
		const date =
			tagText(block, "pubDate") ??
			tagText(block, "published") ??
			tagText(block, "updated") ??
			tagText(block, "dc:date");
		const at = date ? Date.parse(date) : Number.NaN;
		if (Number.isNaN(at)) return [];
		const href =
			block.match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ??
			tagText(block, "link");
		let url: string | undefined;
		try {
			url = href ? new URL(href, base).toString() : undefined;
		} catch {
			url = undefined;
		}
		const title = (tagText(block, "title") ?? "").replace(/<[^>]+>/g, "");
		return [{ title: title.slice(0, 200) || "Untitled", url, at }];
	});
	return items.sort((a, b) => b.at - a.at).slice(0, MAX_FEED_ITEMS);
};

export const fetchFeed = (feedUrl: string) =>
	fetchText(new URL(feedUrl), FEED, /xml|rss|atom/i).pipe(
		Effect.map(({ url, body }) => (body ? parseFeed(body, url) : [])),
		Effect.timeout("8 seconds"),
	);

/* -------------------------------- link health ------------------------------- */

export type HealthResult =
	| { kind: "ok"; code: number; finalUrl: string; permanent: boolean }
	| { kind: "missing"; code: number }
	| { kind: "unreachable"; reason: string }
	/** 401/403/429/5xx: the site is up but won't tell us; not counted as broken. */
	| { kind: "inconclusive"; code: number };

/** One lightweight request (HEAD, falling back to GET) to see if a link still resolves. */
export const checkLink = (rawUrl: string) =>
	Effect.gen(function* () {
		let { url, response, permanent } = yield* follow(
			new URL(rawUrl),
			HTML,
			"HEAD",
			6,
		);
		// Plenty of servers reject HEAD; ask again properly before judging.
		if (
			response.status === 405 ||
			response.status === 501 ||
			response.status === 404 ||
			response.status === 403
		) {
			({ url, response, permanent } = yield* follow(
				new URL(rawUrl),
				HTML,
				"GET",
				6,
			));
		}
		response.body?.cancel().catch(() => {});
		const code = response.status;
		if (response.ok)
			return {
				kind: "ok",
				code,
				finalUrl: url.toString(),
				permanent,
			} as HealthResult;
		if (code === 404 || code === 410)
			return { kind: "missing", code } as HealthResult;
		return { kind: "inconclusive", code } as HealthResult;
	}).pipe(
		Effect.timeout("8 seconds"),
		Effect.catch((error) => {
			const reason = String((error as { reason?: string }).reason ?? error);
			// Intranet links (private IPs, single-label hosts) can't be judged from here.
			const local =
				reason.includes("private") || !new URL(rawUrl).hostname.includes(".");
			// Endless sign-in redirect chains mean the site is up.
			if (reason.includes("too many redirects"))
				return Effect.succeed<HealthResult>({ kind: "inconclusive", code: 0 });
			return Effect.succeed<HealthResult>(
				local
					? { kind: "inconclusive", code: 0 }
					: { kind: "unreachable", reason },
			);
		}),
	);

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Effect, Schedule } from "effect";
import { FetchError } from "#/lib/effect/errors";

export type PageMetadata = {
	feedUrl?: string;
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

// Interrupting the effect (e.g. on timeout) aborts the underlying fetch.
const request = (url: URL) =>
	Effect.tryPromise({
		try: (signal) =>
			fetch(url, {
				redirect: "manual",
				signal,
				headers: {
					"user-agent":
						"Mozilla/5.0 (compatible; TabzBot/1.0; +https://tabz.space)",
					accept: "text/html,application/xhtml+xml",
				},
			}),
		catch: (error) =>
			new FetchError({ url: url.toString(), reason: String(error) }),
	});

const fetchHtml = (start: URL) =>
	Effect.gen(function* () {
		let url = start;
		for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
			yield* assertPublicHost(url);
			const response = yield* request(url);
			const location = response.headers.get("location");
			if (response.status >= 300 && response.status < 400 && location) {
				url = new URL(location, url);
				continue;
			}
			if (!response.ok)
				return yield* new FetchError({
					url: url.toString(),
					reason: `HTTP ${response.status}`,
				});
			const type = response.headers.get("content-type") ?? "";
			if (!type.includes("html")) return { url, html: "" };
			const html = yield* Effect.tryPromise({
				try: () => readLimited(response),
				catch: (error) =>
					new FetchError({ url: url.toString(), reason: String(error) }),
			});
			return { url, html };
		}
		return yield* new FetchError({
			url: start.toString(),
			reason: "too many redirects",
		});
	});

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
	};
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

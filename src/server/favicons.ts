import { Effect } from "effect";
import { fetchBytes, fetchText, iconCandidates } from "./metadata";

/*
 * Site icons, found by tabz itself and served from its own origin:
 *
 *   1. touch icons (declared by the home page, then /apple-touch-icon.png):
 *      opaque, so they read on any theme;
 *   2. the icon seen when the link was saved, the page's other icons (SVG,
 *      PNG), then /favicon.ico;
 *   3. Google's and DuckDuckGo's icon services, which answer 404 when they
 *      don't know a site (the old endpoint sent a generic globe instead,
 *      which is why so many links looked iconless).
 *
 * Serving the bytes ourselves also gets around sites that forbid embedding
 * their icons elsewhere (Cross-Origin-Resource-Policy) or only serve them over
 * http, and keeps the list of sites you've saved away from third parties.
 */

export type Icon = { body: Uint8Array; type: string };

const FOUND_FOR = 7 * 86_400_000;
const MISSING_FOR = 12 * 3_600_000;
const MAX_CACHED_BYTES = 40 * 1024 * 1024;
const HTML = "text/html,application/xhtml+xml";
const IMAGE =
	"image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5";

const cache = new Map<string, { at: number; icon: Icon | null }>();
const pending = new Map<string, Promise<Icon | null>>();
let cachedBytes = 0;

/** What the bytes really are (servers often mislabel icons); null if not an image. */
export function sniffImage(body: Uint8Array): string | null {
	if (body.byteLength < 67) return null;
	const at = (index: number, ...bytes: number[]) =>
		bytes.every((byte, offset) => body[index + offset] === byte);
	if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
	if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
	if (at(0, 0x47, 0x49, 0x46)) return "image/gif";
	if (at(0, 0x00, 0x00, 0x01, 0x00)) return "image/x-icon";
	if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50))
		return "image/webp";
	const head = new TextDecoder()
		.decode(body.subarray(0, 1024))
		.trimStart()
		.toLowerCase();
	if (
		head.startsWith("<svg") ||
		(head.startsWith("<?xml") && head.includes("<svg"))
	)
		return "image/svg+xml";
	return null;
}

/** An inline icon (data:image/svg+xml,… or data:image/png;base64,…). */
function decodeDataUrl(url: string): Uint8Array | null {
	const match = url.match(/^data:([^,]*?)(;base64)?,(.*)$/s);
	if (!match || url.length > 400_000) return null;
	try {
		return match[2]
			? new Uint8Array(Buffer.from(match[3], "base64"))
			: new TextEncoder().encode(decodeURIComponent(match[3]));
	} catch {
		return null;
	}
}

const tryIcon = (url: string) => {
	if (url.startsWith("data:")) {
		const body = decodeDataUrl(url);
		const type = body ? sniffImage(body) : null;
		return Effect.succeed(body && type ? { body, type } : null);
	}
	return fetchBytes(new URL(url), IMAGE).pipe(
		Effect.timeout("5 seconds"),
		Effect.map(({ body }) => {
			const type = sniffImage(body);
			return type ? { body, type } : null;
		}),
		Effect.catch(() => Effect.succeed(null)),
	);
};

const isThirdPartyService = (url: string) =>
	/(^|\.)google\.com\/s2\/|gstatic\.com\/favicon|icons\.duckduckgo\.com/i.test(
		url,
	);

const resolve = (scope: URL, hint?: string) =>
	Effect.gen(function* () {
		const page = yield* fetchText(scope, HTML, /html/i).pipe(
			Effect.timeout("5 seconds"),
			Effect.catch(() => Effect.succeed(null)),
		);
		const declared = (page?.body ? iconCandidates(page.body) : [])
			.slice(0, 5)
			.flatMap(({ href, touch }) => {
				try {
					return [{ url: new URL(href, page?.url).toString(), touch }];
				} catch {
					return [];
				}
			});
		const touchIcons = declared
			.filter((icon) => icon.touch)
			.map((icon) => icon.url);
		const otherIcons = declared
			.filter((icon) => !icon.touch)
			.map((icon) => icon.url);
		const savedHint =
			hint && /^https?:\/\//i.test(hint) && !isThirdPartyService(hint)
				? [hint]
				: [];
		const at = (path: string, base: URL) => new URL(path, base).toString();
		const root = new URL("/", scope);
		const services = [
			`https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=128&url=${encodeURIComponent(scope.toString())}`,
			`https://icons.duckduckgo.com/ip3/${scope.hostname}.ico`,
		];
		const candidates =
			scope.pathname === "/"
				? [
						// Opaque touch icons first (declared, then the conventional path
						// most sites have even when undeclared): they read on light and
						// dark themes, unlike black SVG favicons made for a light tab bar.
						...touchIcons,
						at("apple-touch-icon.png", root),
						...savedHint,
						...otherIcons,
						at("favicon.ico", root),
						...services,
					]
				: [
						// A project site under a shared host (you.github.io/Game/): its
						// own icons come first, the host's root ones only as a fallback.
						...touchIcons,
						...otherIcons,
						...savedHint,
						at("apple-touch-icon.png", scope),
						at("favicon.ico", scope),
						at("apple-touch-icon.png", root),
						at("favicon.ico", root),
						...services,
					];
		for (const url of [...new Set(candidates)]) {
			const icon = yield* tryIcon(url);
			if (icon) return icon;
		}
		return null;
	});

function remember(host: string, icon: Icon | null) {
	if (cachedBytes > MAX_CACHED_BYTES) {
		cache.clear();
		cachedBytes = 0;
	}
	cache.set(host, { at: Date.now(), icon });
	cachedBytes += icon?.body.byteLength ?? 0;
}

/** The icon for a site (by origin), from cache or freshly found. */
export async function siteIcon(origin: URL, hint?: string) {
	// `origin` is an icon scope: an origin, or origin + project path.
	// The scope: origin (lowercased host) plus any project path, e.g.
	// "you.github.io/Game/" (paths are case-sensitive on GitHub Pages).
	const host = `${origin.host.toLowerCase()}${origin.pathname}`;
	const hit = cache.get(host);
	if (hit && Date.now() - hit.at < (hit.icon ? FOUND_FOR : MISSING_FOR))
		return { icon: hit.icon, cached: true };
	let lookup = pending.get(host);
	if (!lookup) {
		lookup = Effect.runPromise(resolve(origin, hint)).finally(() =>
			pending.delete(host),
		);
		pending.set(host, lookup);
	}
	const icon = await lookup;
	remember(host, icon);
	return { icon, cached: false };
}

/* Uncached lookups per client per minute (cache hits are free). */
const recent = new Map<string, number[]>();
const LOOKUPS_PER_MINUTE = 120;

export function allowLookup(client: string, origin: URL) {
	const hit = cache.get(`${origin.host.toLowerCase()}${origin.pathname}`);
	if (hit) return true;
	const now = Date.now();
	const times = (recent.get(client) ?? []).filter((at) => now - at < 60_000);
	if (times.length >= LOOKUPS_PER_MINUTE) return false;
	times.push(now);
	if (recent.size > 5000) recent.clear();
	recent.set(client, times);
	return true;
}

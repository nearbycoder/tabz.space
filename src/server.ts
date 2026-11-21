import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { createBrotliCompress, constants as zlibConstants } from "node:zlib";
import {
	createServerEntry,
	createStartHandler,
	defaultStreamHandler,
} from "@tanstack/react-start/server";
import {
	getRequestSession,
	getRequestVault,
	withRequestCache,
} from "#/server/runtime";

/*
 * Custom server entry: the default TanStack Start handler, plus security
 * headers and on-the-fly Brotli/gzip for HTML and data responses (Railway
 * doesn't compress). Static assets are pre-compressed at build time
 * (compressPublicAssets in vite.config.ts).
 * The body is streamed through compression, so SSR streaming still works.
 */

const handler = createStartHandler(defaultStreamHandler);

const COMPRESSIBLE =
	/text\/|application\/(json|javascript|xml|x-ndjson)|\+json|\+xml|image\/svg/i;
const MIN_COMPRESS_BYTES = 1024;

const SECURITY_HEADERS = {
	"x-content-type-options": "nosniff",
	// Sites you open from tabz see only "tabz.space", never the page path
	// (a public board's link would otherwise leak to every site it links to).
	"referrer-policy": "strict-origin-when-cross-origin",
	// No framing: stops clickjacking of the vault, settings and OAuth consent.
	"x-frame-options": "DENY",
	"content-security-policy":
		"frame-ancestors 'none'; base-uri 'self'; object-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com",
	"permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

/** Pages that are reachable by link but shouldn't end up in search results. */
const NO_INDEX = /^\/(b|add|consent|api)(\/|$)/;

function secure(url: URL, response: Response) {
	const headers = new Headers(response.headers);
	for (const [name, value] of Object.entries(SECURITY_HEADERS))
		if (!headers.has(name)) headers.set(name, value);
	if (process.env.NODE_ENV === "production")
		headers.set("strict-transport-security", "max-age=31536000");
	if (NO_INDEX.test(url.pathname))
		headers.set("x-robots-tag", "noindex, nofollow");
	// Pages and data are per-user: never let a shared cache keep them.
	const type = headers.get("content-type") ?? "";
	if (
		!headers.has("cache-control") &&
		(type.includes("text/html") || url.pathname.startsWith("/_serverFn"))
	)
		headers.set("cache-control", "private, no-cache");
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

/*
 * Tells the service worker (public/sw.js) whether this render of the home page
 * may be kept for instant new tabs: never while the vault is unlocked (the
 * page would show it), and forgotten once signed out. The viewer hash lets it
 * notice a different account.
 */
async function offlineHeaders(request: Request) {
	const session = await getRequestSession(request.headers);
	if (!session) return { "x-tabz-offline": "clear", "x-tabz-viewer": "" };
	const vault = await getRequestVault(request.headers, session.user.id);
	return {
		"x-tabz-offline": vault ? "keep" : "1",
		"x-tabz-viewer": createHash("sha256")
			.update(session.user.id)
			.digest("hex")
			.slice(0, 16),
	};
}

function compress(request: Request, response: Response) {
	if (
		request.method === "HEAD" ||
		response.status === 204 ||
		response.status === 304 ||
		!response.body ||
		response.headers.has("content-encoding") ||
		!COMPRESSIBLE.test(response.headers.get("content-type") ?? "")
	)
		return response;
	const length = Number(response.headers.get("content-length"));
	if (Number.isFinite(length) && length > 0 && length < MIN_COMPRESS_BYTES)
		return response;
	const accept = request.headers.get("accept-encoding") ?? "";
	const useBr = /\bbr\b/.test(accept);
	const useGzip = !useBr && /\bgzip\b/.test(accept);
	if (!useBr && !useGzip) return response;

	const headers = new Headers(response.headers);
	headers.set("content-encoding", useBr ? "br" : "gzip");
	headers.delete("content-length");
	headers.append("vary", "accept-encoding");
	let body: ReadableStream;
	if (useBr) {
		const source = Readable.fromWeb(response.body as never);
		const brotli = createBrotliCompress({
			params: {
				// Quality 4 is fast enough for live SSR streaming while beating gzip.
				[zlibConstants.BROTLI_PARAM_QUALITY]: 4,
			},
		});
		source.on("error", (err) => brotli.destroy(err));
		brotli.on("close", () => {
			if (!source.destroyed) source.destroy();
		});
		source.pipe(brotli);
		body = Readable.toWeb(brotli) as ReadableStream;
	} else {
		body = response.body.pipeThrough(new CompressionStream("gzip"));
	}
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export default createServerEntry({
	fetch(request, ...rest) {
		return withRequestCache(async () => {
			const url = new URL(request.url);
			const trackOffline =
				request.method === "GET" &&
				(url.pathname === "/" ||
					url.pathname === "/read" ||
					url.pathname.startsWith("/read/"));
			const [response, offline] = await Promise.all([
				handler(request, ...rest),
				trackOffline ? offlineHeaders(request) : null,
			]);
			const secured = secure(url, response);
			if (offline && secured.headers.get("content-type")?.includes("text/html"))
				for (const [name, value] of Object.entries(offline))
					secured.headers.set(name, value);
			return compress(request, secured);
		});
	},
});

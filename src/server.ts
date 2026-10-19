import {
	createServerEntry,
	createStartHandler,
	defaultStreamHandler,
} from "@tanstack/react-start/server";

/*
 * Custom server entry: the default TanStack Start handler, plus security
 * headers and on-the-fly gzip for HTML and data responses (Railway doesn't
 * compress). Static assets are pre-compressed at build time
 * (compressPublicAssets in vite.config.ts).
 * The body is piped through CompressionStream, so SSR streaming still works.
 */

const handler = createStartHandler(defaultStreamHandler);

const COMPRESSIBLE =
	/text\/|application\/(json|javascript|xml|x-ndjson)|\+json|\+xml|image\/svg/i;

const SECURITY_HEADERS = {
	"x-content-type-options": "nosniff",
	// Sites you open from tabz see only "tabz.space", never the page path
	// (a public board's link would otherwise leak to every site it links to).
	"referrer-policy": "strict-origin-when-cross-origin",
	// No framing: stops clickjacking of the vault, settings and OAuth consent.
	"x-frame-options": "DENY",
	"content-security-policy":
		"frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
	"permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

/** Pages that are reachable by link but shouldn't end up in search results. */
const NO_INDEX = /^\/(b|add|consent|api)(\/|$)/;

function secure(request: Request, response: Response) {
	const headers = new Headers(response.headers);
	for (const [name, value] of Object.entries(SECURITY_HEADERS))
		if (!headers.has(name)) headers.set(name, value);
	const url = new URL(request.url);
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

function compress(request: Request, response: Response) {
	if (
		!response.body ||
		response.headers.has("content-encoding") ||
		!COMPRESSIBLE.test(response.headers.get("content-type") ?? "") ||
		!/\bgzip\b/.test(request.headers.get("accept-encoding") ?? "")
	)
		return response;
	const headers = new Headers(response.headers);
	headers.set("content-encoding", "gzip");
	headers.delete("content-length");
	headers.append("vary", "accept-encoding");
	return new Response(
		response.body.pipeThrough(new CompressionStream("gzip")),
		{
			status: response.status,
			statusText: response.statusText,
			headers,
		},
	);
}

export default createServerEntry({
	async fetch(request, ...rest) {
		const response = await handler(request, ...rest);
		return compress(request, secure(request, response));
	},
});

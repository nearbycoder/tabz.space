import { createHash } from "node:crypto";
import {
	createServerEntry,
	createStartHandler,
	defaultStreamHandler,
} from "@tanstack/react-start/server";
import { auth } from "#/lib/auth";
import {
	cookieValue,
	readVaultToken,
	VAULT_COOKIE,
} from "#/server/vault-token";

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

/*
 * Tells the service worker (public/sw.js) whether this render of the home page
 * may be kept for instant new tabs: never while the vault is unlocked (the
 * page would show it), and forgotten once signed out. The viewer hash lets it
 * notice a different account.
 */
async function offlineHeaders(request: Request) {
	const session = await auth.api
		.getSession({ headers: request.headers })
		.catch(() => null);
	if (!session) return { "x-tabz-offline": "clear", "x-tabz-viewer": "" };
	const vault = await readVaultToken(
		cookieValue(request.headers, VAULT_COOKIE),
		session.user.id,
	);
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
		const home =
			request.method === "GET" && new URL(request.url).pathname === "/";
		const [response, offline] = await Promise.all([
			handler(request, ...rest),
			home ? offlineHeaders(request) : null,
		]);
		const secured = secure(request, response);
		if (offline && secured.headers.get("content-type")?.includes("text/html"))
			for (const [name, value] of Object.entries(offline))
				secured.headers.set(name, value);
		return compress(request, secured);
	},
});

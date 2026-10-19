import {
	createServerEntry,
	createStartHandler,
	defaultStreamHandler,
} from "@tanstack/react-start/server";

/*
 * Custom server entry: the default TanStack Start handler, plus on-the-fly
 * gzip for HTML and data responses (Railway doesn't compress). Static assets
 * are pre-compressed at build time (compressPublicAssets in vite.config.ts).
 * The body is piped through CompressionStream, so SSR streaming still works.
 */

const handler = createStartHandler(defaultStreamHandler);

const COMPRESSIBLE =
	/text\/|application\/(json|javascript|xml|x-ndjson)|\+json|\+xml|image\/svg/i;

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
		return compress(request, response);
	},
});

import { createFileRoute } from "@tanstack/react-router";
import * as library from "#/server/library";
import { runAuthed } from "#/server/runtime";

const isSameOrigin = (request: Request) => {
	const fetchSite = request.headers.get("sec-fetch-site");
	if (fetchSite === "cross-site") return false;
	const origin = request.headers.get("origin");
	if (origin && origin !== new URL(request.url).origin) return false;
	return true;
};

/**
 * POST /api/visit {"id": "<bookmark id>"}: records that a link was opened.
 * Sent with navigator.sendBeacon, which survives the page unloading as the
 * link opens (a normal request can be cancelled mid-flight).
 */
export const Route = createFileRoute("/api/visit")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				if (!isSameOrigin(request)) return new Response(null, { status: 403 });
				const body = (await request.json().catch(() => null)) as {
					id?: unknown;
				} | null;
				const parsed = library.idInput.safeParse(body);
				if (!parsed.success) return new Response(null, { status: 400 });
				try {
					await runAuthed((user) => library.recordVisit(user.id, parsed.data));
					return new Response(null, { status: 204 });
				} catch {
					return new Response(null, { status: 404 });
				}
			},
		},
	},
});

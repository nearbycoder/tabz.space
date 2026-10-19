import { createFileRoute } from "@tanstack/react-router";
import * as library from "#/server/library";
import { runAuthed } from "#/server/runtime";

/**
 * POST /api/visit {"id": "<bookmark id>"}: records that a link was opened.
 * Sent with navigator.sendBeacon, which survives the page unloading as the
 * link opens (a normal request can be cancelled mid-flight).
 */
export const Route = createFileRoute("/api/visit")({
	server: {
		handlers: {
			POST: async ({ request }) => {
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

import { createFileRoute } from "@tanstack/react-router";
import { handleInboundEmail, secretEqual } from "#/server/channels";
import { runServer } from "#/server/runtime";

/** Inbound email webhook: POST /api/channels/email?secret=INBOUND_EMAIL_SECRET */
export const Route = createFileRoute("/api/channels/email")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const expected = process.env.INBOUND_EMAIL_SECRET;
				const given =
					new URL(request.url).searchParams.get("secret") ??
					request.headers.get("x-tabz-secret");
				if (!secretEqual(given, expected))
					return new Response("Forbidden", { status: 403 });
				const body = await request.json().catch(() => null);
				if (!body || typeof body !== "object")
					return new Response("Bad Request", { status: 400 });
				const result = await runServer(
					handleInboundEmail(body as Record<string, unknown>),
				).catch(() => ({ saved: 0 }));
				return Response.json(result);
			},
		},
	},
});

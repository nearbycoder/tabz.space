import { createFileRoute } from "@tanstack/react-router";
import { handleInboundEmail } from "#/server/channels";
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
				if (!expected || given !== expected)
					return new Response("Forbidden", { status: 403 });
				const result = await runServer(
					handleInboundEmail(await request.json()),
				).catch(() => ({ saved: 0 }));
				return Response.json(result);
			},
		},
	},
});

import { createFileRoute } from "@tanstack/react-router";
import { handleTelegram, secretEqual } from "#/server/channels";
import { runServer } from "#/server/runtime";

/** Telegram bot webhook (registered automatically when the bot is configured). */
export const Route = createFileRoute("/api/channels/telegram")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
				if (
					!secretEqual(
						request.headers.get("x-telegram-bot-api-secret-token"),
						expected,
					)
				)
					return new Response("Forbidden", { status: 403 });
				const body = await request.json().catch(() => null);
				if (!body || typeof body !== "object")
					return new Response("Bad Request", { status: 400 });
				await runServer(handleTelegram(body)).catch(() => {});
				return new Response("ok");
			},
		},
	},
});

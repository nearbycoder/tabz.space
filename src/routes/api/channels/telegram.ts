import { createFileRoute } from "@tanstack/react-router";
import { handleTelegram } from "#/server/channels";
import { runServer } from "#/server/runtime";

/** Telegram bot webhook (registered automatically when the bot is configured). */
export const Route = createFileRoute("/api/channels/telegram")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
				if (
					!expected ||
					request.headers.get("x-telegram-bot-api-secret-token") !== expected
				)
					return new Response("Forbidden", { status: 403 });
				await runServer(handleTelegram(await request.json())).catch(() => {});
				return new Response("ok");
			},
		},
	},
});

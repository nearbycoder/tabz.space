import { createHmac, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { integrations } from "#/db/schema";
import { FetchError, InvalidInput } from "#/lib/effect/errors";
import { extractUrls } from "#/lib/url";
import { smartAdd } from "./capture";
import { query } from "./runtime";

/*
 * Save links from outside tabz: message a Telegram bot, or forward/email links
 * to a personal address. Both are off until the server is configured:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET
 *   INBOUND_EMAIL_DOMAIN, INBOUND_EMAIL_SECRET
 * Saved links land in an "Inbox" group on the user's active board.
 */

const INBOX = "Inbox";
const secret = () =>
	process.env.BETTER_AUTH_SECRET ?? "tabz-space-dev-secret-change-me";

export const channelFeatures = () => ({
	telegram: Boolean(
		process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME,
	),
	email: Boolean(
		process.env.INBOUND_EMAIL_DOMAIN && process.env.INBOUND_EMAIL_SECRET,
	),
});

/** Saves every URL in a message; returns what was saved. */
const saveAll = (userId: string, text: string) =>
	Effect.forEach(
		extractUrls(text).slice(0, 10),
		(url) =>
			smartAdd(userId, { url, group: INBOX }).pipe(
				Effect.map((bookmark) => bookmark.title),
				Effect.catch(() => Effect.succeed(null)),
			),
		{ concurrency: 3 },
	).pipe(
		Effect.map((titles) =>
			titles.filter((title): title is string => title !== null),
		),
	);

export const listChannels = (userId: string) =>
	Effect.gen(function* () {
		const rows = yield* query((db) =>
			db.select().from(integrations).where(eq(integrations.userId, userId)),
		);
		const email = rows.find((row) => row.kind === "email");
		return {
			features: channelFeatures(),
			telegram: rows
				.filter((row) => row.kind === "telegram")
				.map((row) => ({ id: row.id, label: row.label })),
			email:
				email && process.env.INBOUND_EMAIL_DOMAIN
					? `save-${email.externalId}@${process.env.INBOUND_EMAIL_DOMAIN}`
					: null,
		};
	});

export const removeChannel = (userId: string, id: string) =>
	query((db) =>
		db
			.delete(integrations)
			.where(and(eq(integrations.id, id), eq(integrations.userId, userId))),
	).pipe(Effect.as({ ok: true }));

/* --------------------------------- telegram --------------------------------- */

const sign = (value: string) =>
	createHmac("sha256", secret())
		.update(`telegram:${value}`)
		.digest("hex")
		.slice(0, 16);

/** Deep link that connects a chat to this account (valid for an hour). */
export const telegramLink = (userId: string) =>
	Effect.gen(function* () {
		if (!channelFeatures().telegram)
			return yield* new InvalidInput({
				message: "Telegram isn't set up on this server",
			});
		const expires = Math.floor(Date.now() / 1000 + 3600).toString(36);
		const payload = `${userId}_${expires}`;
		return {
			url: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${payload}_${sign(payload)}`,
		};
	});

const readStartCode = (code: string) => {
	const parts = code.split("_");
	if (parts.length !== 3) return null;
	const [userId, expires, signature] = parts;
	if (sign(`${userId}_${expires}`) !== signature) return null;
	if (Number.parseInt(expires, 36) * 1000 < Date.now()) return null;
	return userId;
};

const telegram = (method: string, body: Record<string, unknown>) =>
	Effect.tryPromise({
		try: async (signal) => {
			const response = await fetch(
				`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
				{
					method: "POST",
					signal,
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
				},
			);
			return response.json();
		},
		catch: (error) =>
			new FetchError({ url: `telegram:${method}`, reason: String(error) }),
	}).pipe(Effect.timeout("10 seconds"));

const reply = (chatId: number, text: string) =>
	telegram("sendMessage", { chat_id: chatId, text }).pipe(Effect.ignore);

type TelegramUpdate = {
	message?: {
		chat: { id: number; first_name?: string; username?: string };
		text?: string;
		caption?: string;
		entities?: { type: string; url?: string }[];
	};
};

/** Handles a webhook update from Telegram. */
export const handleTelegram = (update: TelegramUpdate) =>
	Effect.gen(function* () {
		const message = update.message;
		if (!message) return;
		const chatId = message.chat.id;
		const text =
			`${message.text ?? message.caption ?? ""} ${(message.entities ?? []).map((e) => e.url ?? "").join(" ")}`.trim();
		if (text.startsWith("/start")) {
			const userId = readStartCode(text.split(/\s+/)[1] ?? "");
			if (!userId)
				return yield* reply(
					chatId,
					"Open Customize → Connect on tabz.space and tap “Connect Telegram” to link this chat.",
				);
			yield* query((db) =>
				db
					.insert(integrations)
					.values({
						userId,
						kind: "telegram",
						externalId: String(chatId),
						label: message.chat.username
							? `@${message.chat.username}`
							: message.chat.first_name,
					})
					.onConflictDoUpdate({
						target: [integrations.kind, integrations.externalId],
						set: { userId },
					}),
			);
			return yield* reply(
				chatId,
				"Connected to tabz.space ✨ Send or share any link here and it lands in your Inbox.",
			);
		}
		const link = yield* query((db) =>
			db.query.integrations.findFirst({
				where: and(
					eq(integrations.kind, "telegram"),
					eq(integrations.externalId, String(chatId)),
				),
			}),
		);
		if (!link)
			return yield* reply(
				chatId,
				"This chat isn't connected yet. Open Customize → Connect on tabz.space to link it.",
			);
		if (text.startsWith("/stop")) {
			yield* query((db) =>
				db.delete(integrations).where(eq(integrations.id, link.id)),
			);
			return yield* reply(chatId, "Disconnected. Bye 👋");
		}
		const saved = yield* saveAll(link.userId, text);
		yield* reply(
			chatId,
			saved.length
				? `Saved ✓ ${saved.join(", ")}`
				: "Send me a link (https://…) and I'll save it.",
		);
	});

/** Points Telegram at our webhook; safe to call repeatedly. */
export const registerTelegramWebhook = () =>
	channelFeatures().telegram && process.env.BETTER_AUTH_URL
		? telegram("setWebhook", {
				url: `${process.env.BETTER_AUTH_URL}/api/channels/telegram`,
				secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
				allowed_updates: ["message"],
			}).pipe(Effect.ignore)
		: Effect.void;

/* ----------------------------------- email ---------------------------------- */

/** The user's personal save-…@ address (created on first use). */
export const emailAddress = (userId: string, rotate = false) =>
	Effect.gen(function* () {
		if (!channelFeatures().email)
			return yield* new InvalidInput({
				message: "Email saving isn't set up on this server",
			});
		if (rotate)
			yield* query((db) =>
				db
					.delete(integrations)
					.where(
						and(
							eq(integrations.userId, userId),
							eq(integrations.kind, "email"),
						),
					),
			);
		const existing = yield* query((db) =>
			db.query.integrations.findFirst({
				where: and(
					eq(integrations.userId, userId),
					eq(integrations.kind, "email"),
				),
			}),
		);
		const token = existing?.externalId ?? randomBytes(6).toString("hex");
		if (!existing)
			yield* query((db) =>
				db
					.insert(integrations)
					.values({ userId, kind: "email", externalId: token }),
			);
		return { address: `save-${token}@${process.env.INBOUND_EMAIL_DOMAIN}` };
	});

/**
 * Inbound mail webhook. Accepts Postmark's JSON ({ To, Subject, TextBody })
 * or a simple { to, subject, text } (e.g. from a Cloudflare Email Worker).
 */
export const handleInboundEmail = (body: Record<string, unknown>) =>
	Effect.gen(function* () {
		const to = String(body.To ?? body.to ?? "");
		const token = to.match(/save-([a-f0-9]{12})@/i)?.[1]?.toLowerCase();
		if (!token) return { saved: 0 };
		const link = yield* query((db) =>
			db.query.integrations.findFirst({
				where: and(
					eq(integrations.kind, "email"),
					eq(integrations.externalId, token),
				),
			}),
		);
		if (!link) return { saved: 0 };
		const text = `${body.Subject ?? body.subject ?? ""}\n${body.TextBody ?? body.text ?? body.HtmlBody ?? body.html ?? ""}`;
		const saved = yield* saveAll(link.userId, text);
		return { saved: saved.length };
	});

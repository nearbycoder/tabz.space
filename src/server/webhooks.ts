import { createHmac, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Effect, Schedule } from "effect";
import { z } from "zod";
import { webhooks } from "#/db/schema";
import { InvalidInput, NotFound } from "#/lib/effect/errors";
import { assertPublicHost, publicFetch } from "./metadata";
import { query } from "./runtime";

export const WEBHOOK_EVENTS = [
	"bookmark.create",
	"bookmark.update",
	"bookmark.move",
	"bookmark.delete",
	"group.create",
	"group.update",
	"group.delete",
	"board.create",
	"board.update",
	"board.delete",
] as const;

export const createWebhookInput = z.object({
	url: z.url({ protocol: /^https$/ }).max(2048),
	events: z
		.array(z.union([z.enum(WEBHOOK_EVENTS), z.literal("*")]))
		.min(1)
		.optional(),
});

export const createWebhook = (
	userId: string,
	data: z.infer<typeof createWebhookInput>,
) =>
	Effect.gen(function* () {
		yield* assertPublicHost(new URL(data.url)).pipe(
			Effect.mapError(
				() =>
					new InvalidInput({
						message: "Webhook URL must be a public https address",
					}),
			),
		);
		const count = yield* query((db) =>
			db.$count(webhooks, eq(webhooks.userId, userId)),
		);
		if (count >= 10)
			return yield* new InvalidInput({
				message: "You can have up to 10 webhooks",
			});
		const secret = `whsec_${randomBytes(24).toString("base64url")}`;
		const [row] = yield* query((db) =>
			db
				.insert(webhooks)
				.values({ userId, url: data.url, secret, events: data.events ?? ["*"] })
				.returning(),
		);
		return row;
	});

export const listWebhooks = (userId: string) =>
	query((db) =>
		db
			.select()
			.from(webhooks)
			.where(eq(webhooks.userId, userId))
			.orderBy(desc(webhooks.createdAt)),
	);

export const deleteWebhook = (userId: string, id: string) =>
	query((db) =>
		db
			.delete(webhooks)
			.where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)))
			.returning({ id: webhooks.id }),
	).pipe(
		Effect.flatMap((rows) =>
			rows.length
				? Effect.succeed({ ok: true })
				: Effect.fail(new NotFound({ entity: "Webhook" })),
		),
	);

const deliver = (
	hook: typeof webhooks.$inferSelect,
	body: string,
	retries = 3,
) =>
	Effect.tryPromise({
		try: async (signal) => {
			// Checked again on every delivery: DNS can change after the hook was saved.
			await Effect.runPromise(assertPublicHost(new URL(hook.url)));
			const timestamp = Math.floor(Date.now() / 1000);
			const signature = createHmac("sha256", hook.secret)
				.update(`${timestamp}.${body}`)
				.digest("hex");
			const response = await publicFetch(hook.url, {
				method: "POST",
				signal,
				redirect: "manual",
				headers: {
					"content-type": "application/json",
					"user-agent": "tabz-webhooks/1.0",
					"x-tabz-timestamp": String(timestamp),
					"x-tabz-signature": `sha256=${signature}`,
				},
				body,
			});
			if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
			return response.status;
		},
		catch: (error) => error,
	}).pipe(
		Effect.timeout("10 seconds"),
		Effect.retry({
			times: retries,
			schedule: Schedule.exponential("2 seconds"),
		}),
		Effect.tap((status) =>
			query((db) =>
				db
					.update(webhooks)
					.set({ lastStatus: status, lastDeliveredAt: new Date() })
					.where(eq(webhooks.id, hook.id)),
			),
		),
		Effect.catch(() =>
			query((db) =>
				db
					.update(webhooks)
					.set({ lastStatus: 0, lastDeliveredAt: new Date() })
					.where(eq(webhooks.id, hook.id)),
			),
		),
		Effect.ignore,
	);

/** Fire-and-forget: fans an event out to the user's matching webhooks. */
export const emitEvent = (
	userId: string,
	event: string,
	payload: Record<string, unknown>,
) =>
	Effect.gen(function* () {
		const hooks = yield* query((db) =>
			db
				.select()
				.from(webhooks)
				.where(and(eq(webhooks.userId, userId), eq(webhooks.active, true))),
		);
		const matching = hooks.filter(
			(hook) => hook.events.includes("*") || hook.events.includes(event),
		);
		if (matching.length === 0) return;
		const body = JSON.stringify({
			event,
			at: new Date().toISOString(),
			...payload,
		});
		yield* Effect.forkDetach(
			Effect.forEach(matching, (hook) => deliver(hook, body), {
				concurrency: 4,
				discard: true,
			}),
		);
	}).pipe(Effect.ignore);

/** Sends a test ping to one webhook and reports the status code. */
export const testWebhook = (userId: string, id: string) =>
	Effect.gen(function* () {
		const hook = yield* query((db) =>
			db.query.webhooks.findFirst({
				where: and(eq(webhooks.id, id), eq(webhooks.userId, userId)),
			}),
		);
		if (!hook) return yield* new NotFound({ entity: "Webhook" });
		yield* deliver(
			hook,
			JSON.stringify({ event: "ping", at: new Date().toISOString() }),
			0,
		);
		const updated = yield* query((db) =>
			db.query.webhooks.findFirst({ where: eq(webhooks.id, id) }),
		);
		return { status: updated?.lastStatus ?? 0 };
	});

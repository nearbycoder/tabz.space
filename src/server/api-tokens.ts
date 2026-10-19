import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { apiTokens } from "#/db/schema";
import { NotFound, Unauthorized } from "#/lib/effect/errors";
import { query } from "./runtime";

/* Tokens look like `tabz_<43 chars>`; the database only ever sees a SHA-256 hash. */

const hash = (token: string) =>
	createHash("sha256").update(token).digest("hex");

export const createTokenInput = z.object({
	name: z.string().trim().min(1).max(60),
	kind: z.enum(["personal", "extension"]).optional(),
});

/** Returns the plaintext token exactly once. */
export const createApiToken = (
	userId: string,
	data: z.infer<typeof createTokenInput>,
) =>
	Effect.gen(function* () {
		const token = `tabz_${randomBytes(32).toString("base64url")}`;
		// Each browser gets its own extension token; keep the newest few.
		if (data.kind === "extension") {
			const stale = yield* query((db) =>
				db
					.select({ id: apiTokens.id })
					.from(apiTokens)
					.where(
						and(eq(apiTokens.userId, userId), eq(apiTokens.kind, "extension")),
					)
					.orderBy(desc(apiTokens.createdAt))
					.offset(4)
					.limit(100),
			);
			if (stale.length)
				yield* query((db) =>
					db.delete(apiTokens).where(
						inArray(
							apiTokens.id,
							stale.map((t) => t.id),
						),
					),
				);
		}
		const [row] = yield* query((db) =>
			db
				.insert(apiTokens)
				.values({
					userId,
					name: data.name,
					kind: data.kind ?? "personal",
					tokenHash: hash(token),
					prefix: token.slice(0, 12),
				})
				.returning({
					id: apiTokens.id,
					name: apiTokens.name,
					prefix: apiTokens.prefix,
					createdAt: apiTokens.createdAt,
				}),
		);
		return { ...row, token };
	});

export const listApiTokens = (userId: string) =>
	query((db) =>
		db
			.select({
				id: apiTokens.id,
				name: apiTokens.name,
				kind: apiTokens.kind,
				prefix: apiTokens.prefix,
				lastUsedAt: apiTokens.lastUsedAt,
				createdAt: apiTokens.createdAt,
			})
			.from(apiTokens)
			.where(eq(apiTokens.userId, userId))
			.orderBy(desc(apiTokens.createdAt)),
	);

export const revokeApiToken = (userId: string, id: string) =>
	query((db) =>
		db
			.delete(apiTokens)
			.where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
			.returning({ id: apiTokens.id }),
	).pipe(
		Effect.flatMap((rows) =>
			rows.length
				? Effect.succeed({ ok: true })
				: Effect.fail(new NotFound({ entity: "Token" })),
		),
	);

/** Resolves `Authorization: Bearer tabz_…` to a user id. */
export const authenticateToken = (header: string | null) =>
	Effect.gen(function* () {
		const token = header?.match(/^Bearer\s+(tabz_[\w-]+)$/i)?.[1];
		if (!token)
			return yield* new Unauthorized({
				message: "Missing or malformed API token",
			});
		const row = yield* query((db) =>
			db.query.apiTokens.findFirst({
				where: eq(apiTokens.tokenHash, hash(token)),
			}),
		);
		if (!row) return yield* new Unauthorized({ message: "Invalid API token" });
		// Throttle lastUsedAt writes to once a minute.
		if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000)
			yield* query((db) =>
				db
					.update(apiTokens)
					.set({ lastUsedAt: new Date() })
					.where(eq(apiTokens.id, row.id)),
			);
		return { userId: row.userId, kind: row.kind };
	});

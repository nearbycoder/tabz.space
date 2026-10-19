import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, setCookie } from "@tanstack/react-start/server";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { boards, groups, vaults } from "#/db/schema";
import { InvalidInput, Unauthorized } from "#/lib/effect/errors";
import { DEFAULT_BOARD_LAYOUT } from "#/lib/preferences";
import { query, runAuthed } from "./runtime";
import { VaultAccess } from "./vault-access";
import { signVaultToken, VAULT_COOKIE } from "./vault-token";

const passwordSchema = z.string().min(4, "Use at least 4 characters").max(128);
const autoLockSchema = z
	.number()
	.int()
	.min(1)
	.max(24 * 60);

/* Brute-force brake: 5 free attempts, then exponential cool-down per user. */
const failures = new Map<string, { count: number; until: number }>();

const checkThrottle = (userId: string) =>
	Effect.gen(function* () {
		const entry = failures.get(userId);
		if (entry && entry.until > Date.now()) {
			const seconds = Math.ceil((entry.until - Date.now()) / 1000);
			return yield* new InvalidInput({
				message: `Too many attempts. Try again in ${seconds}s`,
			});
		}
	});

const recordFailure = (userId: string) => {
	const count = (failures.get(userId)?.count ?? 0) + 1;
	const until =
		count >= 5
			? Date.now() + Math.min(60_000 * 2 ** (count - 5), 60 * 60_000)
			: 0;
	failures.set(userId, { count, until });
};

const findVault = (userId: string) =>
	query((db) =>
		db.query.vaults.findFirst({ where: eq(vaults.userId, userId) }),
	);

const verify = (userId: string, password: string) =>
	Effect.gen(function* () {
		yield* checkThrottle(userId);
		const vault = yield* findVault(userId);
		if (!vault)
			return yield* new InvalidInput({ message: "Set up your vault first" });
		const ok = yield* Effect.promise(() =>
			verifyPassword({ hash: vault.passwordHash, password }),
		);
		if (!ok) {
			recordFailure(userId);
			return yield* new Unauthorized({ message: "Wrong vault password" });
		}
		failures.delete(userId);
		return vault;
	});

/** First unlock gets a starter vault board so there's somewhere to put things. */
const ensureVaultBoard = (userId: string) =>
	Effect.gen(function* () {
		const existing = yield* query((db) =>
			db.query.boards.findFirst({
				where: and(eq(boards.userId, userId), eq(boards.vault, true)),
			}),
		);
		if (existing) return existing.id;
		const [board] = yield* query((db) =>
			db
				.insert(boards)
				.values({
					userId,
					name: "Private",
					icon: "🔒",
					vault: true,
					position: 999,
					layout: DEFAULT_BOARD_LAYOUT,
				})
				.returning(),
		);
		yield* query((db) =>
			db.insert(groups).values({ userId, boardId: board.id, name: "Hidden" }),
		);
		return board.id;
	});

const issueCookie = async (userId: string, minutes: number) => {
	const expiresAt = Date.now() + minutes * 60_000;
	setCookie(VAULT_COOKIE, await signVaultToken(userId, expiresAt), {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		path: "/",
		maxAge: minutes * 60,
	});
	return expiresAt;
};

export const setupVault = createServerFn({ method: "POST" })
	.validator(
		z.object({
			password: passwordSchema,
			currentPassword: z.string().max(128).optional(),
			autoLockMinutes: autoLockSchema.optional(),
		}),
	)
	.handler(async ({ data }) => {
		const result = await runAuthed((user) =>
			Effect.gen(function* () {
				const existing = yield* findVault(user.id);
				if (existing) yield* verify(user.id, data.currentPassword ?? "");
				const passwordHash = yield* Effect.promise(() =>
					hashPassword(data.password),
				);
				const autoLockMinutes =
					data.autoLockMinutes ?? existing?.autoLockMinutes ?? 15;
				yield* query((db) =>
					db
						.insert(vaults)
						.values({ userId: user.id, passwordHash, autoLockMinutes })
						.onConflictDoUpdate({
							target: vaults.userId,
							set: { passwordHash, autoLockMinutes, updatedAt: new Date() },
						}),
				);
				const boardId = yield* ensureVaultBoard(user.id);
				return { userId: user.id, autoLockMinutes, boardId };
			}),
		);
		const expiresAt = await issueCookie(result.userId, result.autoLockMinutes);
		return { expiresAt, boardId: result.boardId };
	});

export const unlockVault = createServerFn({ method: "POST" })
	.validator(z.object({ password: z.string().max(128) }))
	.handler(async ({ data }) => {
		const result = await runAuthed((user) =>
			Effect.gen(function* () {
				const vault = yield* verify(user.id, data.password);
				const boardId = yield* ensureVaultBoard(user.id);
				return {
					userId: user.id,
					autoLockMinutes: vault.autoLockMinutes,
					boardId,
				};
			}),
		);
		const expiresAt = await issueCookie(result.userId, result.autoLockMinutes);
		return { expiresAt, boardId: result.boardId };
	});

export const lockVault = createServerFn({ method: "POST" }).handler(() => {
	deleteCookie(VAULT_COOKIE, { path: "/" });
	return { ok: true };
});

export const updateVaultSettings = createServerFn({ method: "POST" })
	.validator(z.object({ autoLockMinutes: autoLockSchema }))
	.handler(({ data }) =>
		runAuthed((user) =>
			Effect.gen(function* () {
				if (!(yield* VaultAccess))
					return yield* new InvalidInput({
						message: "Unlock your vault first",
					});
				yield* query((db) =>
					db
						.update(vaults)
						.set({ autoLockMinutes: data.autoLockMinutes })
						.where(eq(vaults.userId, user.id)),
				);
				return { ok: true };
			}),
		),
	);

/** Forgot the vault password: deletes every vault board and the vault itself. */
export const resetVault = createServerFn({ method: "POST" })
	.validator(z.object({ confirm: z.literal("RESET") }))
	.handler(async () => {
		await runAuthed((user) =>
			query((db) =>
				db.transaction(async (tx) => {
					await tx
						.delete(boards)
						.where(and(eq(boards.userId, user.id), eq(boards.vault, true)));
					await tx.delete(vaults).where(eq(vaults.userId, user.id));
				}),
			),
		);
		deleteCookie(VAULT_COOKIE, { path: "/" });
		return { ok: true };
	});

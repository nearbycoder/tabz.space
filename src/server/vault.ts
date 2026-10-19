import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, setCookie } from "@tanstack/react-start/server";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { boards, bookmarks, groups, vaults } from "#/db/schema";
import { InvalidInput, Unauthorized } from "#/lib/effect/errors";
import { DEFAULT_BOARD_LAYOUT } from "#/lib/preferences";
import { sealedColumns, sealedSchema } from "./library";
import { query, runAuthed } from "./runtime";
import { VaultAccess, type VaultSlot } from "./vault-access";
import { signVaultToken, VAULT_COOKIE } from "./vault-token";

const autoLockSchema = z
	.number()
	.int()
	.min(1)
	.max(24 * 60);

const findVault = (userId: string) =>
	query((db) =>
		db.query.vaults.findFirst({ where: eq(vaults.userId, userId) }),
	);

/*
 * Brute-force brake: 5 free attempts, then an exponential cool-down (1 min,
 * doubling, up to an hour). Each attempt is counted *before* the secret is
 * checked, in one atomic update, so a burst of parallel guesses can't slip
 * past; a correct secret resets the count. Stored in the database so restarts
 * don't reset it — a 4-digit PIN only has 10,000 possibilities.
 */
const FREE_ATTEMPTS = 5;

const tooMany = (until: Date | null) =>
	new InvalidInput({
		message: `Too many attempts. Try again in ${Math.max(
			1,
			Math.ceil(((until?.getTime() ?? Date.now()) - Date.now()) / 1000),
		)}s`,
	});

const claimAttempt = (userId: string) =>
	Effect.gen(function* () {
		const now = Date.now();
		const next = sql`${vaults.failedAttempts} + 1`;
		const [claimed] = yield* query((db) =>
			db
				.update(vaults)
				.set({
					failedAttempts: next,
					lockedUntil: sql`CASE WHEN ${next} >= ${FREE_ATTEMPTS}
						THEN ${now} + min(60000 * (1 << min(${next} - ${FREE_ATTEMPTS}, 6)), 3600000)
						ELSE NULL END`,
				})
				.where(
					and(
						eq(vaults.userId, userId),
						or(
							isNull(vaults.lockedUntil),
							lte(vaults.lockedUntil, new Date(now)),
						),
					),
				)
				.returning({ userId: vaults.userId }),
		);
		if (!claimed) {
			const vault = yield* findVault(userId);
			return yield* vault
				? tooMany(vault.lockedUntil)
				: new InvalidInput({ message: "Set up your vault first" });
		}
	});

const clearAttempts = (userId: string) =>
	query((db) =>
		db
			.update(vaults)
			.set({ failedAttempts: 0, lockedUntil: null })
			.where(eq(vaults.userId, userId)),
	);

/** Checks a vault secret; returns which slot it opens (main or decoy). */
const verify = (userId: string, password: string) =>
	Effect.gen(function* () {
		yield* claimAttempt(userId);
		const vault = yield* findVault(userId);
		if (!vault)
			return yield* new InvalidInput({ message: "Set up your vault first" });
		const matches = (hash: string | null) =>
			hash
				? Effect.promise(() => verifyPassword({ hash, password }))
				: Effect.succeed(false);
		const slot: VaultSlot | null = (yield* matches(vault.passwordHash))
			? "main"
			: (yield* matches(vault.decoyHash))
				? "decoy"
				: null;
		if (!slot)
			return yield* new Unauthorized({ message: "Wrong vault password" });
		yield* clearAttempts(userId);
		return { vault, slot };
	});

const requireMain = Effect.gen(function* () {
	const access = yield* VaultAccess;
	if (access?.slot !== "main")
		return yield* new InvalidInput({ message: "Unlock your vault first" });
	return access;
});

/** First unlock gets a starter vault board so there's somewhere to put things. */
const ensureVaultBoard = (userId: string, slot: VaultSlot) =>
	Effect.gen(function* () {
		const existing = yield* query((db) =>
			db.query.boards.findFirst({
				where: and(
					eq(boards.userId, userId),
					eq(boards.vault, true),
					eq(boards.decoy, slot === "decoy"),
					isNull(boards.deletedAt),
				),
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
					decoy: slot === "decoy",
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

const issueCookie = async (
	userId: string,
	minutes: number,
	slot: VaultSlot,
	/** Keep an earlier expiry (resuming after a reload); never extends auto-lock. */
	until?: number,
) => {
	const full = Date.now() + minutes * 60_000;
	const expiresAt = until && until > Date.now() ? Math.min(until, full) : full;
	const maxAge = Math.max(1, Math.round((expiresAt - Date.now()) / 1000));
	setCookie(VAULT_COOKIE, await signVaultToken(userId, expiresAt, slot), {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		path: "/",
		maxAge,
	});
	return expiresAt;
};

const saltSchema = z.string().regex(/^[A-Za-z0-9+/=]{16,64}$/);
/** Hex auth key the browser derives from the vault password. */
const authKeySchema = z.string().regex(/^[0-9a-f]{64}$/);
const resealSchema = z
	.array(z.object({ id: z.string().max(64), sealed: sealedSchema }))
	.max(5000);

/** Writes re-encrypted contents for items in the caller's main vault boards. */
const applySealed = (userId: string, items: z.infer<typeof resealSchema>) =>
	items.length === 0
		? Effect.void
		: Effect.gen(function* () {
				const rows = yield* query((db) =>
					db
						.select({ id: bookmarks.id, kind: bookmarks.kind })
						.from(bookmarks)
						.innerJoin(groups, eq(groups.id, bookmarks.groupId))
						.innerJoin(boards, eq(boards.id, groups.boardId))
						.where(
							and(
								eq(boards.userId, userId),
								eq(boards.vault, true),
								eq(boards.decoy, false),
								inArray(
									bookmarks.id,
									items.map((item) => item.id),
								),
							),
						),
				);
				const kinds = new Map(rows.map((row) => [row.id, row.kind]));
				yield* query((db) =>
					db.transaction(async (tx) => {
						for (const item of items) {
							const kind = kinds.get(item.id);
							if (kind)
								await tx
									.update(bookmarks)
									.set(sealedColumns(item.sealed, kind))
									.where(eq(bookmarks.id, item.id));
						}
					}),
				);
			});

/** What the browser needs before deriving keys. */
export const getVaultInfo = createServerFn().handler(() =>
	runAuthed((user) =>
		findVault(user.id).pipe(
			Effect.map((vault) => ({
				configured: Boolean(vault),
				salt: vault?.kdfSalt ?? null,
				legacy: Boolean(vault && !vault.kdfSalt),
				hasDecoy: Boolean(vault?.decoyHash),
				pinLength: (vault?.pinLength ?? null) as 4 | 6 | null,
			})),
		),
	),
);

/**
 * Creates the vault, or changes its password. The browser sends a new salt and
 * auth key, plus every vault item re-encrypted with the new key.
 */
export const setupVault = createServerFn({ method: "POST" })
	.validator(
		z.object({
			authKey: authKeySchema,
			salt: saltSchema,
			currentAuthKey: z.string().max(128).optional(),
			autoLockMinutes: autoLockSchema.optional(),
			resealed: resealSchema.optional(),
			/** Unlock with a 4- or 6-digit PIN instead of a password. */
			pinLength: z
				.union([z.literal(4), z.literal(6)])
				.nullable()
				.optional(),
		}),
	)
	.handler(async ({ data }) => {
		const result = await runAuthed((user) =>
			Effect.gen(function* () {
				const existing = yield* findVault(user.id);
				if (existing) {
					const { slot } = yield* verify(user.id, data.currentAuthKey ?? "");
					if (slot !== "main")
						return yield* new Unauthorized({ message: "Wrong vault password" });
				}
				// A new key must come with every sealed item re-encrypted, or those
				// items could never be opened again.
				if (existing?.kdfSalt) {
					const sealedIds = yield* query((db) =>
						db
							.select({ id: bookmarks.id })
							.from(bookmarks)
							.innerJoin(groups, eq(groups.id, bookmarks.groupId))
							.innerJoin(boards, eq(boards.id, groups.boardId))
							.where(
								and(
									eq(boards.userId, user.id),
									eq(boards.vault, true),
									eq(boards.decoy, false),
									sql`json_extract(${bookmarks.meta}, '$.sealed') IS NOT NULL`,
								),
							),
					);
					const resealed = new Set(
						(data.resealed ?? []).map((item) => item.id),
					);
					if (sealedIds.some((row) => !resealed.has(row.id)))
						return yield* new InvalidInput({
							message:
								"Unlock your vault first so everything in it can be re-encrypted",
						});
				}
				const passwordHash = yield* Effect.promise(() =>
					hashPassword(data.authKey),
				);
				const autoLockMinutes =
					data.autoLockMinutes ?? existing?.autoLockMinutes ?? 15;
				yield* applySealed(user.id, data.resealed ?? []);
				yield* query((db) =>
					db
						.insert(vaults)
						.values({
							userId: user.id,
							passwordHash,
							kdfSalt: data.salt,
							autoLockMinutes,
							pinLength: data.pinLength ?? null,
						})
						.onConflictDoUpdate({
							target: vaults.userId,
							set: {
								passwordHash,
								kdfSalt: data.salt,
								autoLockMinutes,
								pinLength: data.pinLength ?? null,
								// A new salt changes the decoy's keys too; set it again.
								decoyHash: null,
								updatedAt: new Date(),
							},
						}),
				);
				const boardId = yield* ensureVaultBoard(user.id, "main");
				return { userId: user.id, autoLockMinutes, boardId };
			}),
		);
		const expiresAt = await issueCookie(
			result.userId,
			result.autoLockMinutes,
			"main",
		);
		return { expiresAt, boardId: result.boardId };
	});

/** `password` is the derived auth key (or the raw password for legacy vaults). */
export const unlockVault = createServerFn({ method: "POST" })
	.validator(
		z.object({
			password: z.string().max(128),
			/** Resume an earlier unlock (after a reload) until its original expiry. */
			until: z.number().int().positive().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const result = await runAuthed((user) =>
			Effect.gen(function* () {
				const { vault, slot } = yield* verify(user.id, data.password);
				const boardId = yield* ensureVaultBoard(user.id, slot);
				return {
					userId: user.id,
					autoLockMinutes: vault.autoLockMinutes,
					boardId,
					slot,
					legacy: !vault.kdfSalt,
				};
			}),
		);
		const expiresAt = await issueCookie(
			result.userId,
			result.autoLockMinutes,
			result.slot,
			data.until,
		);
		return {
			expiresAt,
			boardId: result.boardId,
			legacy: result.legacy,
		};
	});

/**
 * One-time upgrade of a pre-encryption vault: right after a legacy unlock the
 * browser derives keys, seals everything and sends the new auth key.
 */
export const upgradeVault = createServerFn({ method: "POST" })
	.validator(
		z.object({
			authKey: authKeySchema,
			salt: saltSchema,
			sealed: resealSchema,
		}),
	)
	.handler(({ data }) =>
		runAuthed((user) =>
			Effect.gen(function* () {
				yield* requireMain;
				const vault = yield* findVault(user.id);
				if (!vault || vault.kdfSalt)
					return yield* new InvalidInput({ message: "Already encrypted" });
				yield* applySealed(user.id, data.sealed);
				const passwordHash = yield* Effect.promise(() =>
					hashPassword(data.authKey),
				);
				yield* query((db) =>
					db
						.update(vaults)
						.set({ passwordHash, kdfSalt: data.salt, decoyHash: null })
						.where(eq(vaults.userId, user.id)),
				);
				return { ok: true };
			}),
		),
	);

/** Sets (or clears) the decoy password. Needs the real vault open. */
export const setDecoy = createServerFn({ method: "POST" })
	.validator(z.object({ authKey: authKeySchema.nullable() }))
	.handler(({ data }) =>
		runAuthed((user) =>
			Effect.gen(function* () {
				yield* requireMain;
				const vault = yield* findVault(user.id);
				if (!vault?.kdfSalt)
					return yield* new InvalidInput({
						message: "Set up your vault first",
					});
				if (data.authKey) {
					const sameAsMain = yield* Effect.promise(() =>
						verifyPassword({
							hash: vault.passwordHash,
							password: data.authKey as string,
						}),
					);
					if (sameAsMain)
						return yield* new InvalidInput({
							message: "Use a different password from your real vault",
						});
				}
				const decoyHash = data.authKey
					? yield* Effect.promise(() => hashPassword(data.authKey as string))
					: null;
				yield* query((db) =>
					db
						.update(vaults)
						.set({ decoyHash })
						.where(eq(vaults.userId, user.id)),
				);
				return { ok: true };
			}),
		),
	);

export const lockVault = createServerFn({ method: "POST" }).handler(() => {
	deleteCookie(VAULT_COOKIE, { path: "/" });
	return { ok: true };
});

export const updateVaultSettings = createServerFn({ method: "POST" })
	.validator(z.object({ autoLockMinutes: autoLockSchema }))
	.handler(({ data }) =>
		runAuthed((user) =>
			Effect.gen(function* () {
				yield* requireMain;
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

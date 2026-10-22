import { and, asc, eq, isNull } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { boardMembers, boards, profiles, userSettings } from "#/db/schema";
import { InvalidInput, NotFound } from "#/lib/effect/errors";
import { resolveSettings } from "#/lib/schemas";
import { createBoard, idSchema, saveSettings } from "./library";
import { query } from "./runtime";

/*
 * Profiles: separate sets of boards under one account (Personal, Work, …).
 * Nobody has any to begin with: all boards form one implicit profile. Making
 * the first extra one turns that into a real "Personal" profile, so every
 * board belongs somewhere. Vault boards stay out of it (they show in every
 * profile while the vault is open), and shared boards are placed per member.
 */

const MAX_PROFILES = 10;

const list = (userId: string) =>
	query((db) =>
		db
			.select()
			.from(profiles)
			.where(eq(profiles.userId, userId))
			.orderBy(asc(profiles.position), asc(profiles.createdAt)),
	);

const owned = (userId: string, id: string) =>
	Effect.gen(function* () {
		const profile = (yield* list(userId)).find((row) => row.id === id);
		if (!profile) return yield* new NotFound({ entity: "profile" });
		return profile;
	});

export const profileInput = z.object({
	name: z.string().trim().min(1).max(40),
	icon: z.string().max(16).nullish(),
});

/** Makes a profile with a starter board; returns both so the page can switch to it. */
export const createProfile = (
	userId: string,
	data: z.infer<typeof profileInput>,
) =>
	Effect.gen(function* () {
		const rows = yield* list(userId);
		if (rows.length >= MAX_PROFILES)
			return yield* new InvalidInput({
				message: `You can have up to ${MAX_PROFILES} profiles`,
			});
		if (rows.length === 0) {
			// Everything you have so far becomes the first profile.
			const [first] = yield* query((db) =>
				db
					.insert(profiles)
					.values({ userId, name: "Personal", icon: "🏠", position: 0 })
					.returning(),
			);
			yield* query((db) =>
				db
					.update(boards)
					.set({ profileId: first.id })
					.where(
						and(
							eq(boards.userId, userId),
							isNull(boards.profileId),
							eq(boards.vault, false),
						),
					),
			);
			yield* query((db) =>
				db
					.update(boardMembers)
					.set({ profileId: first.id })
					.where(
						and(
							eq(boardMembers.userId, userId),
							isNull(boardMembers.profileId),
						),
					),
			);
			rows.push(first);
		}
		const [profile] = yield* query((db) =>
			db
				.insert(profiles)
				.values({
					userId,
					name: data.name,
					icon: data.icon ?? null,
					position: (rows.at(-1)?.position ?? 0) + 1,
				})
				.returning(),
		);
		const { board } = yield* createBoard(userId, {
			name: "Home",
			profileId: profile.id,
		});
		return { profile, boardId: board.id };
	});

export const updateProfileInput = profileInput.partial().extend({
	id: idSchema,
});

export const updateProfile = (
	userId: string,
	data: z.infer<typeof updateProfileInput>,
) =>
	Effect.gen(function* () {
		yield* owned(userId, data.id);
		yield* query((db) =>
			db
				.update(profiles)
				.set({
					...(data.name !== undefined && { name: data.name }),
					...(data.icon !== undefined && { icon: data.icon ?? null }),
					updatedAt: new Date(),
				})
				.where(and(eq(profiles.id, data.id), eq(profiles.userId, userId))),
		);
		return { ok: true };
	});

export const deleteProfileInput = z.object({ id: idSchema });

/** Removes a profile; its boards move to the first remaining one, never deleted. */
export const deleteProfile = (
	userId: string,
	data: z.infer<typeof deleteProfileInput>,
) =>
	Effect.gen(function* () {
		const rows = yield* list(userId);
		if (!rows.some((row) => row.id === data.id))
			return yield* new NotFound({ entity: "profile" });
		const target = rows.find((row) => row.id !== data.id);
		if (!target)
			return yield* new InvalidInput({ message: "Keep at least one profile" });
		yield* query((db) =>
			db
				.update(boards)
				.set({ profileId: target.id })
				.where(and(eq(boards.userId, userId), eq(boards.profileId, data.id))),
		);
		yield* query((db) =>
			db
				.update(boardMembers)
				.set({ profileId: target.id })
				.where(
					and(
						eq(boardMembers.userId, userId),
						eq(boardMembers.profileId, data.id),
					),
				),
		);
		yield* query((db) =>
			db
				.delete(profiles)
				.where(and(eq(profiles.id, data.id), eq(profiles.userId, userId))),
		);
		const settingsRow = yield* query((db) =>
			db.query.userSettings.findFirst({
				where: eq(userSettings.userId, userId),
			}),
		);
		if (resolveSettings(settingsRow?.settings).activeProfileId === data.id)
			yield* saveSettings(userId, { activeProfileId: target.id });
		return { movedTo: target.id };
	});

export const placeBoardInput = z.object({
	boardId: idSchema,
	profileId: idSchema,
});

/** Shows a board in another profile: your own boards, or your copy of a shared one. */
export const placeBoard = (
	userId: string,
	data: z.infer<typeof placeBoardInput>,
) =>
	Effect.gen(function* () {
		yield* owned(userId, data.profileId);
		const board = yield* query((db) =>
			db.query.boards.findFirst({
				where: and(eq(boards.id, data.boardId), isNull(boards.deletedAt)),
			}),
		);
		if (!board) return yield* new NotFound({ entity: "board" });
		if (board.vault)
			return yield* new InvalidInput({
				message: "Vault boards show in every profile",
			});
		if (board.userId === userId) {
			yield* query((db) =>
				db
					.update(boards)
					.set({ profileId: data.profileId, updatedAt: new Date() })
					.where(eq(boards.id, board.id)),
			);
			return { ok: true };
		}
		const moved = yield* query((db) =>
			db
				.update(boardMembers)
				.set({ profileId: data.profileId })
				.where(
					and(
						eq(boardMembers.boardId, board.id),
						eq(boardMembers.userId, userId),
					),
				)
				.returning({ boardId: boardMembers.boardId }),
		);
		if (!moved.length) return yield* new NotFound({ entity: "board" });
		return { ok: true };
	});

import { randomBytes } from "node:crypto";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { user } from "#/db/auth-schema";
import {
	type Bookmark,
	boardMembers,
	boards,
	bookmarks,
	groups,
	userSettings,
} from "#/db/schema";
import { InvalidInput, NotFound } from "#/lib/effect/errors";
import { resolveLayout, resolveSettings } from "#/lib/preferences";
import { faviconFor } from "#/lib/url";
import {
	accessBoard,
	created,
	idSchema,
	nextPosition,
	quote,
	record,
} from "./library";
import { query } from "./runtime";

/*
 * Sharing: public read-only links (/b/<slug>) with "Copy to my tabz", and
 * collaborators (board_members) who can edit or view a board.
 * Vault boards can never be shared either way.
 */

const MAX_MEMBERS = 20;

const requireOwner = (userId: string, boardId: string) =>
	Effect.gen(function* () {
		const { board, role } = yield* accessBoard(userId, boardId);
		if (role !== "owner")
			return yield* new InvalidInput({
				message: "Only the board's owner can do that",
			});
		if (board.vault)
			return yield* new InvalidInput({
				message: "Vault boards can't be shared",
			});
		return board;
	});

/* --------------------------------- public link -------------------------------- */

export const setPublicInput = z.object({ id: idSchema, public: z.boolean() });

export const setPublic = (
	userId: string,
	data: z.infer<typeof setPublicInput>,
) =>
	Effect.gen(function* () {
		const board = yield* requireOwner(userId, data.id);
		const shareSlug = data.public
			? (board.shareSlug ?? randomBytes(8).toString("base64url"))
			: null;
		yield* query((db) =>
			db.update(boards).set({ shareSlug }).where(eq(boards.id, board.id)),
		);
		return { shareSlug };
	});

type PublicItem = {
	kind: "link" | "folder";
	title: string;
	url: string;
	description: string | null;
	icon: string | null;
	color: string | null;
	favicon?: string;
	image?: string;
	children: PublicItem[];
};

const publicItem = (
	row: Bookmark,
	children: PublicItem[] = [],
): PublicItem => ({
	kind: row.kind,
	title: row.title,
	url: row.url,
	description: row.description,
	icon: row.icon,
	color: row.color,
	favicon: row.meta.favicon,
	image: row.meta.image,
	children,
});

/**
 * What a visitor sees: regular groups and links only. Smart groups and
 * widgets (which could reveal other boards or private calendar links) and
 * anything marked incognito are left out.
 */
export const getPublicBoard = (slug: string) =>
	Effect.gen(function* () {
		const board = yield* query((db) =>
			db.query.boards.findFirst({
				where: and(
					eq(boards.shareSlug, slug),
					isNull(boards.deletedAt),
					eq(boards.vault, false),
				),
			}),
		);
		if (!board) return yield* new NotFound({ entity: "Board" });
		const [owner, settingsRow, groupRows, rows] = yield* query((db) =>
			Promise.all([
				db.query.user.findFirst({ where: eq(user.id, board.userId) }),
				db.query.userSettings.findFirst({
					where: eq(userSettings.userId, board.userId),
				}),
				db.query.groups.findMany({
					where: and(
						eq(groups.boardId, board.id),
						eq(groups.kind, "links"),
						isNull(groups.deletedAt),
					),
					orderBy: [asc(groups.position), asc(groups.createdAt)],
				}),
				db
					.select({ bookmark: bookmarks })
					.from(bookmarks)
					.innerJoin(groups, eq(groups.id, bookmarks.groupId))
					.where(
						and(
							eq(groups.boardId, board.id),
							isNull(bookmarks.deletedAt),
							eq(bookmarks.incognito, false),
						),
					)
					.orderBy(asc(bookmarks.position), asc(bookmarks.createdAt))
					.then((result) => result.map((row) => row.bookmark)),
			]),
		);
		const folderIds = new Set(
			rows.filter((row) => row.kind === "folder").map((row) => row.id),
		);
		const settings = resolveSettings(settingsRow?.settings);
		return {
			name: board.name,
			icon: board.icon,
			layout: resolveLayout(board.layout),
			owner:
				owner?.displayUsername || owner?.username || owner?.name || "Someone",
			appearance: {
				accent: settings.accent,
				background: settings.background,
				font: settings.font,
				theme: settings.theme,
			},
			groups: groupRows.map((group) => ({
				name: group.name,
				color: group.color,
				tileStyle: group.options.tileStyle,
				items: rows
					.filter((row) => row.groupId === group.id && !row.parentId)
					.map((row) =>
						publicItem(
							row,
							rows
								.filter(
									(child) => child.parentId === row.id && folderIds.has(row.id),
								)
								.map((child) => publicItem(child)),
						),
					),
			})),
		};
	});

export type PublicBoard = Effect.Success<ReturnType<typeof getPublicBoard>>;

export const copyPublicInput = z.object({ slug: z.string().min(4).max(32) });

/** "Copy to my tabz": clones a public board (links and folders) into your account. */
export const copyPublicBoard = (
	userId: string,
	data: z.infer<typeof copyPublicInput>,
) =>
	Effect.gen(function* () {
		const source = yield* getPublicBoard(data.slug);
		const position = yield* nextPosition(boards, eq(boards.userId, userId));
		const boardId = yield* query((db) =>
			db.transaction(async (tx) => {
				const [board] = await tx
					.insert(boards)
					.values({
						userId,
						name: source.name,
						icon: source.icon,
						position,
						layout: { ...source.layout, schedule: null },
					})
					.returning();
				for (const [groupIndex, group] of source.groups.entries()) {
					const [createdGroup] = await tx
						.insert(groups)
						.values({
							userId,
							boardId: board.id,
							name: group.name,
							color: group.color,
							position: groupIndex,
							options: group.tileStyle ? { tileStyle: group.tileStyle } : {},
						})
						.returning();
					const insert = async (
						items: PublicItem[],
						parentId: string | null,
					) => {
						for (const [index, item] of items.entries()) {
							const [row] = await tx
								.insert(bookmarks)
								.values({
									userId,
									groupId: createdGroup.id,
									parentId,
									kind: item.kind,
									title: item.title,
									url: item.url,
									description: item.description,
									icon: item.icon,
									color: item.color,
									position: index,
									meta:
										item.kind === "link"
											? {
													favicon: item.favicon ?? faviconFor(item.url),
													image: item.image,
												}
											: {},
								})
								.returning({ id: bookmarks.id });
							if (item.kind === "folder") await insert(item.children, row.id);
						}
					};
					await insert(group.items, null);
				}
				return board.id;
			}),
		);
		yield* record(userId, "create", `Copied board ${quote(source.name)}`, [
			created("boards", boardId),
		]);
		return { boardId };
	});

/* -------------------------------- collaborators ------------------------------- */

const person = {
	id: user.id,
	name: user.name,
	username: user.username,
	image: user.image,
};

export const listMembers = (userId: string, boardId: string) =>
	Effect.gen(function* () {
		const { board, role } = yield* accessBoard(userId, boardId);
		const [owner, members] = yield* query((db) =>
			Promise.all([
				db.select(person).from(user).where(eq(user.id, board.userId)).get(),
				db
					.select({ ...person, role: boardMembers.role })
					.from(boardMembers)
					.innerJoin(user, eq(user.id, boardMembers.userId))
					.where(eq(boardMembers.boardId, board.id))
					.orderBy(asc(boardMembers.createdAt)),
			]),
		);
		return {
			you: role,
			shareSlug: role === "owner" ? board.shareSlug : null,
			owner,
			members,
		};
	});

export const inviteInput = z.object({
	boardId: idSchema,
	/** Username or email of an existing tabz account. */
	who: z.string().trim().min(2).max(120),
	role: z.enum(["editor", "viewer"]),
});

export const inviteMember = (
	userId: string,
	data: z.infer<typeof inviteInput>,
) =>
	Effect.gen(function* () {
		const board = yield* requireOwner(userId, data.boardId);
		const who = data.who.replace(/^@/, "").toLowerCase();
		const invitee = yield* query((db) =>
			db.query.user.findFirst({
				where: or(eq(user.username, who), eq(sql`lower(${user.email})`, who)),
			}),
		);
		if (!invitee)
			return yield* new NotFound({
				entity:
					"No tabz account with that username or email. They need to sign up first.",
			});
		if (invitee.id === userId)
			return yield* new InvalidInput({ message: "That's you!" });
		const count = yield* query((db) =>
			db.$count(boardMembers, eq(boardMembers.boardId, board.id)),
		);
		if (count >= MAX_MEMBERS)
			return yield* new InvalidInput({
				message: `Boards can have up to ${MAX_MEMBERS} people`,
			});
		yield* query((db) =>
			db
				.insert(boardMembers)
				.values({ boardId: board.id, userId: invitee.id, role: data.role })
				.onConflictDoUpdate({
					target: [boardMembers.boardId, boardMembers.userId],
					set: { role: data.role },
				}),
		);
		return {
			id: invitee.id,
			name: invitee.name,
			username: invitee.username,
			image: invitee.image,
			role: data.role,
		};
	});

export const memberInput = z.object({
	boardId: idSchema,
	memberId: idSchema,
	role: z.enum(["editor", "viewer"]).optional(),
});

export const updateMember = (
	userId: string,
	data: z.infer<typeof memberInput>,
) =>
	Effect.gen(function* () {
		const board = yield* requireOwner(userId, data.boardId);
		if (!data.role) return yield* new InvalidInput({ message: "Pick a role" });
		yield* query((db) =>
			db
				.update(boardMembers)
				.set({ role: data.role })
				.where(
					and(
						eq(boardMembers.boardId, board.id),
						eq(boardMembers.userId, data.memberId),
					),
				),
		);
		return { ok: true };
	});

/** The owner removes someone, or a member leaves. */
export const removeMember = (
	userId: string,
	data: z.infer<typeof memberInput>,
) =>
	Effect.gen(function* () {
		const { board, role } = yield* accessBoard(userId, data.boardId);
		if (role !== "owner" && data.memberId !== userId)
			return yield* new InvalidInput({
				message: "Only the owner can remove people",
			});
		yield* query((db) =>
			db
				.delete(boardMembers)
				.where(
					and(
						eq(boardMembers.boardId, board.id),
						eq(boardMembers.userId, data.memberId),
					),
				),
		);
		return { ok: true };
	});

/*
 * Bookmark library domain logic. Every operation is an Effect program scoped
 * to a user id, shared by the web app's server functions (home.ts) and the
 * MCP tools (mcp/tools.ts), so both surfaces enforce the same ownership rules.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import {
	type Bookmark,
	boards,
	bookmarks,
	groups,
	userSettings,
	vaults,
} from "#/db/schema";
import { InvalidInput, NotFound } from "#/lib/effect/errors";
import {
	boardLayoutSchema,
	DEFAULT_BOARD_LAYOUT,
	groupOptionsSchema,
	resolveLayout,
	resolveSettings,
	userSettingsSchema,
} from "#/lib/preferences";
import { faviconFor, normalizeUrl, titleFromUrl } from "#/lib/url";
import { fetchPageMetadata } from "./metadata";
import { query } from "./runtime";
import { STARTER_BOARD, type StarterItem } from "./seed";
import { VaultAccess } from "./vault-access";

export const idSchema = z.string().min(1).max(64);
export const colorSchema = z
	.string()
	.regex(/^#[0-9a-f]{6}$/i)
	.nullable()
	.optional();

const requireUrl = (input: string) => {
	const url = normalizeUrl(input);
	return url
		? Effect.succeed(url)
		: Effect.fail(
				new InvalidInput({ message: "That doesn't look like a valid URL" }),
			);
};

/** Fails with NotFound when a scoped delete matched nothing (wrong id or not the user's). */
const deletedOne = (entity: string) => (rows: { id: string }[]) =>
	rows.length > 0
		? Effect.succeed({ ok: true, id: rows[0].id })
		: Effect.fail(new NotFound({ entity }));

/** Ensures a row exists and belongs to the user before it is mutated. */
const owned = <T>(entity: string, row: T | undefined) =>
	row ? Effect.succeed(row) : Effect.fail(new NotFound({ entity }));

const vaultUnlocked = Effect.map(VaultAccess, (access) => access !== null);

/** A board the caller can see: owned, and not inside a locked vault. */
const visibleBoard = (userId: string, boardId: string) =>
	Effect.gen(function* () {
		const unlocked = yield* vaultUnlocked;
		const row = yield* query((db) =>
			db.query.boards.findFirst({
				where: and(eq(boards.id, boardId), eq(boards.userId, userId)),
			}),
		);
		if (!row || (row.vault && !unlocked))
			return yield* new NotFound({ entity: "Board" });
		return row;
	});

/** A group the caller can see (its board must be visible). */
const ownedGroup = (userId: string, groupId: string) =>
	Effect.gen(function* () {
		const group = yield* query((db) =>
			db.query.groups.findFirst({
				where: and(eq(groups.id, groupId), eq(groups.userId, userId)),
			}),
		).pipe(Effect.flatMap((row) => owned("Group", row)));
		yield* visibleBoard(userId, group.boardId);
		return group;
	});

const nextPosition = (
	table: typeof boards | typeof groups | typeof bookmarks,
	where: ReturnType<typeof eq>,
) =>
	query((db) =>
		db
			.select({ max: sql<number>`coalesce(max(${table.position}), -1)` })
			.from(table)
			.where(where),
	).pipe(Effect.map(([row]) => Number(row?.max ?? -1) + 1));

const seedStarterBoard = (userId: string) =>
	query((db) =>
		db.transaction(async (tx) => {
			const [board] = await tx
				.insert(boards)
				.values({
					userId,
					name: STARTER_BOARD.name,
					icon: STARTER_BOARD.icon,
					layout: STARTER_BOARD.layout,
				})
				.returning();
			for (const [groupIndex, group] of STARTER_BOARD.groups.entries()) {
				const [created] = await tx
					.insert(groups)
					.values({
						userId,
						boardId: board.id,
						name: group.name,
						color: group.color,
						position: groupIndex,
					})
					.returning();
				const insertItems = async (
					items: StarterItem[],
					parentId: string | null,
				) => {
					for (const [index, item] of items.entries()) {
						if ("folder" in item) {
							const [folder] = await tx
								.insert(bookmarks)
								.values({
									userId,
									groupId: created.id,
									kind: "folder",
									title: item.folder,
									icon: item.icon,
									url: "",
									position: index,
								})
								.returning();
							await insertItems(item.bookmarks, folder.id);
						} else {
							await tx.insert(bookmarks).values({
								userId,
								groupId: created.id,
								parentId,
								title: item.title,
								url: item.url,
								position: index,
								meta: { favicon: faviconFor(item.url) },
							});
						}
					}
				};
				await insertItems(group.bookmarks, null);
			}
		}),
	);

export const loadHome = (userId: string) =>
	Effect.gen(function* () {
		const load = query((db) =>
			Promise.all([
				db.query.boards.findMany({
					where: eq(boards.userId, userId),
					orderBy: [asc(boards.position), asc(boards.createdAt)],
				}),
				db.query.groups.findMany({
					where: eq(groups.userId, userId),
					orderBy: [asc(groups.position), asc(groups.createdAt)],
				}),
				db.query.bookmarks.findMany({
					where: eq(bookmarks.userId, userId),
					orderBy: [asc(bookmarks.position), asc(bookmarks.createdAt)],
				}),
				db.query.userSettings.findFirst({
					where: eq(userSettings.userId, userId),
				}),
			]),
		);
		let [allBoards, allGroups, allBookmarks, settingsRow] = yield* load;
		if (allBoards.length === 0) {
			yield* seedStarterBoard(userId);
			[allBoards, allGroups, allBookmarks, settingsRow] = yield* load;
		}
		// Locked vault boards (and everything in them) never leave the server.
		const access = yield* VaultAccess;
		const vault = yield* query((db) =>
			db.query.vaults.findFirst({ where: eq(vaults.userId, userId) }),
		);
		const boardRows = allBoards.filter((board) => !board.vault || access);
		const visibleBoardIds = new Set(boardRows.map((board) => board.id));
		const groupRows = allGroups.filter((group) =>
			visibleBoardIds.has(group.boardId),
		);
		const visibleGroupIds = new Set(groupRows.map((group) => group.id));
		const bookmarkRows = allBookmarks.filter((bookmark) =>
			visibleGroupIds.has(bookmark.groupId),
		);
		// Top-level items per group; folders carry their children.
		const children = new Map<string, Bookmark[]>();
		for (const row of bookmarkRows) {
			if (!row.parentId) continue;
			children.set(row.parentId, [...(children.get(row.parentId) ?? []), row]);
		}
		const tree: (Bookmark & { children: Bookmark[] })[] = bookmarkRows
			.filter((row) => !row.parentId)
			.map((row) => ({ ...row, children: children.get(row.id) ?? [] }));
		return {
			vault: {
				configured: Boolean(vault),
				unlocked: Boolean(access),
				expiresAt: access?.expiresAt ?? null,
				autoLockMinutes: vault?.autoLockMinutes ?? 15,
			},
			settings: resolveSettings(settingsRow?.settings),
			boards: boardRows.map((board) => ({
				...board,
				layout: resolveLayout(board.layout),
				groups: groupRows
					.filter((group) => group.boardId === board.id)
					.map((group) => ({
						...group,
						bookmarks: tree.filter((item) => item.groupId === group.id),
					})),
			})),
		};
	});

export const settingsInput = userSettingsSchema.partial();

export const saveSettings = (
	userId: string,
	data: z.infer<typeof settingsInput>,
) =>
	Effect.gen(function* () {
		const existing = yield* query((db) =>
			db.query.userSettings.findFirst({
				where: eq(userSettings.userId, userId),
			}),
		);
		const settings = resolveSettings({ ...existing?.settings, ...data });
		yield* query((db) =>
			db
				.insert(userSettings)
				.values({ userId: userId, settings })
				.onConflictDoUpdate({
					target: userSettings.userId,
					set: { settings, updatedAt: new Date() },
				}),
		);
		return settings;
	});

/* ---------------------------------- boards --------------------------------- */

export const createBoardInput = z.object({
	name: z.string().trim().min(1).max(60),
	icon: z.string().max(16).nullish(),
	/** Create it inside the vault (requires an unlocked vault). */
	vault: z.boolean().optional(),
});

const requireUnlocked = Effect.gen(function* () {
	if (!(yield* vaultUnlocked))
		return yield* new InvalidInput({ message: "Unlock your vault first" });
});

export const createBoard = (
	userId: string,
	data: z.infer<typeof createBoardInput>,
) =>
	Effect.gen(function* () {
		if (data.vault) yield* requireUnlocked;
		const position = yield* nextPosition(boards, eq(boards.userId, userId));
		const [board] = yield* query((db) =>
			db
				.insert(boards)
				.values({
					userId: userId,
					name: data.name,
					icon: data.icon ?? null,
					vault: data.vault ?? false,
					position,
					layout: DEFAULT_BOARD_LAYOUT,
				})
				.returning(),
		);
		const [group] = yield* query((db) =>
			db
				.insert(groups)
				.values({ userId: userId, boardId: board.id, name: "Bookmarks" })
				.returning(),
		);
		return { board, group };
	});

export const updateBoardInput = z.object({
	id: idSchema,
	name: z.string().trim().min(1).max(60).optional(),
	icon: z.string().max(16).nullish(),
	layout: boardLayoutSchema.partial().optional(),
	/** Move the board into (true) or out of (false) the vault. */
	vault: z.boolean().optional(),
});

/** Visible (non-vault) boards; at least one must always remain. */
const countVisibleBoards = (userId: string) =>
	query((db) =>
		db.$count(boards, and(eq(boards.userId, userId), eq(boards.vault, false))),
	);

export const updateBoard = (
	userId: string,
	data: z.infer<typeof updateBoardInput>,
) =>
	Effect.gen(function* () {
		const board = yield* visibleBoard(userId, data.id);
		if (data.vault !== undefined && data.vault !== board.vault) {
			yield* requireUnlocked;
			if (data.vault && (yield* countVisibleBoards(userId)) <= 1)
				return yield* new InvalidInput({
					message: "Keep at least one board outside the vault",
				});
		}
		const [updated] = yield* query((db) =>
			db
				.update(boards)
				.set({
					vault: data.vault ?? board.vault,
					name: data.name ?? board.name,
					icon: data.icon === undefined ? board.icon : data.icon,
					layout: data.layout
						? resolveLayout({ ...board.layout, ...data.layout })
						: board.layout,
				})
				.where(eq(boards.id, board.id))
				.returning(),
		);
		return updated;
	});

export const idInput = z.object({ id: idSchema });

export const deleteBoard = (userId: string, data: z.infer<typeof idInput>) =>
	Effect.gen(function* () {
		const board = yield* visibleBoard(userId, data.id);
		if (!board.vault && (yield* countVisibleBoards(userId)) <= 1)
			return yield* new InvalidInput({
				message: "You need at least one board",
			});
		return yield* query((db) =>
			db
				.delete(boards)
				.where(and(eq(boards.id, data.id), eq(boards.userId, userId)))
				.returning({ id: boards.id }),
		).pipe(Effect.flatMap(deletedOne("Board")));
	});

/** Persists a full ordering in one transaction (used by drag & drop). */
const reorder = (
	table: typeof boards | typeof groups,
	userId: string,
	ids: string[],
) =>
	query((db) =>
		db.transaction(async (tx) => {
			for (const [position, id] of ids.entries()) {
				await tx
					.update(table)
					.set({ position })
					.where(and(eq(table.id, id), eq(table.userId, userId)));
			}
		}),
	);

export const reorderInput = z.object({ ids: z.array(idSchema).max(200) });

export const reorderBoards = (
	userId: string,
	data: z.infer<typeof reorderInput>,
) => reorder(boards, userId, data.ids).pipe(Effect.as({ ok: true }));

/* ---------------------------------- groups --------------------------------- */

export const createGroupInput = z.object({
	boardId: idSchema,
	name: z.string().trim().min(1).max(60),
	color: colorSchema,
});

export const createGroup = (
	userId: string,
	data: z.infer<typeof createGroupInput>,
) =>
	Effect.gen(function* () {
		yield* visibleBoard(userId, data.boardId);
		const position = yield* nextPosition(
			groups,
			eq(groups.boardId, data.boardId),
		);
		const [group] = yield* query((db) =>
			db
				.insert(groups)
				.values({
					userId: userId,
					boardId: data.boardId,
					name: data.name,
					color: data.color ?? null,
					position,
				})
				.returning(),
		);
		return group;
	});

export const updateGroupInput = z.object({
	id: idSchema,
	name: z.string().trim().min(1).max(60).optional(),
	color: colorSchema,
	collapsed: z.boolean().optional(),
	boardId: idSchema.optional(),
	options: groupOptionsSchema.optional(),
});

export const updateGroup = (
	userId: string,
	data: z.infer<typeof updateGroupInput>,
) =>
	Effect.gen(function* () {
		const group = yield* ownedGroup(userId, data.id);
		if (data.boardId && data.boardId !== group.boardId) {
			yield* visibleBoard(userId, data.boardId);
		}
		const [updated] = yield* query((db) =>
			db
				.update(groups)
				.set({
					name: data.name ?? group.name,
					color: data.color === undefined ? group.color : data.color,
					collapsed: data.collapsed ?? group.collapsed,
					boardId: data.boardId ?? group.boardId,
					options: data.options
						? { ...group.options, ...data.options }
						: group.options,
				})
				.where(eq(groups.id, group.id))
				.returning(),
		);
		return updated;
	});

export const deleteGroup = (userId: string, data: z.infer<typeof idInput>) =>
	ownedGroup(userId, data.id).pipe(
		Effect.flatMap(() =>
			query((db) =>
				db
					.delete(groups)
					.where(and(eq(groups.id, data.id), eq(groups.userId, userId)))
					.returning({ id: groups.id }),
			),
		),
		Effect.flatMap(deletedOne("Group")),
	);

export const reorderGroups = (
	userId: string,
	data: z.infer<typeof reorderInput>,
) => reorder(groups, userId, data.ids).pipe(Effect.as({ ok: true }));

/* -------------------------------- bookmarks -------------------------------- */

const bookmarkFields = {
	title: z.string().trim().max(200).optional(),
	description: z.string().trim().max(500).nullish(),
	icon: z.string().trim().max(2048).nullish(),
	color: colorSchema,
	tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
};

export const lookupUrlInput = z.object({ url: z.string().max(2048) });

export const lookupUrl = (data: z.infer<typeof lookupUrlInput>) =>
	Effect.gen(function* () {
		const url = yield* requireUrl(data.url);
		const meta = yield* fetchPageMetadata(url);
		return {
			url,
			title: meta.title ?? titleFromUrl(url),
			description: meta.description ?? null,
			favicon: meta.favicon ?? faviconFor(url),
			image: meta.image ?? null,
			siteName: meta.siteName ?? null,
		};
	});

const ownedBookmark = (userId: string, id: string) =>
	Effect.gen(function* () {
		const bookmark = yield* query((db) =>
			db.query.bookmarks.findFirst({
				where: and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)),
			}),
		).pipe(Effect.flatMap((row) => owned("Bookmark", row)));
		yield* ownedGroup(userId, bookmark.groupId);
		return bookmark;
	});

const ownedFolder = (userId: string, id: string) =>
	ownedBookmark(userId, id).pipe(
		Effect.flatMap((row) =>
			row.kind === "folder"
				? Effect.succeed(row)
				: Effect.fail(new NotFound({ entity: "Folder" })),
		),
	);

/** Next slot at the top level of a group, or inside a folder. */
const nextSlot = (groupId: string, parentId: string | null) =>
	nextPosition(
		bookmarks,
		parentId
			? eq(bookmarks.parentId, parentId)
			: (and(
					eq(bookmarks.groupId, groupId),
					isNull(bookmarks.parentId),
				) as ReturnType<typeof eq>),
	);

const httpUrl = z.url({ protocol: /^https?$/ }).max(2048);

export const createBookmarkInput = z.object({
	groupId: idSchema,
	url: z.string().max(2048),
	/** Put it inside this folder (must be in the user's library). */
	parentId: idSchema.nullish(),
	// Preview data already discovered by a prior `lookupUrl` call.
	favicon: httpUrl.optional(),
	image: httpUrl.nullish(),
	siteName: z.string().max(200).nullish(),
	...bookmarkFields,
});

export const createBookmark = (
	userId: string,
	data: z.infer<typeof createBookmarkInput>,
) =>
	Effect.gen(function* () {
		let groupId = data.groupId;
		if (data.parentId)
			groupId = (yield* ownedFolder(userId, data.parentId)).groupId;
		else yield* ownedGroup(userId, groupId);
		const url = yield* requireUrl(data.url);
		// Only hit the network when the caller didn't already supply a title.
		const fetched = data.title ? null : yield* fetchPageMetadata(url);
		const position = yield* nextSlot(groupId, data.parentId ?? null);
		const [bookmark] = yield* query((db) =>
			db
				.insert(bookmarks)
				.values({
					userId,
					groupId,
					parentId: data.parentId ?? null,
					url,
					title: data.title || fetched?.title || titleFromUrl(url),
					description: data.description ?? fetched?.description ?? null,
					icon: data.icon ?? null,
					color: data.color ?? null,
					tags: data.tags ?? [],
					position,
					meta: {
						favicon: data.favicon ?? fetched?.favicon ?? faviconFor(url),
						siteName: data.siteName ?? fetched?.siteName,
						image: data.image ?? fetched?.image,
						...(fetched || data.favicon ? { fetchedAt: Date.now() } : {}),
					},
				})
				.returning(),
		);
		return bookmark;
	});

export const createFolderInput = z.object({
	groupId: idSchema,
	title: z.string().trim().min(1).max(60),
	icon: z.string().max(16).nullish(),
	color: colorSchema,
	/** Existing bookmarks to move into the new folder. */
	bookmarkIds: z.array(idSchema).max(200).optional(),
});

export const createFolder = (
	userId: string,
	data: z.infer<typeof createFolderInput>,
) =>
	Effect.gen(function* () {
		yield* ownedGroup(userId, data.groupId);
		const position = yield* nextSlot(data.groupId, null);
		const [folder] = yield* query((db) =>
			db
				.insert(bookmarks)
				.values({
					userId,
					groupId: data.groupId,
					kind: "folder",
					title: data.title,
					url: "",
					icon: data.icon ?? null,
					color: data.color ?? null,
					position,
				})
				.returning(),
		);
		if (data.bookmarkIds?.length) {
			yield* arrangeFolder(userId, {
				folderId: folder.id,
				ids: data.bookmarkIds,
			});
		}
		return folder;
	});

export const updateBookmarkInput = z.object({
	id: idSchema,
	url: z.string().max(2048).optional(),
	groupId: idSchema.optional(),
	/** Folder to move into, or null to move out to the group's top level. */
	parentId: idSchema.nullish(),
	...bookmarkFields,
});

export const updateBookmark = (
	userId: string,
	data: z.infer<typeof updateBookmarkInput>,
) =>
	Effect.gen(function* () {
		const bookmark = yield* ownedBookmark(userId, data.id);
		const isFolder = bookmark.kind === "folder";
		const url =
			data.url && !isFolder ? yield* requireUrl(data.url) : bookmark.url;
		let groupId = bookmark.groupId;
		let parentId = bookmark.parentId;
		if (
			data.parentId !== undefined &&
			data.parentId !== bookmark.parentId &&
			!isFolder
		) {
			parentId = data.parentId;
			if (parentId) groupId = (yield* ownedFolder(userId, parentId)).groupId;
		}
		if (data.groupId && data.groupId !== groupId && !parentId) {
			yield* ownedGroup(userId, data.groupId);
			groupId = data.groupId;
		}
		const moved =
			groupId !== bookmark.groupId || parentId !== bookmark.parentId;
		const position = moved
			? yield* nextSlot(groupId, parentId)
			: bookmark.position;
		const [updated] = yield* query((db) =>
			db.transaction(async (tx) => {
				// A folder's contents travel with it.
				if (isFolder && groupId !== bookmark.groupId) {
					await tx
						.update(bookmarks)
						.set({ groupId })
						.where(eq(bookmarks.parentId, bookmark.id));
				}
				return tx
					.update(bookmarks)
					.set({
						url,
						groupId,
						parentId,
						position,
						title: data.title || bookmark.title,
						description:
							data.description === undefined
								? bookmark.description
								: data.description,
						icon: data.icon === undefined ? bookmark.icon : data.icon,
						color: data.color === undefined ? bookmark.color : data.color,
						tags: data.tags ?? bookmark.tags,
						meta:
							url === bookmark.url
								? bookmark.meta
								: { favicon: faviconFor(url) },
					})
					.where(eq(bookmarks.id, bookmark.id))
					.returning();
			}),
		);
		return updated;
	});

export const deleteBookmarkInput = z.object({
	id: idSchema,
	/** For folders: also delete everything inside (default keeps the links). */
	withContents: z.boolean().optional(),
});

export const deleteBookmark = (
	userId: string,
	data: z.infer<typeof deleteBookmarkInput>,
) =>
	Effect.gen(function* () {
		const bookmark = yield* ownedBookmark(userId, data.id);
		if (bookmark.kind === "folder" && !data.withContents) {
			// Release the folder's links back into its group before removing it.
			const start = yield* nextSlot(bookmark.groupId, null);
			yield* query((db) =>
				db.transaction(async (tx) => {
					const inside = await tx
						.select({ id: bookmarks.id })
						.from(bookmarks)
						.where(eq(bookmarks.parentId, bookmark.id))
						.orderBy(asc(bookmarks.position));
					for (const [offset, child] of inside.entries()) {
						await tx
							.update(bookmarks)
							.set({ parentId: null, position: start + offset })
							.where(eq(bookmarks.id, child.id));
					}
				}),
			);
		}
		return yield* query((db) =>
			db
				.delete(bookmarks)
				.where(and(eq(bookmarks.id, data.id), eq(bookmarks.userId, userId)))
				.returning({ id: bookmarks.id }),
		).pipe(
			Effect.flatMap(
				deletedOne(bookmark.kind === "folder" ? "Folder" : "Bookmark"),
			),
		);
	});

/** Applies the result of a drag: each listed group gets exactly these top-level items, in order. */
export const arrangeBookmarksInput = z.object({
	groups: z
		.array(z.object({ groupId: idSchema, ids: z.array(idSchema).max(500) }))
		.min(1)
		.max(10),
});

export const arrangeBookmarks = (
	userId: string,
	data: z.infer<typeof arrangeBookmarksInput>,
) =>
	Effect.gen(function* () {
		const groupIds = data.groups.map((group) => group.groupId);
		for (const groupId of new Set(groupIds)) yield* ownedGroup(userId, groupId);
		yield* query((db) =>
			db.transaction(async (tx) => {
				for (const group of data.groups) {
					for (const [position, id] of group.ids.entries()) {
						await tx
							.update(bookmarks)
							.set({ groupId: group.groupId, parentId: null, position })
							.where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)));
						// Keep folder contents in the same group as the folder.
						await tx
							.update(bookmarks)
							.set({ groupId: group.groupId })
							.where(
								and(eq(bookmarks.parentId, id), eq(bookmarks.userId, userId)),
							);
					}
				}
			}),
		);
		return { ok: true };
	});

/** Sets a folder's exact contents order; ids from elsewhere are moved in. Folders can't nest. */
export const arrangeFolderInput = z.object({
	folderId: idSchema,
	ids: z.array(idSchema).max(500),
});

export const arrangeFolder = (
	userId: string,
	data: z.infer<typeof arrangeFolderInput>,
) =>
	Effect.gen(function* () {
		const folder = yield* ownedFolder(userId, data.folderId);
		yield* query((db) =>
			db.transaction(async (tx) => {
				for (const [position, id] of data.ids.entries()) {
					await tx
						.update(bookmarks)
						.set({ groupId: folder.groupId, parentId: folder.id, position })
						.where(
							and(
								eq(bookmarks.id, id),
								eq(bookmarks.userId, userId),
								eq(bookmarks.kind, "link"),
							),
						);
				}
			}),
		);
		return { ok: true };
	});

/** Re-fetches a link's title/description/preview image, e.g. for the hover preview. */
export const refreshPreview = (userId: string, data: z.infer<typeof idInput>) =>
	Effect.gen(function* () {
		const bookmark = yield* ownedBookmark(userId, data.id);
		if (bookmark.kind === "folder") return bookmark;
		const meta = yield* fetchPageMetadata(bookmark.url);
		const [updated] = yield* query((db) =>
			db
				.update(bookmarks)
				.set({
					description: bookmark.description ?? meta.description ?? null,
					meta: {
						...bookmark.meta,
						favicon:
							meta.favicon ?? bookmark.meta.favicon ?? faviconFor(bookmark.url),
						siteName: meta.siteName ?? bookmark.meta.siteName,
						image: meta.image ?? bookmark.meta.image,
						fetchedAt: Date.now(),
					},
					updatedAt: sql`${bookmarks.updatedAt}`,
				})
				.where(eq(bookmarks.id, bookmark.id))
				.returning(),
		);
		return updated;
	});

export const recordVisit = (userId: string, data: z.infer<typeof idInput>) =>
	query((db) =>
		db
			.update(bookmarks)
			.set({
				visitCount: sql`${bookmarks.visitCount} + 1`,
				lastVisitedAt: new Date(),
				updatedAt: sql`${bookmarks.updatedAt}`,
			})
			.where(and(eq(bookmarks.id, data.id), eq(bookmarks.userId, userId))),
	).pipe(Effect.as({ ok: true }));

/** Imports a parsed browser bookmark export as a new board. */
export const importBookmarksInput = z.object({
	boardName: z.string().trim().min(1).max(60),
	groups: z
		.array(
			z.object({
				name: z.string().trim().min(1).max(60),
				bookmarks: z
					.array(
						z.object({
							title: z.string().max(200),
							url: z.string().max(2048),
						}),
					)
					.max(2000),
			}),
		)
		.min(1)
		.max(200),
});

export const importBookmarks = (
	userId: string,
	data: z.infer<typeof importBookmarksInput>,
) =>
	Effect.gen(function* () {
		const position = yield* nextPosition(boards, eq(boards.userId, userId));
		let imported = 0;
		const boardId = yield* query((db) =>
			db.transaction(async (tx) => {
				const [board] = await tx
					.insert(boards)
					.values({
						userId: userId,
						name: data.boardName,
						icon: "📥",
						position,
						layout: {
							...DEFAULT_BOARD_LAYOUT,
							tileStyle: "list",
							columns: 4,
						},
					})
					.returning();
				for (const [groupIndex, group] of data.groups.entries()) {
					const rows = group.bookmarks.flatMap((bookmark, index) => {
						const url = normalizeUrl(bookmark.url);
						return url
							? [
									{
										userId: userId,
										groupId: "",
										url,
										title: bookmark.title.trim() || titleFromUrl(url),
										position: index,
										meta: { favicon: faviconFor(url) },
									},
								]
							: [];
					});
					if (rows.length === 0) continue;
					const [created] = await tx
						.insert(groups)
						.values({
							userId: userId,
							boardId: board.id,
							name: group.name,
							position: groupIndex,
						})
						.returning();
					for (let i = 0; i < rows.length; i += 200) {
						await tx
							.insert(bookmarks)
							.values(
								rows
									.slice(i, i + 200)
									.map((row) => ({ ...row, groupId: created.id })),
							);
					}
					imported += rows.length;
				}
				return board.id;
			}),
		);
		return { boardId, imported };
	});

export const searchInput = z.object({
	query: z.string().trim().min(1).max(200),
	limit: z.number().int().min(1).max(100).optional(),
});

/** Case-insensitive match on title, URL, description and tags, most-visited first. */
export const searchBookmarks = (
	userId: string,
	data: z.infer<typeof searchInput>,
) =>
	Effect.gen(function* () {
		const home = yield* loadHome(userId);
		const terms = data.query.toLowerCase().split(/\s+/);
		return home.boards
			.flatMap((board) =>
				board.groups.flatMap((group) =>
					group.bookmarks.flatMap((item) =>
						item.kind === "folder"
							? item.children.map((bookmark) => ({
									bookmark,
									board: board.name,
									group: group.name,
									folder: item.title as string | null,
								}))
							: [
									{
										bookmark: item as Bookmark,
										board: board.name,
										group: group.name,
										folder: null,
									},
								],
					),
				),
			)
			.filter(({ bookmark }) => {
				const haystack = [
					bookmark.title,
					bookmark.url,
					bookmark.description ?? "",
					...bookmark.tags,
				]
					.join(" ")
					.toLowerCase();
				return terms.every((term) => haystack.includes(term));
			})
			.sort((a, b) => b.bookmark.visitCount - a.bookmark.visitCount)
			.slice(0, data.limit ?? 25);
	});

/*
 * Bookmark library domain logic. Every operation is an Effect program for one
 * user, shared by the web app's server functions (home.ts), the REST API and
 * the MCP tools, so every surface enforces the same rules:
 *
 * - Access is per board: you own it, or you're a member of it (shared boards).
 *   Rows keep the board owner's userId; callers are checked through the board.
 * - Locked vault boards are invisible unless VaultAccess is provided.
 * - Deletes are soft (30-day trash) and every change records an undo snapshot.
 */
import {
	and,
	asc,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	lt,
	or,
	sql,
} from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import {
	activity,
	type Board,
	type Bookmark,
	boardMembers,
	boards,
	bookmarks,
	type Group,
	groups,
	type Snapshot,
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
import {
	canonicalUrl,
	faviconFor,
	hostnameOf,
	normalizeUrl,
	titleFromUrl,
} from "#/lib/url";
import { fetchPageMetadata } from "./metadata";
import { query } from "./runtime";
import { STARTER_BOARD, type StarterItem } from "./seed";
import { VaultAccess } from "./vault-access";
import { emitEvent } from "./webhooks";

export const idSchema = z.string().min(1).max(64);
export const colorSchema = z
	.string()
	.regex(/^#[0-9a-f]{6}$/i)
	.nullable()
	.optional();

const TRASH_DAYS = 30;

const requireUrl = (input: string) => {
	const url = normalizeUrl(input);
	return url
		? Effect.succeed(url)
		: Effect.fail(
				new InvalidInput({ message: "That doesn't look like a valid URL" }),
			);
};

const owned = <T>(entity: string, row: T | undefined) =>
	row ? Effect.succeed(row) : Effect.fail(new NotFound({ entity }));

const vaultUnlocked = Effect.map(VaultAccess, (access) => access !== null);

/* --------------------------------- access ---------------------------------- */

export type Role = "owner" | "editor" | "viewer";

/** Board ids shared with the user, with their role. */
const memberships = (userId: string) =>
	query((db) =>
		db
			.select({ boardId: boardMembers.boardId, role: boardMembers.role })
			.from(boardMembers)
			.where(eq(boardMembers.userId, userId)),
	);

/**
 * A board the caller can use: owned or shared with them, not deleted, and not
 * inside a locked vault. `write` additionally rejects viewers.
 */
const accessBoard = (
	userId: string,
	boardId: string,
	options: { write?: boolean; includeDeleted?: boolean } = {},
) =>
	Effect.gen(function* () {
		const unlocked = yield* vaultUnlocked;
		const board = yield* query((db) =>
			db.query.boards.findFirst({ where: eq(boards.id, boardId) }),
		);
		if (
			!board ||
			(board.deletedAt && !options.includeDeleted) ||
			(board.vault && !unlocked)
		)
			return yield* new NotFound({ entity: "Board" });
		let role: Role = "owner";
		if (board.userId !== userId) {
			const member = yield* query((db) =>
				db.query.boardMembers.findFirst({
					where: and(
						eq(boardMembers.boardId, boardId),
						eq(boardMembers.userId, userId),
					),
				}),
			);
			if (!member || board.vault)
				return yield* new NotFound({ entity: "Board" });
			role = member.role;
		}
		if (options.write && role === "viewer")
			return yield* new InvalidInput({
				message: "You can view this board but not change it",
			});
		return { board, role };
	});

/** A group the caller can use (through its board). */
const accessGroup = (
	userId: string,
	groupId: string,
	options: { write?: boolean; includeDeleted?: boolean } = {},
) =>
	Effect.gen(function* () {
		const group = yield* query((db) =>
			db.query.groups.findFirst({ where: eq(groups.id, groupId) }),
		).pipe(Effect.flatMap((row) => owned("Group", row)));
		if (group.deletedAt && !options.includeDeleted)
			return yield* new NotFound({ entity: "Group" });
		const { board } = yield* accessBoard(userId, group.boardId, options);
		return { group, board };
	});

/** A bookmark or folder the caller can use (through its group and board). */
const accessBookmark = (
	userId: string,
	id: string,
	options: { write?: boolean; includeDeleted?: boolean } = {},
) =>
	Effect.gen(function* () {
		const bookmark = yield* query((db) =>
			db.query.bookmarks.findFirst({ where: eq(bookmarks.id, id) }),
		).pipe(Effect.flatMap((row) => owned("Bookmark", row)));
		if (bookmark.deletedAt && !options.includeDeleted)
			return yield* new NotFound({ entity: "Bookmark" });
		const { group, board } = yield* accessGroup(
			userId,
			bookmark.groupId,
			options,
		);
		return { bookmark, group, board };
	});

const accessFolder = (userId: string, id: string) =>
	accessBookmark(userId, id, { write: true }).pipe(
		Effect.flatMap((found) =>
			found.bookmark.kind === "folder"
				? Effect.succeed(found)
				: Effect.fail(new NotFound({ entity: "Folder" })),
		),
	);

/* --------------------------------- history --------------------------------- */

const tableOf = { boards, groups, bookmarks } as const;
const SKIP = new Set([
	"id",
	"userId",
	"createdAt",
	"updatedAt",
	"visitCount",
	"lastVisitedAt",
]);
const DATE_KEYS = new Set(["deletedAt"]);

const toValues = (row: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(row)
			.filter(([key]) => !SKIP.has(key))
			.map(([key, value]) => [
				key,
				value instanceof Date ? value.getTime() : value,
			]),
	);

/** Current values of rows, captured before they change. */
const snapshot = (table: Snapshot["table"], ids: string[]) =>
	ids.length === 0
		? Effect.succeed([] as Snapshot[])
		: query((db) => {
				const t = tableOf[table];
				return db.select().from(t).where(inArray(t.id, ids));
			}).pipe(
				Effect.map((rows) =>
					rows.map(
						(row) => ({ table, id: row.id, values: toValues(row) }) as Snapshot,
					),
				),
			);

/** "Before" state of a row that is about to be created: it didn't exist. */
const created = (table: Snapshot["table"], id: string): Snapshot => ({
	table,
	id,
	values: { deletedAt: Date.now() },
});

const SINGULAR = {
	boards: "board",
	groups: "group",
	bookmarks: "bookmark",
} as const;

/** Logs an undoable change and notifies the user's webhooks. */
const record = (
	userId: string,
	action: string,
	label: string,
	snapshots: Snapshot[],
) =>
	snapshots.length === 0
		? Effect.void
		: Effect.gen(function* () {
				yield* query((db) =>
					db.insert(activity).values({ userId, action, label, snapshots }),
				);
				const byTable = new Map<Snapshot["table"], string[]>();
				for (const snap of snapshots)
					byTable.set(snap.table, [
						...(byTable.get(snap.table) ?? []),
						snap.id,
					]);
				for (const [table, ids] of byTable) {
					// Boards and groups only "update" when reordered; links "move".
					const verb =
						action === "reorder" || action === "move"
							? table === "bookmarks"
								? "move"
								: "update"
							: action;
					yield* emitEvent(userId, `${SINGULAR[table]}.${verb}`, {
						ids,
						label,
					});
				}
			});

const quote = (text: string) =>
	`“${text.length > 40 ? `${text.slice(0, 39)}…` : text}”`;

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
				const [createdGroup] = await tx
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
									groupId: createdGroup.id,
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
								groupId: createdGroup.id,
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

export type HomeBoardRow = Board & { role: Role };

export const loadHome = (userId: string) =>
	Effect.gen(function* () {
		const shared = yield* memberships(userId);
		const sharedIds = shared.map((m) => m.boardId);
		const load = query((db) =>
			db.query.boards.findMany({
				where: and(
					isNull(boards.deletedAt),
					sharedIds.length
						? or(eq(boards.userId, userId), inArray(boards.id, sharedIds))
						: eq(boards.userId, userId),
				),
				orderBy: [asc(boards.position), asc(boards.createdAt)],
			}),
		);
		let allBoards = yield* load;
		if (!allBoards.some((board) => board.userId === userId)) {
			const everOwned = yield* query((db) =>
				db.$count(boards, eq(boards.userId, userId)),
			);
			if (everOwned === 0) {
				yield* seedStarterBoard(userId);
				allBoards = yield* load;
			}
		}
		// Locked vault boards (and everything in them) never leave the server.
		const access = yield* VaultAccess;
		const boardRows = allBoards.filter(
			(board) => !board.vault || (access && board.userId === userId),
		);
		const boardIds = boardRows.map((board) => board.id);
		const [groupRows, bookmarkRows, settingsRow, vault] = yield* query((db) =>
			Promise.all([
				boardIds.length
					? db.query.groups.findMany({
							where: and(
								inArray(groups.boardId, boardIds),
								isNull(groups.deletedAt),
							),
							orderBy: [asc(groups.position), asc(groups.createdAt)],
						})
					: Promise.resolve([] as Group[]),
				boardIds.length
					? db
							.select({ bookmark: bookmarks })
							.from(bookmarks)
							.innerJoin(groups, eq(groups.id, bookmarks.groupId))
							.where(
								and(
									inArray(groups.boardId, boardIds),
									isNull(groups.deletedAt),
									isNull(bookmarks.deletedAt),
								),
							)
							.orderBy(asc(bookmarks.position), asc(bookmarks.createdAt))
							.then((rows) => rows.map((row) => row.bookmark))
					: Promise.resolve([] as Bookmark[]),
				db.query.userSettings.findFirst({
					where: eq(userSettings.userId, userId),
				}),
				db.query.vaults.findFirst({ where: eq(vaults.userId, userId) }),
			]),
		);
		// Top-level items per group; folders carry their children.
		const children = new Map<string, Bookmark[]>();
		const ids = new Set(bookmarkRows.map((row) => row.id));
		for (const row of bookmarkRows) {
			if (!row.parentId || !ids.has(row.parentId)) continue;
			children.set(row.parentId, [...(children.get(row.parentId) ?? []), row]);
		}
		const tree: (Bookmark & { children: Bookmark[] })[] = bookmarkRows
			.filter((row) => !row.parentId)
			.map((row) => ({ ...row, children: children.get(row.id) ?? [] }));
		const roles = new Map(shared.map((m) => [m.boardId, m.role as Role]));
		return {
			userId,
			vault: {
				configured: Boolean(vault),
				unlocked: Boolean(access),
				expiresAt: access?.expiresAt ?? null,
				autoLockMinutes: vault?.autoLockMinutes ?? 15,
			},
			settings: resolveSettings(settingsRow?.settings),
			boards: boardRows.map((board) => ({
				...board,
				role:
					board.userId === userId
						? ("owner" as Role)
						: (roles.get(board.id) ?? "viewer"),
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
				.values({ userId, settings })
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
					userId,
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
				.values({ userId, boardId: board.id, name: "Bookmarks" })
				.returning(),
		);
		yield* record(userId, "create", `Created board ${quote(board.name)}`, [
			created("boards", board.id),
		]);
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

/** Visible (non-vault, not deleted) owned boards; at least one must always remain. */
const countVisibleBoards = (userId: string) =>
	query((db) =>
		db.$count(
			boards,
			and(
				eq(boards.userId, userId),
				eq(boards.vault, false),
				isNull(boards.deletedAt),
			),
		),
	);

export const updateBoard = (
	userId: string,
	data: z.infer<typeof updateBoardInput>,
) =>
	Effect.gen(function* () {
		const { board, role } = yield* accessBoard(userId, data.id, {
			write: true,
		});
		if (data.vault !== undefined && data.vault !== board.vault) {
			if (role !== "owner")
				return yield* new InvalidInput({
					message: "Only the owner can do that",
				});
			yield* requireUnlocked;
			const shared = yield* query((db) =>
				db.$count(boardMembers, eq(boardMembers.boardId, board.id)),
			);
			if (data.vault && shared > 0)
				return yield* new InvalidInput({
					message: "Stop sharing this board before moving it into the vault",
				});
			if (data.vault && (yield* countVisibleBoards(userId)) <= 1)
				return yield* new InvalidInput({
					message: "Keep at least one board outside the vault",
				});
		}
		const before = yield* snapshot("boards", [board.id]);
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
		yield* record(
			userId,
			"update",
			`Edited board ${quote(board.name)}`,
			before,
		);
		return updated;
	});

export const idInput = z.object({ id: idSchema });

export const deleteBoard = (userId: string, data: z.infer<typeof idInput>) =>
	Effect.gen(function* () {
		const { board, role } = yield* accessBoard(userId, data.id, {
			write: true,
		});
		if (role !== "owner")
			return yield* new InvalidInput({
				message: "Only the owner can delete this board",
			});
		if (!board.vault && (yield* countVisibleBoards(userId)) <= 1)
			return yield* new InvalidInput({
				message: "You need at least one board",
			});
		const before = yield* snapshot("boards", [board.id]);
		yield* query((db) =>
			db
				.update(boards)
				.set({ deletedAt: new Date() })
				.where(eq(boards.id, board.id)),
		);
		yield* record(
			userId,
			"delete",
			`Deleted board ${quote(board.name)}`,
			before,
		);
		return { ok: true, id: board.id };
	});

export const reorderInput = z.object({ ids: z.array(idSchema).max(200) });

export const reorderBoards = (
	userId: string,
	data: z.infer<typeof reorderInput>,
) =>
	Effect.gen(function* () {
		const before = yield* snapshot("boards", data.ids);
		yield* query((db) =>
			db.transaction(async (tx) => {
				for (const [position, id] of data.ids.entries()) {
					await tx
						.update(boards)
						.set({ position })
						.where(and(eq(boards.id, id), eq(boards.userId, userId)));
				}
			}),
		);
		yield* record(userId, "reorder", "Reordered boards", before);
		return { ok: true };
	});

/* ---------------------------------- groups --------------------------------- */

export const createGroupInput = z.object({
	boardId: idSchema,
	name: z.string().trim().min(1).max(60),
	color: colorSchema,
	kind: z.enum(["links", "smart", "widget"]).optional(),
	options: groupOptionsSchema.optional(),
});

export const createGroup = (
	userId: string,
	data: z.infer<typeof createGroupInput>,
) =>
	Effect.gen(function* () {
		const { board } = yield* accessBoard(userId, data.boardId, { write: true });
		const position = yield* nextPosition(
			groups,
			eq(groups.boardId, data.boardId),
		);
		const [group] = yield* query((db) =>
			db
				.insert(groups)
				.values({
					userId: board.userId,
					boardId: data.boardId,
					name: data.name,
					color: data.color ?? null,
					kind: data.kind ?? "links",
					options: data.options ?? {},
					position,
				})
				.returning(),
		);
		yield* record(userId, "create", `Created group ${quote(group.name)}`, [
			created("groups", group.id),
		]);
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
		const { group, board } = yield* accessGroup(userId, data.id, {
			write: true,
		});
		if (data.boardId && data.boardId !== group.boardId) {
			const target = yield* accessBoard(userId, data.boardId, { write: true });
			if (target.board.userId !== board.userId)
				return yield* new InvalidInput({
					message: "Groups can only move between boards with the same owner",
				});
		}
		const before = yield* snapshot("groups", [group.id]);
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
		// Collapsing is UI state, not something worth an undo step.
		const onlyCollapse = Object.keys(data).every(
			(key) => key === "id" || key === "collapsed",
		);
		if (!onlyCollapse)
			yield* record(
				userId,
				"update",
				`Edited group ${quote(group.name)}`,
				before,
			);
		return updated;
	});

export const deleteGroup = (userId: string, data: z.infer<typeof idInput>) =>
	Effect.gen(function* () {
		const { group } = yield* accessGroup(userId, data.id, { write: true });
		const before = yield* snapshot("groups", [group.id]);
		yield* query((db) =>
			db
				.update(groups)
				.set({ deletedAt: new Date() })
				.where(eq(groups.id, group.id)),
		);
		yield* record(
			userId,
			"delete",
			`Deleted group ${quote(group.name)}`,
			before,
		);
		return { ok: true, id: group.id };
	});

export const reorderGroups = (
	userId: string,
	data: z.infer<typeof reorderInput>,
) =>
	Effect.gen(function* () {
		const rows = data.ids.length
			? yield* query((db) =>
					db
						.select({ id: groups.id, boardId: groups.boardId })
						.from(groups)
						.where(inArray(groups.id, data.ids)),
				)
			: [];
		for (const boardId of new Set(rows.map((row) => row.boardId)))
			yield* accessBoard(userId, boardId, { write: true });
		const before = yield* snapshot("groups", data.ids);
		yield* query((db) =>
			db.transaction(async (tx) => {
				for (const [position, id] of data.ids.entries())
					await tx.update(groups).set({ position }).where(eq(groups.id, id));
			}),
		);
		yield* record(userId, "reorder", "Reordered groups", before);
		return { ok: true };
	});

/* -------------------------------- bookmarks -------------------------------- */

const bookmarkFields = {
	title: z.string().trim().max(200).optional(),
	description: z.string().trim().max(500).nullish(),
	icon: z.string().trim().max(2048).nullish(),
	color: colorSchema,
	tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
	incognito: z.boolean().optional(),
};

/** Bookmarks in the user's visible library, for duplicate checks. */
const libraryLinks = (userId: string) =>
	loadHome(userId).pipe(
		Effect.map((home) =>
			home.boards.flatMap((board) =>
				board.groups.flatMap((group) =>
					group.bookmarks.flatMap((item) =>
						(item.kind === "folder"
							? item.children.map((child) => ({ child, folder: item.title }))
							: [{ child: item as Bookmark, folder: null }]
						).map(({ child, folder }) => ({
							id: child.id,
							title: child.title,
							url: child.url,
							path: [board.name, group.name, folder]
								.filter(Boolean)
								.join(" / "),
						})),
					),
				),
			),
		),
	);

/** Existing bookmarks pointing at the same page (ignoring www, trailing slashes, tracking params). */
export const findDuplicatesOf = (userId: string, url: string) =>
	libraryLinks(userId).pipe(
		Effect.map((links) => {
			const key = canonicalUrl(url);
			return links.filter((link) => canonicalUrl(link.url) === key);
		}),
	);

export const lookupUrlInput = z.object({ url: z.string().max(2048) });

export const lookupUrl = (
	data: z.infer<typeof lookupUrlInput>,
	userId?: string,
) =>
	Effect.gen(function* () {
		const url = yield* requireUrl(data.url);
		const [meta, duplicates] = yield* Effect.all(
			[
				fetchPageMetadata(url),
				userId ? findDuplicatesOf(userId, url) : Effect.succeed([]),
			],
			{
				concurrency: 2,
			},
		);
		return {
			url,
			title: meta.title ?? titleFromUrl(url),
			description: meta.description ?? null,
			favicon: meta.favicon ?? faviconFor(url),
			image: meta.image ?? null,
			siteName: meta.siteName ?? null,
			duplicates,
		};
	});

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
		const target = data.parentId
			? yield* accessFolder(userId, data.parentId)
			: yield* accessGroup(userId, data.groupId, { write: true });
		// A folder's contents live in the folder's group.
		const groupId = target.group.id;
		const url = yield* requireUrl(data.url);
		// Only hit the network when the caller didn't already supply a title.
		const fetched = data.title ? null : yield* fetchPageMetadata(url);
		const position = yield* nextSlot(groupId, data.parentId ?? null);
		const [bookmark] = yield* query((db) =>
			db
				.insert(bookmarks)
				.values({
					userId: target.board.userId,
					groupId,
					parentId: data.parentId ?? null,
					url,
					title: data.title || fetched?.title || titleFromUrl(url),
					description: data.description ?? fetched?.description ?? null,
					icon: data.icon ?? null,
					color: data.color ?? null,
					tags: data.tags ?? [],
					incognito: data.incognito ?? false,
					position,
					meta: {
						favicon: data.favicon ?? fetched?.favicon ?? faviconFor(url),
						siteName: data.siteName ?? fetched?.siteName,
						image: data.image ?? fetched?.image,
						feedUrl: fetched?.feedUrl,
						...(fetched || data.favicon ? { fetchedAt: Date.now() } : {}),
					},
				})
				.returning(),
		);
		yield* record(userId, "create", `Added ${quote(bookmark.title)}`, [
			created("bookmarks", bookmark.id),
		]);
		return bookmark;
	});

export const bulkCreateInput = z.object({
	groupId: idSchema,
	urls: z.array(z.string().max(2048)).min(1).max(200),
	/** Skip URLs already in the library (default true). */
	skipDuplicates: z.boolean().optional(),
});

/**
 * Adds many links at once. Rows appear immediately with a provisional title;
 * page titles and icons are filled in afterwards in the background.
 */
export const bulkCreateBookmarks = (
	userId: string,
	data: z.infer<typeof bulkCreateInput>,
) =>
	Effect.gen(function* () {
		const { group, board } = yield* accessGroup(userId, data.groupId, {
			write: true,
		});
		const existing =
			data.skipDuplicates === false
				? new Set<string>()
				: new Set(
						(yield* libraryLinks(userId)).map((link) => canonicalUrl(link.url)),
					);
		const seen = new Set<string>();
		const urls = data.urls.flatMap((raw) => {
			const url = normalizeUrl(raw);
			if (!url) return [];
			const key = canonicalUrl(url);
			if (existing.has(key) || seen.has(key)) return [];
			seen.add(key);
			return [url];
		});
		if (urls.length === 0) return { added: 0, skipped: data.urls.length };
		const start = yield* nextSlot(group.id, null);
		const rows = yield* query((db) =>
			db
				.insert(bookmarks)
				.values(
					urls.map((url, index) => ({
						userId: board.userId,
						groupId: group.id,
						url,
						title: titleFromUrl(url),
						position: start + index,
						meta: { favicon: faviconFor(url) },
					})),
				)
				.returning({ id: bookmarks.id, url: bookmarks.url }),
		);
		yield* record(
			userId,
			"create",
			`Added ${rows.length} links to ${quote(group.name)}`,
			rows.map((row) => created("bookmarks", row.id)),
		);
		// Enrich in the background, a few at a time.
		yield* Effect.forkDetach(
			Effect.forEach(
				rows,
				(row) =>
					fetchPageMetadata(row.url).pipe(
						Effect.flatMap((meta) =>
							query((db) =>
								db
									.update(bookmarks)
									.set({
										title: meta.title ?? titleFromUrl(row.url),
										description: meta.description ?? null,
										meta: {
											favicon: meta.favicon ?? faviconFor(row.url),
											siteName: meta.siteName,
											image: meta.image,
											feedUrl: meta.feedUrl,
											fetchedAt: Date.now(),
										},
										updatedAt: sql`${bookmarks.updatedAt}`,
									})
									.where(eq(bookmarks.id, row.id)),
							),
						),
						Effect.ignore,
					),
				{ concurrency: 4, discard: true },
			),
		);
		return { added: rows.length, skipped: data.urls.length - rows.length };
	});

export const createFolderInput = z.object({
	groupId: idSchema,
	title: z.string().trim().min(1).max(60),
	icon: z.string().max(16).nullish(),
	color: colorSchema,
	incognito: z.boolean().optional(),
	/** Existing bookmarks to move into the new folder. */
	bookmarkIds: z.array(idSchema).max(200).optional(),
});

export const createFolder = (
	userId: string,
	data: z.infer<typeof createFolderInput>,
) =>
	Effect.gen(function* () {
		const { group, board } = yield* accessGroup(userId, data.groupId, {
			write: true,
		});
		const position = yield* nextSlot(group.id, null);
		const [folder] = yield* query((db) =>
			db
				.insert(bookmarks)
				.values({
					userId: board.userId,
					groupId: group.id,
					kind: "folder",
					title: data.title,
					url: "",
					icon: data.icon ?? null,
					color: data.color ?? null,
					incognito: data.incognito ?? false,
					position,
				})
				.returning(),
		);
		yield* record(userId, "create", `Created folder ${quote(folder.title)}`, [
			created("bookmarks", folder.id),
		]);
		if (data.bookmarkIds?.length)
			yield* arrangeFolder(userId, {
				folderId: folder.id,
				ids: data.bookmarkIds,
			});
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
		const { bookmark, board } = yield* accessBookmark(userId, data.id, {
			write: true,
		});
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
			if (parentId)
				groupId = (yield* accessFolder(userId, parentId)).bookmark.groupId;
		}
		if (data.groupId && data.groupId !== groupId && !parentId) {
			const target = yield* accessGroup(userId, data.groupId, { write: true });
			if (target.board.userId !== board.userId)
				return yield* new InvalidInput({
					message: "Links can only move between boards with the same owner",
				});
			groupId = data.groupId;
		}
		const moved =
			groupId !== bookmark.groupId || parentId !== bookmark.parentId;
		const position = moved
			? yield* nextSlot(groupId, parentId)
			: bookmark.position;
		const childIds =
			isFolder && groupId !== bookmark.groupId
				? (yield* query((db) =>
						db
							.select({ id: bookmarks.id })
							.from(bookmarks)
							.where(eq(bookmarks.parentId, bookmark.id)),
					)).map((row) => row.id)
				: [];
		const before = yield* snapshot("bookmarks", [bookmark.id, ...childIds]);
		const [updated] = yield* query((db) =>
			db.transaction(async (tx) => {
				// A folder's contents travel with it.
				if (childIds.length)
					await tx
						.update(bookmarks)
						.set({ groupId })
						.where(eq(bookmarks.parentId, bookmark.id));
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
						incognito: data.incognito ?? bookmark.incognito,
						meta:
							url === bookmark.url
								? bookmark.meta
								: { favicon: faviconFor(url) },
					})
					.where(eq(bookmarks.id, bookmark.id))
					.returning();
			}),
		);
		yield* record(
			userId,
			moved ? "move" : "update",
			`${moved ? "Moved" : "Edited"} ${quote(bookmark.title)}`,
			before,
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
		const { bookmark } = yield* accessBookmark(userId, data.id, {
			write: true,
		});
		const isFolder = bookmark.kind === "folder";
		const inside =
			isFolder && !data.withContents
				? yield* query((db) =>
						db
							.select({ id: bookmarks.id })
							.from(bookmarks)
							.where(
								and(
									eq(bookmarks.parentId, bookmark.id),
									isNull(bookmarks.deletedAt),
								),
							)
							.orderBy(asc(bookmarks.position)),
					)
				: [];
		const before = yield* snapshot("bookmarks", [
			bookmark.id,
			...inside.map((row) => row.id),
		]);
		const start = inside.length ? yield* nextSlot(bookmark.groupId, null) : 0;
		yield* query((db) =>
			db.transaction(async (tx) => {
				// Release the folder's links back into its group before removing it.
				for (const [offset, child] of inside.entries())
					await tx
						.update(bookmarks)
						.set({ parentId: null, position: start + offset })
						.where(eq(bookmarks.id, child.id));
				await tx
					.update(bookmarks)
					.set({ deletedAt: new Date() })
					.where(eq(bookmarks.id, bookmark.id));
			}),
		);
		yield* record(
			userId,
			"delete",
			`Deleted ${isFolder ? "folder " : ""}${quote(bookmark.title)}`,
			before,
		);
		return { ok: true, id: bookmark.id };
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
		const owners = new Set<string>();
		for (const groupId of new Set(data.groups.map((group) => group.groupId)))
			owners.add(
				(yield* accessGroup(userId, groupId, { write: true })).board.userId,
			);
		if (owners.size > 1)
			return yield* new InvalidInput({
				message: "Links can only move between boards with the same owner",
			});
		const [owner] = owners;
		const ids = data.groups.flatMap((group) => group.ids);
		const childIds = ids.length
			? (yield* query((db) =>
					db
						.select({ id: bookmarks.id })
						.from(bookmarks)
						.where(inArray(bookmarks.parentId, ids)),
				)).map((row) => row.id)
			: [];
		const before = yield* snapshot("bookmarks", [...ids, ...childIds]);
		yield* query((db) =>
			db.transaction(async (tx) => {
				for (const group of data.groups) {
					for (const [position, id] of group.ids.entries()) {
						await tx
							.update(bookmarks)
							.set({ groupId: group.groupId, parentId: null, position })
							.where(and(eq(bookmarks.id, id), eq(bookmarks.userId, owner)));
						// Keep folder contents in the same group as the folder.
						await tx
							.update(bookmarks)
							.set({ groupId: group.groupId })
							.where(
								and(eq(bookmarks.parentId, id), eq(bookmarks.userId, owner)),
							);
					}
				}
			}),
		);
		yield* record(userId, "move", "Rearranged links", before);
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
		const { bookmark: folder, board } = yield* accessFolder(
			userId,
			data.folderId,
		);
		const before = yield* snapshot("bookmarks", data.ids);
		yield* query((db) =>
			db.transaction(async (tx) => {
				for (const [position, id] of data.ids.entries()) {
					await tx
						.update(bookmarks)
						.set({ groupId: folder.groupId, parentId: folder.id, position })
						.where(
							and(
								eq(bookmarks.id, id),
								eq(bookmarks.userId, board.userId),
								eq(bookmarks.kind, "link"),
							),
						);
				}
			}),
		);
		yield* record(
			userId,
			"move",
			`Arranged folder ${quote(folder.title)}`,
			before,
		);
		return { ok: true };
	});

/** Re-fetches a link's title/description/preview image, e.g. for the hover preview. */
export const refreshPreview = (userId: string, data: z.infer<typeof idInput>) =>
	Effect.gen(function* () {
		const { bookmark } = yield* accessBookmark(userId, data.id);
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
						feedUrl: meta.feedUrl ?? bookmark.meta.feedUrl,
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
	accessBookmark(userId, data.id).pipe(
		Effect.flatMap(({ bookmark }) =>
			query((db) =>
				db
					.update(bookmarks)
					.set({
						visitCount: sql`${bookmarks.visitCount} + 1`,
						lastVisitedAt: new Date(),
						updatedAt: sql`${bookmarks.updatedAt}`,
					})
					.where(eq(bookmarks.id, bookmark.id)),
			),
		),
		Effect.as({ ok: true }),
	);

/** Imports a parsed browser bookmark export as a new board. */
export const importBookmarksInput = z.object({
	boardName: z.string().trim().min(1).max(60),
	groups: z
		.array(
			z.object({
				name: z.string().trim().min(1).max(60),
				bookmarks: z
					.array(
						z.object({ title: z.string().max(200), url: z.string().max(2048) }),
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
						userId,
						name: data.boardName,
						icon: "📥",
						position,
						layout: { ...DEFAULT_BOARD_LAYOUT, tileStyle: "list", columns: 4 },
					})
					.returning();
				for (const [groupIndex, group] of data.groups.entries()) {
					const rows = group.bookmarks.flatMap((bookmark, index) => {
						const url = normalizeUrl(bookmark.url);
						return url
							? [
									{
										userId,
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
					const [createdGroup] = await tx
						.insert(groups)
						.values({
							userId,
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
									.map((row) => ({ ...row, groupId: createdGroup.id })),
							);
					}
					imported += rows.length;
				}
				return board.id;
			}),
		);
		yield* record(userId, "create", `Imported ${imported} bookmarks`, [
			created("boards", boardId),
		]);
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

/** Groups of bookmarks that point at the same page. */
export const listDuplicates = (userId: string) =>
	libraryLinks(userId).pipe(
		Effect.map((links) => {
			const byKey = new Map<string, typeof links>();
			for (const link of links)
				byKey.set(canonicalUrl(link.url), [
					...(byKey.get(canonicalUrl(link.url)) ?? []),
					link,
				]);
			return [...byKey.entries()]
				.filter(([, items]) => items.length > 1)
				.map(([key, items]) => ({
					key,
					host: hostnameOf(items[0].url),
					items,
				}));
		}),
	);

/* ------------------------------- undo / trash ------------------------------ */

const restoreValues = (values: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(values).map(([key, value]) => [
			key,
			DATE_KEYS.has(key)
				? value == null
					? null
					: new Date(value as number)
				: value,
		]),
	);

/** The board a snapshot row lives on, to re-check access before restoring it. */
const boardOfRow = (snap: Snapshot) =>
	Effect.gen(function* () {
		if (snap.table === "boards") return snap.id;
		if (snap.table === "groups") {
			const row = yield* query((db) =>
				db.query.groups.findFirst({ where: eq(groups.id, snap.id) }),
			);
			return row?.boardId ?? null;
		}
		const row = yield* query((db) =>
			db
				.select({ boardId: groups.boardId })
				.from(bookmarks)
				.innerJoin(groups, eq(groups.id, bookmarks.groupId))
				.where(eq(bookmarks.id, snap.id)),
		);
		return row[0]?.boardId ?? null;
	});

const applySnapshots = (userId: string, snapshots: Snapshot[]) =>
	Effect.gen(function* () {
		const allowed = new Map<string, boolean>();
		for (const snap of [...snapshots].reverse()) {
			const boardId = yield* boardOfRow(snap);
			if (!boardId) continue;
			if (!allowed.has(boardId)) {
				const ok = yield* accessBoard(userId, boardId, {
					write: true,
					includeDeleted: true,
				}).pipe(
					Effect.as(true),
					Effect.catch(() => Effect.succeed(false)),
				);
				allowed.set(boardId, ok);
			}
			if (!allowed.get(boardId)) continue;
			const table = tableOf[snap.table];
			yield* query((db) =>
				db
					.update(table)
					.set(restoreValues(snap.values))
					.where(eq(table.id, snap.id)),
			);
		}
	});

export const activityInput = z.object({
	limit: z.number().int().min(1).max(100).optional(),
});

export const listActivity = (
	userId: string,
	data: z.infer<typeof activityInput> = {},
) =>
	query((db) =>
		db
			.select({
				id: activity.id,
				action: activity.action,
				label: activity.label,
				undoneAt: activity.undoneAt,
				createdAt: activity.createdAt,
			})
			.from(activity)
			.where(eq(activity.userId, userId))
			.orderBy(desc(activity.createdAt))
			.limit(data.limit ?? 50),
	);

export const undoInput = z.object({ id: idSchema.optional() });

/** Reverts one change (the latest by default). */
export const undo = (userId: string, data: z.infer<typeof undoInput> = {}) =>
	Effect.gen(function* () {
		const entry = yield* query((db) =>
			db.query.activity.findFirst({
				where: data.id
					? and(
							eq(activity.id, data.id),
							eq(activity.userId, userId),
							isNull(activity.undoneAt),
						)
					: and(eq(activity.userId, userId), isNull(activity.undoneAt)),
				orderBy: [desc(activity.createdAt)],
			}),
		);
		if (!entry) return yield* new InvalidInput({ message: "Nothing to undo" });
		yield* applySnapshots(userId, entry.snapshots);
		yield* query((db) =>
			db
				.update(activity)
				.set({ undoneAt: new Date() })
				.where(eq(activity.id, entry.id)),
		);
		return { label: entry.label };
	});

/** Everything deleted in the last 30 days that the user owns. */
export const listTrash = (userId: string) =>
	Effect.gen(function* () {
		const since = new Date(Date.now() - TRASH_DAYS * 86_400_000);
		const [deletedBoards, deletedGroups, deletedBookmarks] = yield* query(
			(db) =>
				Promise.all([
					db
						.select({
							id: boards.id,
							title: boards.name,
							icon: boards.icon,
							deletedAt: boards.deletedAt,
						})
						.from(boards)
						.where(
							and(
								eq(boards.userId, userId),
								isNotNull(boards.deletedAt),
								gt(boards.deletedAt, since),
							),
						),
					db
						.select({
							id: groups.id,
							title: groups.name,
							deletedAt: groups.deletedAt,
							board: boards.name,
						})
						.from(groups)
						.innerJoin(boards, eq(boards.id, groups.boardId))
						.where(
							and(
								eq(groups.userId, userId),
								isNotNull(groups.deletedAt),
								gt(groups.deletedAt, since),
							),
						),
					db
						.select({
							id: bookmarks.id,
							title: bookmarks.title,
							url: bookmarks.url,
							kind: bookmarks.kind,
							meta: bookmarks.meta,
							deletedAt: bookmarks.deletedAt,
							group: groups.name,
						})
						.from(bookmarks)
						.innerJoin(groups, eq(groups.id, bookmarks.groupId))
						.where(
							and(
								eq(bookmarks.userId, userId),
								isNotNull(bookmarks.deletedAt),
								gt(bookmarks.deletedAt, since),
							),
						),
				]),
		);
		const items = [
			...deletedBoards.map((row) => ({
				type: "board" as const,
				id: row.id,
				title: row.title,
				detail: "Board",
				icon: row.icon,
				url: null,
				deletedAt: row.deletedAt as Date,
			})),
			...deletedGroups.map((row) => ({
				type: "group" as const,
				id: row.id,
				title: row.title,
				detail: `Group on ${row.board}`,
				icon: null,
				url: null,
				deletedAt: row.deletedAt as Date,
			})),
			...deletedBookmarks.map((row) => ({
				type: "bookmark" as const,
				id: row.id,
				title: row.title,
				detail: `${row.kind === "folder" ? "Folder" : hostnameOf(row.url)} · ${row.group}`,
				icon: row.meta.favicon ?? null,
				url: row.kind === "folder" ? null : row.url,
				deletedAt: row.deletedAt as Date,
			})),
		];
		return items
			.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime())
			.map((item) => ({
				...item,
				expiresAt: new Date(item.deletedAt.getTime() + TRASH_DAYS * 86_400_000),
			}));
	});

export const trashItemInput = z.object({
	type: z.enum(["board", "group", "bookmark"]),
	id: idSchema,
});

/** Restores an item, plus any deleted parents it needs to be visible again. */
export const restoreFromTrash = (
	userId: string,
	data: z.infer<typeof trashItemInput>,
) =>
	Effect.gen(function* () {
		const restore = (
			table: typeof boards | typeof groups | typeof bookmarks,
			id: string,
		) =>
			query((db) =>
				db
					.update(table)
					.set({ deletedAt: null })
					.where(and(eq(table.id, id), eq(table.userId, userId))),
			);
		if (data.type === "board") yield* restore(boards, data.id);
		if (data.type === "group") {
			const group = yield* query((db) =>
				db.query.groups.findFirst({
					where: and(eq(groups.id, data.id), eq(groups.userId, userId)),
				}),
			);
			if (!group) return yield* new NotFound({ entity: "Group" });
			yield* restore(boards, group.boardId);
			yield* restore(groups, group.id);
		}
		if (data.type === "bookmark") {
			const bookmark = yield* query((db) =>
				db.query.bookmarks.findFirst({
					where: and(eq(bookmarks.id, data.id), eq(bookmarks.userId, userId)),
				}),
			);
			if (!bookmark) return yield* new NotFound({ entity: "Bookmark" });
			const group = yield* query((db) =>
				db.query.groups.findFirst({ where: eq(groups.id, bookmark.groupId) }),
			);
			if (group) {
				yield* restore(boards, group.boardId);
				yield* restore(groups, group.id);
			}
			if (bookmark.parentId) yield* restore(bookmarks, bookmark.parentId);
			yield* restore(bookmarks, bookmark.id);
		}
		return { ok: true };
	});

/** Deletes an item from the trash for good (cascades to anything inside it). */
export const deleteForever = (
	userId: string,
	data: z.infer<typeof trashItemInput>,
) =>
	Effect.gen(function* () {
		const table =
			data.type === "board"
				? boards
				: data.type === "group"
					? groups
					: bookmarks;
		yield* query((db) =>
			db
				.delete(table)
				.where(
					and(
						eq(table.id, data.id),
						eq(table.userId, userId),
						isNotNull(table.deletedAt),
					),
				),
		);
		return { ok: true };
	});

export const emptyTrash = (userId: string) =>
	query((db) =>
		db.transaction(async (tx) => {
			await tx
				.delete(bookmarks)
				.where(
					and(eq(bookmarks.userId, userId), isNotNull(bookmarks.deletedAt)),
				);
			await tx
				.delete(groups)
				.where(and(eq(groups.userId, userId), isNotNull(groups.deletedAt)));
			await tx
				.delete(boards)
				.where(and(eq(boards.userId, userId), isNotNull(boards.deletedAt)));
		}),
	).pipe(Effect.as({ ok: true }));

/** Background housekeeping: purge expired trash and trim old history. */
export const purgeExpired = () =>
	Effect.gen(function* () {
		const cutoff = new Date(Date.now() - TRASH_DAYS * 86_400_000);
		yield* query((db) =>
			db.transaction(async (tx) => {
				await tx
					.delete(bookmarks)
					.where(
						and(
							isNotNull(bookmarks.deletedAt),
							lt(bookmarks.deletedAt, cutoff),
						),
					);
				await tx
					.delete(groups)
					.where(
						and(isNotNull(groups.deletedAt), lt(groups.deletedAt, cutoff)),
					);
				await tx
					.delete(boards)
					.where(
						and(isNotNull(boards.deletedAt), lt(boards.deletedAt, cutoff)),
					);
				await tx.delete(activity).where(lt(activity.createdAt, cutoff));
			}),
		);
	});

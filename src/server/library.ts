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
	notInArray,
	or,
	sql,
} from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { dataVersion } from "#/db";
import { user } from "#/db/auth-schema";
import {
	activity,
	type Board,
	type Bookmark,
	type BrowserOp,
	boardMembers,
	boards,
	bookmarks,
	type Group,
	groups,
	profiles,
	type Snapshot,
	userSettings,
	vaults,
	visits,
} from "#/db/schema";
import { InvalidInput, NotFound } from "#/lib/effect/errors";
import { type BookmarkMeta, DEFAULT_BOARD_LAYOUT } from "#/lib/preferences";
import {
	boardLayoutSchema,
	groupOptionsSchema,
	resolveLayout,
	resolveSettings,
	userSettingsSchema,
	widgetSchema,
} from "#/lib/schemas";
import {
	canonicalUrl,
	faviconFor,
	hostnameOf,
	normalizeUrl,
	titleFromUrl,
} from "#/lib/url";
import { aiEnabled } from "./ai";
import * as browserSync from "./browser-sync";
import { searchText } from "./content";
import { fetchPageMetadata } from "./metadata";
import { afterFetch, checkLinksNow } from "./monitors";
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

/** Vault boards open only with the matching password: main or decoy. */
const opensWith = (
	board: { decoy: boolean },
	access: { slot: "main" | "decoy" } | null,
) => access !== null && board.decoy === (access.slot === "decoy");

/** Whether this owner's vault encrypts contents in the browser. */
export const vaultSealed = (ownerId: string) =>
	query((db) =>
		db.query.vaults.findFirst({ where: eq(vaults.userId, ownerId) }),
	).pipe(Effect.map((vault) => Boolean(vault?.kdfSalt)));

/** Placeholder columns for an end-to-end encrypted vault item. */
export const sealedColumns = (sealed: string, kind: "link" | "folder") => ({
	title: kind === "folder" ? "Locked folder" : "Locked link",
	url: "",
	description: null,
	icon: null,
	tags: [] as string[],
	meta: { sealed },
});

export const sealedSchema = z
	.string()
	.max(16_000)
	.regex(/^v1\.[A-Za-z0-9+/=]+$/, "Invalid encrypted payload");

const mustSeal = () =>
	new InvalidInput({
		message:
			"Vault items are encrypted in your browser. Reload the page and unlock the vault again.",
	});

/* --------------------------------- access ---------------------------------- */

export type Role = "owner" | "editor" | "viewer";

/** Board ids shared with the user, with their role. */
const memberships = (userId: string) =>
	query((db) =>
		db
			.select({
				boardId: boardMembers.boardId,
				role: boardMembers.role,
				profileId: boardMembers.profileId,
			})
			.from(boardMembers)
			.where(eq(boardMembers.userId, userId)),
	);

/**
 * A board the caller can use: owned or shared with them, not deleted, and not
 * inside a locked vault. `write` additionally rejects viewers.
 */
export const accessBoard = (
	userId: string,
	boardId: string,
	options: { write?: boolean; includeDeleted?: boolean } = {},
) =>
	Effect.gen(function* () {
		const access = yield* VaultAccess;
		const board = yield* query((db) =>
			db.query.boards.findFirst({ where: eq(boards.id, boardId) }),
		);
		if (
			!board ||
			(board.deletedAt && !options.includeDeleted) ||
			(board.vault && !opensWith(board, access))
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
	options: { write?: boolean; includeDeleted?: boolean; links?: boolean } = {},
) =>
	Effect.gen(function* () {
		const group = yield* query((db) =>
			db.query.groups.findFirst({ where: eq(groups.id, groupId) }),
		).pipe(Effect.flatMap((row) => owned("Group", row)));
		if (group.deletedAt && !options.includeDeleted)
			return yield* new NotFound({ entity: "Group" });
		// Smart groups fill themselves; links can't be put in them.
		if (options.links && group.kind !== "links")
			return yield* new InvalidInput({
				message: "Smart groups fill themselves. Pick a regular group.",
			});
		const { board } = yield* accessBoard(userId, group.boardId, options);
		return { group, board };
	});

/** A bookmark or folder the caller can use (through its group and board). */
export const accessBookmark = (
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

type Destination = { userId: string; vault: boolean; decoy: boolean };

/**
 * Items being dragged into place: each must be one the caller can change, on a
 * board with the same owner and on the same side of the vault (crossing it goes
 * through updateBookmark, which handles encryption).
 */
const accessMoving = (
	userId: string,
	ids: string[],
	destinations: Destination[],
) =>
	Effect.gen(function* () {
		const [destination, ...others] = destinations;
		const sameSide = (board: Destination) =>
			board.userId === destination.userId &&
			board.vault === destination.vault &&
			board.decoy === destination.decoy;
		if (!others.every(sameSide)) return yield* cantMove();
		const unique = [...new Set(ids)];
		if (unique.length === 0) return;
		const rows = yield* query((db) =>
			db
				.select({ boardId: groups.boardId })
				.from(bookmarks)
				.innerJoin(groups, eq(groups.id, bookmarks.groupId))
				.where(inArray(bookmarks.id, unique)),
		);
		if (rows.length !== unique.length)
			return yield* new NotFound({ entity: "Bookmark" });
		for (const boardId of new Set(rows.map((row) => row.boardId))) {
			const { board } = yield* accessBoard(userId, boardId, { write: true });
			if (!sameSide(board)) return yield* cantMove();
		}
	});

const cantMove = () =>
	new InvalidInput({
		message:
			"Links can only be dragged between boards with the same owner. To move one in or out of the vault, edit it.",
	});

/** Every folder/link nested anywhere inside the given folders (any depth). */
export const descendantIds = (folderIds: string[]) =>
	folderIds.length === 0
		? Effect.succeed([] as string[])
		: query((db) =>
				db.all<{ id: string }>(
					sql`WITH RECURSIVE tree(id) AS (
						SELECT id FROM bookmarks WHERE parent_id IN (${sql.join(
							folderIds.map((id) => sql`${id}`),
							sql`, `,
						)})
						UNION SELECT b.id FROM bookmarks b JOIN tree t ON b.parent_id = t.id
					) SELECT id FROM tree`,
				),
			).pipe(Effect.map((rows) => rows.map((row) => row.id)));

/** The folders containing an item, nearest first. */
const ancestorIds = (id: string) =>
	query((db) =>
		db.all<{ id: string }>(
			sql`WITH RECURSIVE up(id, parent) AS (
				SELECT id, parent_id FROM bookmarks WHERE id = ${id}
				UNION SELECT b.id, b.parent_id FROM bookmarks b JOIN up ON b.id = up.parent
			) SELECT id FROM up WHERE id != ${id}`,
		),
	).pipe(Effect.map((rows) => rows.map((row) => row.id)));

const cantNest = () =>
	new InvalidInput({ message: "A folder can't go inside itself" });

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
export const created = (table: Snapshot["table"], id: string): Snapshot => ({
	table,
	id,
	values: { deletedAt: Date.now() },
});

const SINGULAR = {
	boards: "board",
	groups: "group",
	bookmarks: "bookmark",
} as const;

/**
 * Which vault (if any) a change touched, before or after, so its history entry
 * stays hidden with the vault.
 */
const vaultSlotOf = (snapshots: Snapshot[]) =>
	Effect.gen(function* () {
		const ids = { boards: new Set<string>(), groups: new Set<string>() };
		const bookmarkIds: string[] = [];
		for (const snap of snapshots) {
			if (snap.table === "boards") ids.boards.add(snap.id);
			if (snap.table === "groups") ids.groups.add(snap.id);
			if (snap.table === "bookmarks") bookmarkIds.push(snap.id);
			const { boardId, groupId } = snap.values;
			if (typeof boardId === "string") ids.boards.add(boardId);
			if (typeof groupId === "string") ids.groups.add(groupId);
		}
		const [viaGroups, viaBookmarks] = yield* query((db) =>
			Promise.all([
				ids.groups.size
					? db
							.select({ boardId: groups.boardId })
							.from(groups)
							.where(inArray(groups.id, [...ids.groups]))
					: [],
				bookmarkIds.length
					? db
							.select({ boardId: groups.boardId })
							.from(bookmarks)
							.innerJoin(groups, eq(groups.id, bookmarks.groupId))
							.where(inArray(bookmarks.id, bookmarkIds))
					: [],
			]),
		);
		for (const row of [...viaGroups, ...viaBookmarks])
			ids.boards.add(row.boardId);
		if (ids.boards.size === 0) return null;
		const vaultBoard = yield* query((db) =>
			db.query.boards.findFirst({
				where: and(inArray(boards.id, [...ids.boards]), eq(boards.vault, true)),
			}),
		);
		return vaultBoard ? (vaultBoard.decoy ? "decoy" : "main") : null;
	});

/** History entries visible right now: vault changes only while it's open. */
const visibleActivity = (userId: string) =>
	Effect.map(VaultAccess, (access) =>
		and(
			eq(activity.userId, userId),
			access
				? or(isNull(activity.vaultSlot), eq(activity.vaultSlot, access.slot))
				: isNull(activity.vaultSlot),
		),
	);

/** Logs an undoable change and notifies the user's webhooks. */
export const record = (
	userId: string,
	action: string,
	label: string,
	snapshots: Snapshot[],
) =>
	snapshots.length === 0
		? Effect.void
		: Effect.gen(function* () {
				const vaultSlot = yield* vaultSlotOf(snapshots);
				yield* query((db) =>
					db
						.insert(activity)
						.values({ userId, action, label, snapshots, vaultSlot }),
				);
				// Webhooks leave the server; vault activity never does.
				if (vaultSlot) return;
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

export const quote = (text: string) =>
	`“${text.length > 40 ? `${text.slice(0, 39)}…` : text}”`;

export const nextPosition = (
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

/** A link or folder with everything nested inside it. */
export type TreeItem = Bookmark & { children: TreeItem[] };

/** All links and folders in a tree, depth-first, with the folder names above each. */
export function walkTree(
	items: TreeItem[],
	path: string[] = [],
): { item: TreeItem; path: string[] }[] {
	return items.flatMap((item) => [
		{ item, path },
		...walkTree(
			item.children,
			item.kind === "folder" ? [...path, item.title] : path,
		),
	]);
}

/** Meta the browser actually uses (drops bookkeeping like index and sync state). */
const clientMeta = (meta: BookmarkMeta): BookmarkMeta => {
	const {
		indexedAt: _indexed,
		browserId: _browser,
		feedUrl: _feedUrl,
		health,
		archive,
		feed,
		...rest
	} = meta;
	return {
		...rest,
		// Healthy links show nothing, so only problems travel.
		...(health && health.status !== "ok"
			? {
					health: {
						status: health.status,
						code: health.code,
						location: health.location,
						checkedAt: health.checkedAt,
					},
				}
			: {}),
		...(archive?.url ? { archive } : {}),
		...(feed ? { feed: { ...feed, items: feed.items.slice(0, 10) } } : {}),
	};
};

type ClientItem = Omit<
	TreeItem,
	"userId" | "updatedAt" | "deletedAt" | "children"
> & {
	children: ClientItem[];
};

const clientItem = ({
	userId: _user,
	updatedAt: _updated,
	deletedAt: _deleted,
	children,
	meta,
	...item
}: TreeItem): ClientItem => ({
	...item,
	meta: clientMeta(meta),
	children: children.map(clientItem),
});

/**
 * The home data as sent to the browser: the same shape as loadHome, minus
 * fields only the server uses. With thousands of links this roughly halves
 * the page (the whole library is embedded in it for instant rendering).
 */
const toClientHome = (home: Effect.Success<ReturnType<typeof loadHome>>) => ({
	...home,
	boards: home.boards.map((board) => ({
		...board,
		groups: board.groups.map((group) => ({
			...group,
			bookmarks: group.bookmarks.map(clientItem),
		})),
	})),
});
/** Cached alongside loadHome's own cache (same object until the next write). */
const clientHomes = new WeakMap<object, ReturnType<typeof toClientHome>>();
export const clientHome = (home: Parameters<typeof toClientHome>[0]) => {
	let view = clientHomes.get(home);
	if (!view) {
		view = toClientHome(home);
		clientHomes.set(home, view);
	}
	return view;
};

const loadHomeFresh = (userId: string) =>
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
			(board) =>
				!board.vault || (board.userId === userId && opensWith(board, access)),
		);
		const boardIds = boardRows.map((board) => board.id);
		const [groupRows, bookmarkRows, settingsRow, vault, profileRows] =
			yield* query((db) =>
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
					db.query.profiles.findMany({
						where: eq(profiles.userId, userId),
						orderBy: [asc(profiles.position), asc(profiles.createdAt)],
					}),
				]),
			);
		// Top-level items per group; folders carry their contents, any depth deep.
		// Items whose folder was deleted stay hidden with it.
		const children = new Map<string, Bookmark[]>();
		for (const row of bookmarkRows)
			if (row.parentId) {
				const list = children.get(row.parentId);
				if (list) list.push(row);
				else children.set(row.parentId, [row]);
			}
		// `path` holds the folders above this one, so a cycle can't recurse forever.
		const path = new Set<string>();
		const grow = (row: Bookmark): TreeItem => {
			if (path.has(row.id)) return { ...row, children: [] };
			path.add(row.id);
			const item = {
				...row,
				children: (children.get(row.id) ?? []).map(grow),
			};
			path.delete(row.id);
			return item;
		};
		// Top-level items, bucketed by group (rows arrive in position order).
		const byGroup = new Map<string, TreeItem[]>();
		for (const row of bookmarkRows) {
			if (row.parentId) continue;
			const item = grow(row);
			const list = byGroup.get(row.groupId);
			if (list) list.push(item);
			else byGroup.set(row.groupId, [item]);
		}
		const roles = new Map(shared.map((m) => [m.boardId, m.role as Role]));
		const placed = new Map(shared.map((m) => [m.boardId, m.profileId]));
		// Who shared each board with you.
		const ownerIds = [
			...new Set(
				boardRows.map((board) => board.userId).filter((id) => id !== userId),
			),
		];
		const owners = new Map(
			ownerIds.length
				? (yield* query((db) =>
						db
							.select({ id: user.id, name: user.name, username: user.username })
							.from(user)
							.where(inArray(user.id, ownerIds)),
					)).map((row) => [
						row.id,
						row.username ? `@${row.username}` : row.name,
					])
				: [],
		);
		return {
			userId,
			vault: {
				configured: Boolean(vault),
				unlocked: Boolean(access),
				/** Contents are end-to-end encrypted in the browser. */
				encrypted: Boolean(vault?.kdfSalt),
				/** Opens with a 4- or 6-digit PIN keypad instead of a password. */
				pinLength: (vault?.pinLength ?? null) as 4 | 6 | null,
				expiresAt: access?.expiresAt ?? null,
				autoLockMinutes: vault?.autoLockMinutes ?? 15,
			},
			settings: resolveSettings(settingsRow?.settings),
			/** Empty until a second profile is made (see profiles in db/schema). */
			profiles: profileRows.map(({ id, name, icon }) => ({ id, name, icon })),
			/** Server capabilities the UI can offer. */
			features: { ai: aiEnabled() },
			boards: boardRows.map((board) => ({
				...board,
				// Only the owner manages (and sees) a board's public link.
				shareSlug: board.userId === userId ? board.shareSlug : null,
				// Your own placement: the owner's for their boards, yours for shared ones.
				profileId:
					board.userId === userId
						? board.profileId
						: (placed.get(board.id) ?? null),
				role:
					board.userId === userId
						? ("owner" as Role)
						: (roles.get(board.id) ?? "viewer"),
				ownerName:
					board.userId === userId ? null : (owners.get(board.userId) ?? null),
				layout: resolveLayout(board.layout),
				groups: groupRows
					.filter((group) => group.boardId === board.id)
					.map((group) => ({
						...group,
						bookmarks: byGroup.get(group.id) ?? [],
					})),
			})),
		};
	});

type HomeSnapshot = Effect.Success<ReturnType<typeof loadHomeFresh>>;

/*
 * loadHome runs on most requests (page loads, search, adds, the AI agent),
 * and for big libraries the query and row decoding dominate. Results are
 * kept per user and vault state until anything at all is written to the
 * database (dataVersion), so they can never be stale. Callers treat the
 * result as read-only.
 */
const homeCache = new Map<string, { version: number; home: HomeSnapshot }>();
const HOME_CACHE_SIZE = 50;

export const loadHome = (userId: string) =>
	Effect.gen(function* () {
		const access = yield* VaultAccess;
		const key = `${userId}\u0000${access ? `${access.slot}:${access.expiresAt}` : ""}`;
		const hit = homeCache.get(key);
		if (hit && hit.version === dataVersion()) {
			// Most recently used last, so the oldest entry is evicted first.
			homeCache.delete(key);
			homeCache.set(key, hit);
			return hit.home;
		}
		const version = dataVersion();
		const home = yield* loadHomeFresh(userId);
		homeCache.delete(key);
		if (homeCache.size >= HOME_CACHE_SIZE)
			homeCache.delete(homeCache.keys().next().value as string);
		homeCache.set(key, { version, home });
		return home;
	});

const partialSettings = userSettingsSchema.partial();

/**
 * A partial settings update: only the keys the caller sent. Zod 4 fills in
 * defaults even for keys missing from a partial object, so parsing alone
 * would reset every defaulted setting (focus mode, custom CSS, tilt, the
 * active profile, …) whenever anything else was saved, like switching boards.
 */
export const settingsInput = z
	.record(z.string(), z.unknown())
	.transform((input, ctx) => {
		const result = partialSettings.safeParse(input);
		if (!result.success) {
			for (const issue of result.error.issues)
				ctx.addIssue({
					code: "custom",
					message: issue.message,
					path: issue.path,
				});
			return z.NEVER;
		}
		return Object.fromEntries(
			Object.entries(result.data).filter(([key]) => key in input),
		) as z.infer<typeof partialSettings>;
	});

/** Just the user's settings (with defaults), without loading the library. */
export const loadSettings = (userId: string) =>
	query((db) =>
		db.query.userSettings.findFirst({
			where: eq(userSettings.userId, userId),
		}),
	).pipe(Effect.map((row) => resolveSettings(row?.settings)));

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
	/** Which profile it goes in; the one on screen when omitted. */
	profileId: idSchema.nullish(),
	/** Create it inside the vault (requires an unlocked vault). */
	vault: z.boolean().optional(),
});

/**
 * The profile new boards go into: `wanted` if it's one of yours, else the one
 * on screen, else the first. Null while you have just the one implicit profile.
 */
export const profileFor = (userId: string, wanted?: string | null) =>
	Effect.gen(function* () {
		const [rows, settingsRow] = yield* query((db) =>
			Promise.all([
				db
					.select({ id: profiles.id })
					.from(profiles)
					.where(eq(profiles.userId, userId))
					.orderBy(asc(profiles.position), asc(profiles.createdAt)),
				db.query.userSettings.findFirst({
					where: eq(userSettings.userId, userId),
				}),
			]),
		);
		if (!rows.length) return null;
		const active = resolveSettings(settingsRow?.settings).activeProfileId;
		return (
			rows.find((row) => row.id === wanted)?.id ??
			rows.find((row) => row.id === active)?.id ??
			rows[0].id
		);
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
		const access = yield* VaultAccess;
		const position = yield* nextPosition(boards, eq(boards.userId, userId));
		// Vault boards show in every profile.
		const profileId = data.vault
			? null
			: yield* profileFor(userId, data.profileId);
		const [board] = yield* query((db) =>
			db
				.insert(boards)
				.values({
					userId,
					profileId,
					name: data.name,
					icon: data.icon ?? null,
					vault: data.vault ?? false,
					decoy: Boolean(data.vault && access?.slot === "decoy"),
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
	/**
	 * With end-to-end encryption, crossing the vault boundary re-encodes every
	 * link in the browser: sealed contents going in, readable ones coming out.
	 */
	items: z
		.array(
			z.object({
				id: idSchema,
				sealed: sealedSchema.optional(),
				plain: z
					.object({
						title: z.string().max(200),
						url: z.string().max(2048),
						description: z.string().max(500).nullish(),
						icon: z.string().max(2048).nullish(),
						tags: z.array(z.string().max(32)).max(20),
					})
					.optional(),
			}),
		)
		.max(3000)
		.optional(),
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
		const crossing = data.vault !== undefined && data.vault !== board.vault;
		const access = yield* VaultAccess;
		const reencode = crossing && (yield* vaultSealed(board.userId));
		if (reencode) {
			const rows = yield* query((db) =>
				db
					.select({
						id: bookmarks.id,
						kind: bookmarks.kind,
						meta: bookmarks.meta,
					})
					.from(bookmarks)
					.innerJoin(groups, eq(groups.id, bookmarks.groupId))
					.where(
						and(eq(groups.boardId, board.id), isNull(bookmarks.deletedAt)),
					),
			);
			const items = new Map((data.items ?? []).map((item) => [item.id, item]));
			const missing = rows.some((row) =>
				data.vault
					? !items.get(row.id)?.sealed
					: row.meta.sealed && !items.get(row.id)?.plain,
			);
			if (missing) return yield* mustSeal();
			yield* query((db) =>
				db.transaction(async (tx) => {
					for (const row of rows) {
						const item = items.get(row.id);
						if (data.vault && item?.sealed)
							await tx
								.update(bookmarks)
								.set(sealedColumns(item.sealed, row.kind))
								.where(eq(bookmarks.id, row.id));
						else if (!data.vault && item?.plain)
							await tx
								.update(bookmarks)
								.set({
									...item.plain,
									description: item.plain.description ?? null,
									icon: item.plain.icon ?? null,
									meta:
										row.kind === "link"
											? { favicon: faviconFor(item.plain.url) }
											: {},
								})
								.where(eq(bookmarks.id, row.id));
					}
				}),
			);
		}
		const before = yield* snapshot("boards", [board.id]);
		const [updated] = yield* query((db) =>
			db
				.update(boards)
				.set({
					vault: data.vault ?? board.vault,
					...(crossing
						? {
								decoy: Boolean(data.vault && access?.slot === "decoy"),
								// Vault boards are never public.
								...(data.vault ? { shareSlug: null } : {}),
							}
						: {}),
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
			// Re-encrypted contents can't be rolled back by undo.
			reencode ? [] : before,
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
					// On the browser bookmarks board, groups made here stay tabz-only.
					options: {
						...data.options,
						browserId: undefined,
						local: browserSync.isBrowserBoard(board) || undefined,
					},
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
						? {
								...group.options,
								...data.options,
								// Only sync sets these.
								browserId: group.options.browserId,
								local: group.options.local,
							}
						: group.options,
				})
				.where(eq(groups.id, group.id))
				.returning(),
		);
		if (
			browserSync.isBrowserBoard(board) &&
			group.options.browserId &&
			updated.name !== group.name
		)
			yield* browserSync.queueOps(board.userId, [
				{
					type: "update",
					browserId: group.options.browserId,
					title: updated.name,
				},
			]);
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

export const saveWidgetInput = z.object({
	id: idSchema,
	widget: widgetSchema,
});

/**
 * Saves a widget's content (notes, to-dos, settings). Unlike updateGroup it
 * skips the activity log, since it fires on every keystroke.
 */
export const saveWidget = (
	userId: string,
	data: z.infer<typeof saveWidgetInput>,
) =>
	Effect.gen(function* () {
		const { group } = yield* accessGroup(userId, data.id, { write: true });
		if (group.kind !== "widget")
			return yield* new InvalidInput({ message: "That group isn't a widget" });
		yield* query((db) =>
			db
				.update(groups)
				.set({ options: { ...group.options, widget: data.widget } })
				.where(eq(groups.id, group.id)),
		);
		return { ok: true };
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
			// Encrypted vault links have no readable URL to compare.
			home.boards
				.filter((board) => !board.vault)
				.flatMap((board) =>
					board.groups.flatMap((group) =>
						walkTree(group.bookmarks)
							.filter(({ item }) => item.kind === "link")
							.map(({ item: child, path }) => ({
								id: child.id,
								title: child.title,
								url: child.url,
								path: [board.name, group.name, ...path].join(" / "),
							})),
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
	/** Encrypted contents, required for vault boards with end-to-end encryption. */
	sealed: sealedSchema.optional(),
	...bookmarkFields,
});

export const createBookmark = (
	userId: string,
	data: z.infer<typeof createBookmarkInput>,
) =>
	Effect.gen(function* () {
		const target = data.parentId
			? yield* accessFolder(userId, data.parentId)
			: yield* accessGroup(userId, data.groupId, { write: true, links: true });
		// A folder's contents live in the folder's group.
		const groupId = target.group.id;
		const sealed =
			target.board.vault && (yield* vaultSealed(target.board.userId));
		if (sealed !== Boolean(data.sealed))
			return yield* sealed
				? mustSeal()
				: new InvalidInput({ message: "Only vault links are encrypted" });
		if (sealed && data.sealed) {
			// The server never sees what this link is: no lookups, no indexing.
			const position = yield* nextSlot(groupId, data.parentId ?? null);
			const [bookmark] = yield* query((db) =>
				db
					.insert(bookmarks)
					.values({
						userId: target.board.userId,
						groupId,
						parentId: data.parentId ?? null,
						color: data.color ?? null,
						incognito: data.incognito ?? false,
						position,
						...sealedColumns(data.sealed as string, "link"),
					})
					.returning(),
			);
			yield* record(userId, "create", "Added a vault link", [
				created("bookmarks", bookmark.id),
			]);
			return bookmark;
		}
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
		if (browserSync.isBrowserBoard(target.board)) {
			const parent = browserSync.browserParent(
				target.group,
				"bookmark" in target ? (target.bookmark as Bookmark) : null,
			);
			if (parent)
				yield* browserSync.queueOps(target.board.userId, [
					{
						type: "create",
						title: bookmark.title,
						url: bookmark.url,
						bookmarkId: bookmark.id,
						...parent,
					},
				]);
		}
		// Index the page text and load its feed in the background.
		yield* Effect.forkDetach(
			(fetched ? Effect.succeed(fetched) : fetchPageMetadata(url)).pipe(
				Effect.flatMap((page) =>
					afterFetch(
						{
							id: bookmark.id,
							title: bookmark.title,
							vault: target.board.vault,
						},
						page,
					),
				),
			),
		);
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
			links: true,
		});
		if (board.vault && (yield* vaultSealed(board.userId)))
			return yield* new InvalidInput({
				message: "Add vault links one at a time so they're encrypted",
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
		const parent =
			browserSync.isBrowserBoard(board) &&
			browserSync.browserParent(group, null);
		if (parent)
			yield* browserSync.queueOps(
				board.userId,
				rows.map((row) => ({
					type: "create" as const,
					title: titleFromUrl(row.url),
					url: row.url,
					bookmarkId: row.id,
					...parent,
				})),
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
							).pipe(
								Effect.andThen(
									afterFetch(
										{
											id: row.id,
											title: meta.title ?? titleFromUrl(row.url),
											vault: board.vault,
										},
										meta,
									),
								),
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
	/** Create it inside this folder (any depth); defaults to the group's top level. */
	parentId: idSchema.nullish(),
	/** Existing bookmarks to move into the new folder. */
	bookmarkIds: z.array(idSchema).max(200).optional(),
	/** Encrypted title/icon for vault folders (see createBookmarkInput). */
	sealed: sealedSchema.optional(),
});

export const createFolder = (
	userId: string,
	data: z.infer<typeof createFolderInput>,
) =>
	Effect.gen(function* () {
		const { group, board } = data.parentId
			? yield* accessFolder(userId, data.parentId)
			: yield* accessGroup(userId, data.groupId, {
					write: true,
					links: true,
				});
		const sealed = board.vault && (yield* vaultSealed(board.userId));
		if (sealed !== Boolean(data.sealed))
			return yield* sealed
				? mustSeal()
				: new InvalidInput({ message: "Only vault folders are encrypted" });
		const position = yield* nextSlot(group.id, data.parentId ?? null);
		const [folder] = yield* query((db) =>
			db
				.insert(bookmarks)
				.values({
					userId: board.userId,
					groupId: group.id,
					parentId: data.parentId ?? null,
					kind: "folder",
					title: data.title,
					url: "",
					icon: data.icon ?? null,
					color: data.color ?? null,
					incognito: data.incognito ?? false,
					position,
					...(data.sealed ? sealedColumns(data.sealed, "folder") : {}),
				})
				.returning(),
		);
		yield* record(userId, "create", `Created folder ${quote(folder.title)}`, [
			created("bookmarks", folder.id),
		]);
		if (browserSync.isBrowserBoard(board)) {
			const parent = yield* browserParentOf(group.id, data.parentId ?? null);
			if (parent)
				yield* browserSync.queueOps(board.userId, [
					{
						type: "folder",
						title: folder.title,
						bookmarkId: folder.id,
						...parent,
					},
				]);
		}
		if (data.bookmarkIds?.length)
			yield* arrangeFolder(userId, {
				folderId: folder.id,
				ids: data.bookmarkIds,
			});
		return folder;
	});

/** The browser folder a tabz group/folder corresponds to (browser bookmarks board). */
const browserParentOf = (groupId: string, parentId: string | null) =>
	Effect.gen(function* () {
		const group = yield* query((db) =>
			db.query.groups.findFirst({ where: eq(groups.id, groupId) }),
		);
		const folder = parentId
			? yield* query((db) =>
					db.query.bookmarks.findFirst({ where: eq(bookmarks.id, parentId) }),
				)
			: null;
		return group ? browserSync.browserParent(group, folder ?? null) : null;
	});

export const updateBookmarkInput = z.object({
	id: idSchema,
	url: z.string().max(2048).optional(),
	groupId: idSchema.optional(),
	/** Folder to move into, or null to move out to the group's top level. */
	parentId: idSchema.nullish(),
	/** New encrypted contents (vault boards with end-to-end encryption). */
	sealed: sealedSchema.optional(),
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
		let destination = board;
		if (data.parentId !== undefined && data.parentId !== bookmark.parentId) {
			parentId = data.parentId;
			if (parentId) {
				if (
					isFolder &&
					(parentId === bookmark.id ||
						(yield* descendantIds([bookmark.id])).includes(parentId))
				)
					return yield* cantNest();
				const folder = yield* accessFolder(userId, parentId);
				if (folder.board.userId !== board.userId)
					return yield* new InvalidInput({
						message: "Links can only move between boards with the same owner",
					});
				groupId = folder.bookmark.groupId;
				destination = folder.board;
			}
		}
		if (data.groupId && data.groupId !== groupId && !parentId) {
			const target = yield* accessGroup(userId, data.groupId, {
				write: true,
				links: true,
			});
			if (target.board.userId !== board.userId)
				return yield* new InvalidInput({
					message: "Links can only move between boards with the same owner",
				});
			groupId = data.groupId;
			destination = target.board;
		}
		// End-to-end encrypted vaults: contents must arrive sealed, and sealed
		// items leaving the vault must arrive readable again.
		const wasSealed = Boolean(bookmark.meta.sealed);
		const sealHere =
			destination.vault && (yield* vaultSealed(destination.userId));
		if (sealHere && !data.sealed && !wasSealed) return yield* mustSeal();
		if (!sealHere && data.sealed)
			return yield* new InvalidInput({
				message: "Only vault items are encrypted",
			});
		if (!sealHere && wasSealed && !(isFolder ? data.title : data.url))
			return yield* new InvalidInput({
				message: "Unlock your vault to move this out of it",
			});
		if (isFolder && sealHere !== wasSealed && destination.id !== board.id)
			return yield* new InvalidInput({
				message: "Move folders in or out of the vault one link at a time",
			});
		const moved =
			groupId !== bookmark.groupId || parentId !== bookmark.parentId;
		const position = moved
			? yield* nextSlot(groupId, parentId)
			: bookmark.position;
		// Everything inside a folder, at any depth, travels with it.
		const childIds =
			isFolder && groupId !== bookmark.groupId
				? yield* descendantIds([bookmark.id])
				: [];
		const before = yield* snapshot("bookmarks", [bookmark.id, ...childIds]);
		const [updated] = yield* query((db) =>
			db.transaction(async (tx) => {
				if (childIds.length)
					await tx
						.update(bookmarks)
						.set({ groupId })
						.where(inArray(bookmarks.id, childIds));
				if (sealHere)
					return tx
						.update(bookmarks)
						.set({
							groupId,
							parentId,
							position,
							color: data.color === undefined ? bookmark.color : data.color,
							incognito: data.incognito ?? bookmark.incognito,
							...(data.sealed ? sealedColumns(data.sealed, bookmark.kind) : {}),
						})
						.where(eq(bookmarks.id, bookmark.id))
						.returning();
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
						meta: wasSealed
							? isFolder
								? {}
								: { favicon: faviconFor(url) }
							: url === bookmark.url
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
		// Browser bookmarks board: send the change back to the browser.
		const browserId = bookmark.meta.browserId;
		if (
			browserSync.isBrowserBoard(destination) &&
			destination.id === board.id &&
			browserId
		) {
			const ops: BrowserOp[] = [];
			if (updated.title !== bookmark.title || updated.url !== bookmark.url)
				ops.push({
					type: "update",
					browserId,
					title: updated.title,
					...(!isFolder && updated.url !== bookmark.url
						? { url: updated.url }
						: {}),
				});
			if (moved) {
				const parent = yield* browserParentOf(groupId, parentId);
				if (parent) ops.push({ type: "move", browserId, ...parent });
			}
			yield* browserSync.queueOps(board.userId, ops);
		} else if (
			browserSync.isBrowserBoard(destination) &&
			destination.id !== board.id &&
			!isFolder
		) {
			// Moved in from another board: add it to the browser too.
			const parent = yield* browserParentOf(groupId, parentId);
			if (parent)
				yield* browserSync.queueOps(destination.userId, [
					{
						type: "create",
						title: updated.title,
						url: updated.url,
						bookmarkId: updated.id,
						...parent,
					},
				]);
		}
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
		const { bookmark, board } = yield* accessBookmark(userId, data.id, {
			write: true,
		});
		const isFolder = bookmark.kind === "folder";
		const inside =
			isFolder && !data.withContents
				? yield* query((db) =>
						db
							.select({ id: bookmarks.id, meta: bookmarks.meta })
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
		const start = inside.length
			? yield* nextSlot(bookmark.groupId, bookmark.parentId)
			: 0;
		yield* query((db) =>
			db.transaction(async (tx) => {
				// Release the folder's contents to wherever the folder itself was.
				for (const [offset, child] of inside.entries())
					await tx
						.update(bookmarks)
						.set({ parentId: bookmark.parentId, position: start + offset })
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
		const browserId = bookmark.meta.browserId;
		if (browserSync.isBrowserBoard(board) && browserId) {
			const ops: BrowserOp[] = [];
			// Contents kept: move them up in the browser too, then drop the folder.
			const up = inside.length
				? yield* browserParentOf(bookmark.groupId, bookmark.parentId)
				: null;
			for (const child of inside)
				if (child.meta.browserId && up)
					ops.push({ type: "move", browserId: child.meta.browserId, ...up });
			ops.push({
				type: "remove",
				browserId,
				...(isFolder
					? { tree: Boolean(data.withContents) }
					: { url: bookmark.url }),
			});
			yield* browserSync.queueOps(board.userId, ops);
		}
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
		const destinations: Destination[] = [];
		for (const groupId of new Set(data.groups.map((group) => group.groupId)))
			destinations.push(
				(yield* accessGroup(userId, groupId, { write: true, links: true }))
					.board,
			);
		const ids = data.groups.flatMap((group) => group.ids);
		yield* accessMoving(userId, ids, destinations);
		const owner = destinations[0].userId;
		const childIds = yield* descendantIds(ids);
		const insideOf = new Map<string, string[]>();
		for (const id of ids) insideOf.set(id, yield* descendantIds([id]));
		const before = yield* snapshot("bookmarks", [...ids, ...childIds]);
		yield* query((db) =>
			db.transaction(async (tx) => {
				for (const group of data.groups) {
					for (const [position, id] of group.ids.entries()) {
						await tx
							.update(bookmarks)
							.set({ groupId: group.groupId, parentId: null, position })
							.where(and(eq(bookmarks.id, id), eq(bookmarks.userId, owner)));
						// Keep folder contents (any depth) in the same group as the folder.
						const inside = insideOf.get(id) ?? [];
						if (inside.length)
							await tx
								.update(bookmarks)
								.set({ groupId: group.groupId })
								.where(
									and(
										inArray(bookmarks.id, inside),
										eq(bookmarks.userId, owner),
									),
								);
					}
				}
			}),
		);
		yield* record(userId, "move", "Rearranged links", before);
		return { ok: true };
	});

/** Sets a folder's exact contents order; ids from elsewhere (links or folders) are moved in. */
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
		// A folder can't end up inside itself or one of its own subfolders.
		const above = new Set([folder.id, ...(yield* ancestorIds(folder.id))]);
		if (data.ids.some((id) => above.has(id))) return yield* cantNest();
		yield* accessMoving(userId, data.ids, [board]);
		const inside = yield* descendantIds(data.ids);
		const before = yield* snapshot("bookmarks", [...data.ids, ...inside]);
		yield* query((db) =>
			db.transaction(async (tx) => {
				for (const [position, id] of data.ids.entries()) {
					await tx
						.update(bookmarks)
						.set({ groupId: folder.groupId, parentId: folder.id, position })
						.where(
							and(eq(bookmarks.id, id), eq(bookmarks.userId, board.userId)),
						);
				}
				if (inside.length)
					await tx
						.update(bookmarks)
						.set({ groupId: folder.groupId })
						.where(
							and(
								inArray(bookmarks.id, inside),
								eq(bookmarks.userId, board.userId),
							),
						);
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
		const { bookmark, board } = yield* accessBookmark(userId, data.id);
		if (bookmark.kind === "folder") return bookmark;
		const meta = yield* fetchPageMetadata(bookmark.url);
		yield* Effect.forkDetach(
			afterFetch(
				{ id: bookmark.id, title: bookmark.title, vault: board.vault },
				meta,
			),
		);
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
				db.batch([
					db
						.update(bookmarks)
						.set({
							visitCount: sql`${bookmarks.visitCount} + 1`,
							lastVisitedAt: new Date(),
							updatedAt: sql`${bookmarks.updatedAt}`,
						})
						.where(eq(bookmarks.id, bookmark.id)),
					db.insert(visits).values({ userId, bookmarkId: bookmark.id }),
				]),
			),
		),
		Effect.as({ ok: true }),
	);

type ImportItem = { title: string; url?: string; items?: ImportItem[] };

// Links and folders, nested to any depth.
const importItem: z.ZodType<ImportItem> = z.lazy(() =>
	z.object({
		title: z.string().max(200),
		url: z.string().max(2048).optional(),
		items: z.array(importItem).max(5000).optional(),
	}),
);

export const importBookmarksInput = z.object({
	boardName: z.string().trim().min(1).max(60),
	groups: z
		.array(
			z.object({
				name: z.string().trim().min(1).max(60),
				bookmarks: z.array(importItem).max(5000),
			}),
		)
		.min(1)
		.max(200),
});

/** Imports a parsed browser bookmark export as a new board, keeping folders. */
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
				const insert = async (
					items: ImportItem[],
					groupId: string,
					parentId: string | null,
					depth: number,
				) => {
					const links = [];
					for (const [index, item] of items.entries()) {
						if (item.items) {
							if (depth > 32 || imported >= 10_000) continue;
							const [folder] = await tx
								.insert(bookmarks)
								.values({
									userId,
									groupId,
									parentId,
									kind: "folder",
									title: item.title.trim().slice(0, 60) || "Folder",
									url: "",
									position: index,
								})
								.returning({ id: bookmarks.id });
							await insert(item.items, groupId, folder.id, depth + 1);
							continue;
						}
						const url = normalizeUrl(item.url ?? "");
						if (!url || imported >= 10_000) continue;
						imported++;
						links.push({
							userId,
							groupId,
							parentId,
							url,
							title: item.title.trim() || titleFromUrl(url),
							position: index,
							meta: { favicon: faviconFor(url) },
						});
					}
					for (let i = 0; i < links.length; i += 200)
						await tx.insert(bookmarks).values(links.slice(i, i + 200));
				};
				for (const [groupIndex, group] of data.groups.entries()) {
					const [createdGroup] = await tx
						.insert(groups)
						.values({
							userId,
							boardId: board.id,
							name: group.name,
							position: groupIndex,
						})
						.returning();
					await insert(group.bookmarks, createdGroup.id, null, 0);
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

type LinkEntry = {
	bookmark: Bookmark;
	board: string;
	group: string;
	folder: string | null;
	/** Opens in a private window (its own switch, a private folder, or "all links"). */
	private: boolean;
	/** Matching passage from the page text, when found by full-text search. */
	snippet?: string;
};

type Home = Effect.Success<ReturnType<typeof loadHome>>;

/** Every link on the given boards (default: all the caller can see), with where it lives. */
const visibleLinks = (home: Home, boardList: Home["boards"] = home.boards) => {
	const out: LinkEntry[] = [];
	const walk = (
		items: TreeItem[],
		path: string[],
		inPrivate: boolean,
		board: string,
		group: string,
	) => {
		for (const item of items) {
			if (item.kind === "folder")
				walk(
					item.children,
					[...path, item.title],
					inPrivate || item.incognito,
					board,
					group,
				);
			else
				out.push({
					bookmark: item,
					board,
					group,
					folder: path.length ? path.join(" / ") : null,
					private: home.settings.incognitoAll || inPrivate || item.incognito,
				});
		}
	};
	for (const board of boardList)
		for (const group of board.groups)
			walk(group.bookmarks, [], false, board.name, group.name);
	return out;
};

/**
 * Case-insensitive match on title, URL, description and tags (most-visited
 * first), followed by matches inside the saved pages' text.
 */
export const searchBookmarks = (
	userId: string,
	data: z.infer<typeof searchInput>,
) =>
	Effect.gen(function* () {
		const limit = data.limit ?? 25;
		const links = visibleLinks(yield* loadHome(userId));
		const terms = data.query.toLowerCase().split(/\s+/);
		const direct = links
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
			.slice(0, limit);
		if (direct.length >= limit) return direct;
		const found = new Set(direct.map((entry) => entry.bookmark.id));
		const byId = new Map(links.map((entry) => [entry.bookmark.id, entry]));
		const hits = yield* searchText(
			data.query,
			new Set([...byId.keys()].filter((id) => !found.has(id))),
			limit - direct.length,
		);
		return [
			...direct,
			...hits.flatMap((hit) => {
				const entry = byId.get(hit.id);
				return entry ? [{ ...entry, snippet: hit.snippet }] : [];
			}),
		];
	});

/** Page-text matches only, for the ⌘K palette (title matches happen client-side). */
export const searchContent = (
	userId: string,
	data: z.infer<typeof searchInput>,
) =>
	Effect.gen(function* () {
		const links = visibleLinks(yield* loadHome(userId));
		return yield* searchText(
			data.query,
			new Set(links.map((entry) => entry.bookmark.id)),
			data.limit ?? 12,
		);
	});

/** Links whose last check found them broken or moved. */
export const listLinkHealth = (userId: string) =>
	loadHome(userId).pipe(
		Effect.map((home) => {
			const links = visibleLinks(
				home,
				home.boards.filter((board) => !board.vault),
			);
			return {
				checked: links.filter((entry) => entry.bookmark.meta.health).length,
				total: links.length,
				problems: links.flatMap(({ bookmark, board, group, folder }) => {
					const health = bookmark.meta.health;
					return health && health.status !== "ok"
						? [
								{
									id: bookmark.id,
									title: bookmark.title,
									url: bookmark.url,
									groupId: bookmark.groupId,
									path: [board, group, folder].filter(Boolean).join(" / "),
									health,
									archive: bookmark.meta.archive?.url ?? null,
								},
							]
						: [];
				}),
			};
		}),
	);

export const checkLinksInput = z.object({
	ids: z.array(idSchema).max(200).optional(),
});

/** Checks the given links (or the 150 least recently checked) right now. */
export const checkLinks = (
	userId: string,
	data: z.infer<typeof checkLinksInput>,
) =>
	Effect.gen(function* () {
		const home = yield* loadHome(userId);
		const wanted = data.ids ? new Set(data.ids) : null;
		const links = visibleLinks(
			home,
			home.boards.filter((board) => !board.vault),
		)
			.map((entry) => entry.bookmark)
			.filter((bookmark) => !wanted || wanted.has(bookmark.id))
			.sort(
				(a, b) =>
					(a.meta.health?.checkedAt ?? 0) - (b.meta.health?.checkedAt ?? 0),
			)
			.slice(0, 150);
		const results = yield* checkLinksNow(links);
		return {
			checked: results.length,
			broken: results.filter((r) => r.health.status === "broken").length,
			redirected: results.filter((r) => r.health.status === "redirected")
				.length,
		};
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
	Effect.gen(function* () {
		const visible = yield* visibleActivity(userId);
		return yield* query((db) =>
			db
				.select({
					id: activity.id,
					action: activity.action,
					label: activity.label,
					undoneAt: activity.undoneAt,
					createdAt: activity.createdAt,
				})
				.from(activity)
				.where(visible)
				.orderBy(desc(activity.createdAt))
				.limit(data.limit ?? 50),
		);
	});

export const undoInput = z.object({ id: idSchema.optional() });

/** Reverts one change (the latest by default). */
export const undo = (userId: string, data: z.infer<typeof undoInput> = {}) =>
	Effect.gen(function* () {
		const visible = yield* visibleActivity(userId);
		const entry = yield* query((db) =>
			db.query.activity.findFirst({
				where: and(
					visible,
					isNull(activity.undoneAt),
					data.id ? eq(activity.id, data.id) : undefined,
				),
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

/** Vault boards the caller can't see right now (locked, or the other password's). */
const hiddenVaultBoards = (userId: string) =>
	Effect.gen(function* () {
		const access = yield* VaultAccess;
		const rows = yield* query((db) =>
			db
				.select({ id: boards.id, decoy: boards.decoy })
				.from(boards)
				.where(and(eq(boards.userId, userId), eq(boards.vault, true))),
		);
		return new Set(
			rows.filter((board) => !opensWith(board, access)).map((row) => row.id),
		);
	});

/** The board a trash item belongs to, or NotFound if it's hidden in the vault. */
const visibleTrashItem = (
	userId: string,
	data: z.infer<typeof trashItemInput>,
) =>
	Effect.gen(function* () {
		const boardId =
			data.type === "board"
				? data.id
				: data.type === "group"
					? (yield* query((db) =>
							db.query.groups.findFirst({ where: eq(groups.id, data.id) }),
						))?.boardId
					: (yield* query((db) =>
							db
								.select({ boardId: groups.boardId })
								.from(bookmarks)
								.innerJoin(groups, eq(groups.id, bookmarks.groupId))
								.where(eq(bookmarks.id, data.id)),
						))[0]?.boardId;
		if (!boardId || (yield* hiddenVaultBoards(userId)).has(boardId))
			return yield* new NotFound({ entity: "Item" });
	});

/** Everything deleted in the last 30 days that the user owns. */
export const listTrash = (userId: string) =>
	Effect.gen(function* () {
		const since = new Date(Date.now() - TRASH_DAYS * 86_400_000);
		const hidden = yield* hiddenVaultBoards(userId);
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
							boardId: groups.boardId,
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
							boardId: groups.boardId,
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
		// Nothing from a locked vault shows up here, not even that it exists.
		const shown = <T extends { boardId: string }>(rows: T[]) =>
			rows.filter((row) => !hidden.has(row.boardId));
		const items = [
			...shown(deletedBoards.map((row) => ({ ...row, boardId: row.id }))).map(
				(row) => ({
					type: "board" as const,
					id: row.id,
					title: row.title,
					detail: "Board",
					icon: row.icon,
					url: null,
					deletedAt: row.deletedAt as Date,
				}),
			),
			...shown(deletedGroups).map((row) => ({
				type: "group" as const,
				id: row.id,
				title: row.title,
				detail: `Group on ${row.board}`,
				icon: null,
				url: null,
				deletedAt: row.deletedAt as Date,
			})),
			...shown(deletedBookmarks).map((row) => ({
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
		yield* visibleTrashItem(userId, data);
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
			// Bring back every folder it sits in, so it's visible again.
			for (const id of yield* ancestorIds(bookmark.id))
				yield* restore(bookmarks, id);
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
		yield* visibleTrashItem(userId, data);
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

/** Empties the trash, leaving anything from a locked vault untouched. */
export const emptyTrash = (userId: string) =>
	Effect.gen(function* () {
		const hidden = [...(yield* hiddenVaultBoards(userId))];
		const visibleGroups = hidden.length
			? notInArray(groups.boardId, hidden)
			: undefined;
		yield* query((db) =>
			db.transaction(async (tx) => {
				const groupIds = tx
					.select({ id: groups.id })
					.from(groups)
					.where(and(eq(groups.userId, userId), visibleGroups));
				await tx
					.delete(bookmarks)
					.where(
						and(
							eq(bookmarks.userId, userId),
							isNotNull(bookmarks.deletedAt),
							hidden.length ? inArray(bookmarks.groupId, groupIds) : undefined,
						),
					);
				await tx
					.delete(groups)
					.where(
						and(
							eq(groups.userId, userId),
							isNotNull(groups.deletedAt),
							visibleGroups,
						),
					);
				await tx
					.delete(boards)
					.where(
						and(
							eq(boards.userId, userId),
							isNotNull(boards.deletedAt),
							hidden.length ? notInArray(boards.id, hidden) : undefined,
						),
					);
			}),
		);
		return { ok: true };
	});

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
				// Visit history only feeds monthly reports; keep about 13 months.
				await tx
					.delete(visits)
					.where(lt(visits.at, new Date(Date.now() - 400 * 86_400_000)));
			}),
		);
	});

/** A bookmark plus the page text saved for search (for AI assistants). */
export const readBookmark = (userId: string, id: string) =>
	Effect.gen(function* () {
		const { bookmark } = yield* accessBookmark(userId, id);
		const [row] = yield* query((db) =>
			db.all<{ body: string }>(
				sql`SELECT body FROM bookmark_text WHERE bookmark_id = ${bookmark.id} LIMIT 1`,
			),
		);
		return {
			id: bookmark.id,
			title: bookmark.title,
			url: bookmark.url,
			description: bookmark.description,
			tags: bookmark.tags,
			pageText: row?.body?.slice(0, 12_000) ?? "",
		};
	});

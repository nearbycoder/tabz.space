import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { boards, bookmarks, groups } from "#/db/schema";
import { NotFound } from "#/lib/effect/errors";
import { DEFAULT_BOARD_LAYOUT } from "#/lib/preferences";
import { faviconFor, normalizeUrl, titleFromUrl } from "#/lib/url";
import * as browserSync from "./browser-sync";
import * as library from "./library";
import { query } from "./runtime";

/*
 * "Save this somewhere sensible" entry points shared by MCP, the REST API, the
 * browser extension and the email/Telegram inboxes.
 */

type Home = Effect.Success<ReturnType<typeof library.loadHome>>;

export const findBoard = (home: Home, ref?: string) => {
	const own = home.boards.filter((b) => b.role !== "viewer");
	if (!ref)
		return (
			own.find((b) => b.id === home.settings.activeBoardId) ??
			own.find((b) => !b.source) ??
			own[0]
		);
	const lower = ref.toLowerCase();
	return own.find((b) => b.id === ref || b.name.toLowerCase() === lower);
};

export const smartAddInput = z.object({
	url: z.string().max(2048),
	title: z.string().max(200).optional(),
	description: z.string().max(500).optional(),
	tags: z.array(z.string().max(32)).max(20).optional(),
	groupId: z.string().optional(),
	group: z.string().max(60).optional(),
	board: z.string().optional(),
	folderId: z.string().optional(),
	folder: z.string().max(60).optional(),
});

/** Saves a URL, resolving board/group/folder by id or name (creating group/folder if missing). */
export const smartAdd = (userId: string, data: z.infer<typeof smartAddInput>) =>
	Effect.gen(function* () {
		const { groupId, group, board, folderId, folder, ...fields } = data;
		let targetGroupId = groupId;
		let home: Home | undefined;
		if (!targetGroupId) {
			home = yield* library.loadHome(userId);
			const targetBoard = findBoard(home, board);
			if (!targetBoard) return yield* new NotFound({ entity: "Board" });
			const linkGroups = targetBoard.groups.filter((g) => g.kind === "links");
			const named = group
				? linkGroups.find((g) => g.name.toLowerCase() === group.toLowerCase())
				: linkGroups[0];
			targetGroupId =
				named?.id ??
				(yield* library.createGroup(userId, {
					boardId: targetBoard.id,
					name: group ?? "Inbox",
				})).id;
		}
		let parentId = folderId;
		if (!parentId && folder) {
			// "Recipes / Desserts" walks (and creates) nested folders.
			home ??= yield* library.loadHome(userId);
			let level: library.TreeItem[] =
				home.boards.flatMap((b) => b.groups).find((g) => g.id === targetGroupId)
					?.bookmarks ?? [];
			for (const name of folder
				.split("/")
				.map((part) => part.trim())
				.filter(Boolean)) {
				const existing = level.find(
					(item) =>
						item.kind === "folder" &&
						item.title.toLowerCase() === name.toLowerCase(),
				);
				if (existing) {
					parentId = existing.id;
					level = existing.children;
				} else {
					parentId = (yield* library.createFolder(userId, {
						groupId: targetGroupId,
						parentId,
						title: name.slice(0, 60),
					})).id;
					level = [];
				}
			}
		}
		return yield* library.createBookmark(userId, {
			...fields,
			groupId: targetGroupId,
			parentId,
		});
	});

export const saveTabsInput = z.object({
	name: z.string().trim().max(60).optional(),
	board: z.string().optional(),
	/** Make the board (by name) when it doesn't exist yet, e.g. "Sessions". */
	createBoard: z.boolean().optional(),
	tabs: z
		.array(
			z.object({
				url: z.string().max(2048),
				title: z.string().max(200).optional(),
			}),
		)
		.min(1)
		.max(200),
});

/** Turns a window's open tabs into a new group (OneTab-style). */
export const saveTabsAsGroup = (
	userId: string,
	data: z.infer<typeof saveTabsInput>,
) =>
	Effect.gen(function* () {
		const home = yield* library.loadHome(userId);
		const stamp = new Date().toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
		const name = data.name || `Tabs · ${stamp}`;
		let targetBoard: { id: string } | undefined = findBoard(home, data.board);
		let group: { id: string; name: string };
		if (!targetBoard && data.createBoard && data.board) {
			// A new board comes with an empty group: the session goes there.
			const made = yield* library.createBoard(userId, {
				name: data.board.slice(0, 60),
			});
			targetBoard = made.board;
			group = yield* library.updateGroup(userId, {
				id: made.group.id,
				name,
				color: "#0ea5e9",
			});
		} else {
			if (!targetBoard) return yield* new NotFound({ entity: "Board" });
			group = yield* library.createGroup(userId, {
				boardId: targetBoard.id,
				name,
				color: "#0ea5e9",
			});
		}
		const result = yield* library.bulkCreateBookmarks(userId, {
			groupId: group.id,
			urls: data.tabs.map((tab) => tab.url),
			skipDuplicates: false,
		});
		return {
			groupId: group.id,
			boardId: targetBoard.id,
			name: group.name,
			saved: result.added,
		};
	});

export const browserSyncInput = z.object({
	folders: z
		.array(
			z.object({
				path: z.string().max(300),
				/** Folder names from the root (newer extensions); safer than splitting `path`. */
				segments: z.array(z.string().max(200)).max(40).optional(),
				/** The browser's ids for those folders (two-way sync). */
				segmentIds: z.array(z.string().max(40)).max(40).optional(),
				links: z
					.array(
						z.object({
							title: z.string().max(200),
							url: z.string().max(2048),
							id: z.string().max(40).optional(),
						}),
					)
					.max(5000),
			}),
		)
		.max(500),
});

/**
 * Mirrors the browser's bookmarks into a dedicated board, rebuilt on every
 * sync (groups made in tabz are left alone). Edits made to the board in tabz
 * go back to the browser first (./browser-sync), so a snapshot is refused
 * while any are still waiting.
 */
export const syncBrowserBookmarks = (
	userId: string,
	data: z.infer<typeof browserSyncInput>,
) =>
	Effect.gen(function* () {
		let board = yield* query((db) =>
			db.query.boards.findFirst({
				where: and(eq(boards.userId, userId), eq(boards.source, "browser")),
			}),
		);
		if (!board) {
			const [created] = yield* query((db) =>
				db
					.insert(boards)
					.values({
						userId,
						name: "Browser bookmarks",
						icon: "🔖",
						source: "browser",
						position: 900,
						layout: { ...DEFAULT_BOARD_LAYOUT, tileStyle: "list", columns: 4 },
					})
					.returning(),
			);
			board = created;
		}
		const boardId = board.id;
		const waiting = yield* browserSync.pendingCount(userId);
		if (waiting > 0)
			return {
				boardId,
				deferred: true,
				pending: waiting,
				links: 0,
				folders: 0,
				syncedAt: new Date().toISOString(),
			};
		const keep = yield* query((db) =>
			db
				.select({ id: groups.id, options: groups.options })
				.from(groups)
				.where(eq(groups.boardId, boardId)),
		);
		const mirrored = keep
			.filter((group) => !group.options.local)
			.map((group) => group.id);
		let total = 0;
		yield* query((db) =>
			db.transaction(async (tx) => {
				if (mirrored.length)
					await tx.delete(groups).where(inArray(groups.id, mirrored));
				// The browser's top-level folders (e.g. "Bookmarks bar") become
				// groups; everything deeper stays as nested folders.
				const groupIds = new Map<string, string>();
				const folderIds = new Map<string, string>();
				const childCount = new Map<string, number>();
				const nextIndex = (key: string) => {
					const index = childCount.get(key) ?? 0;
					childCount.set(key, index + 1);
					return index;
				};
				const groupFor = async (name: string, browserId?: string) => {
					const existing = groupIds.get(name);
					if (existing) return existing;
					const [group] = await tx
						.insert(groups)
						.values({
							userId,
							boardId,
							name: name.slice(0, 60) || "Bookmarks",
							position: groupIds.size,
							options: browserId ? { browserId } : {},
						})
						.returning({ id: groups.id });
					groupIds.set(name, group.id);
					return group.id;
				};
				const folderFor = async (
					groupId: string,
					trail: string[],
					trailIds: (string | undefined)[],
				): Promise<string | null> => {
					if (trail.length === 0) return null;
					const key = `${groupId}\u0000${trail.join("\u0000")}`;
					const existing = folderIds.get(key);
					if (existing) return existing;
					const parentId = await folderFor(
						groupId,
						trail.slice(0, -1),
						trailIds.slice(0, -1),
					);
					const browserId = trailIds.at(-1);
					const [folder] = await tx
						.insert(bookmarks)
						.values({
							userId,
							groupId,
							parentId,
							kind: "folder",
							title: (trail.at(-1) ?? "Folder").slice(0, 60),
							url: "",
							position: nextIndex(parentId ?? groupId),
							meta: browserId ? { browserId } : {},
						})
						.returning({ id: bookmarks.id });
					folderIds.set(key, folder.id);
					return folder.id;
				};
				for (const folder of data.folders) {
					const segments = (folder.segments ?? folder.path.split(" / ")).filter(
						Boolean,
					);
					const ids = folder.segmentIds ?? [];
					const rows = folder.links.flatMap((link) => {
						const url = normalizeUrl(link.url);
						return url
							? [
									{
										url,
										title: link.title.trim() || titleFromUrl(url),
										browserId: link.id,
									},
								]
							: [];
					});
					if (rows.length === 0) continue;
					const groupId = await groupFor(segments[0] ?? "Bookmarks", ids[0]);
					const parentId = await folderFor(
						groupId,
						segments.slice(1, 33),
						ids.slice(1, 33),
					);
					const values = rows.map(({ browserId, ...row }) => ({
						...row,
						userId,
						groupId,
						parentId,
						position: nextIndex(parentId ?? groupId),
						meta: {
							favicon: faviconFor(row.url),
							...(browserId ? { browserId } : {}),
						},
					}));
					for (let i = 0; i < values.length; i += 200)
						await tx.insert(bookmarks).values(values.slice(i, i + 200));
					total += rows.length;
				}
				await tx
					.update(boards)
					.set({ deletedAt: null, updatedAt: new Date() })
					.where(eq(boards.id, boardId));
			}),
		);
		return {
			boardId,
			links: total,
			folders: data.folders.length,
			syncedAt: new Date().toISOString(),
		};
	});

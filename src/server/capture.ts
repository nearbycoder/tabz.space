import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { boards, bookmarks, groups } from "#/db/schema";
import { NotFound } from "#/lib/effect/errors";
import { DEFAULT_BOARD_LAYOUT } from "#/lib/preferences";
import { faviconFor, normalizeUrl, titleFromUrl } from "#/lib/url";
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
			home ??= yield* library.loadHome(userId);
			const existing = home.boards
				.flatMap((b) => b.groups)
				.find((g) => g.id === targetGroupId)
				?.bookmarks.find(
					(item) =>
						item.kind === "folder" &&
						item.title.toLowerCase() === folder.toLowerCase(),
				);
			parentId =
				existing?.id ??
				(yield* library.createFolder(userId, {
					groupId: targetGroupId,
					title: folder,
				})).id;
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
		const targetBoard = findBoard(home, data.board);
		if (!targetBoard) return yield* new NotFound({ entity: "Board" });
		const stamp = new Date().toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
		const group = yield* library.createGroup(userId, {
			boardId: targetBoard.id,
			name: data.name || `Tabs · ${stamp}`,
			color: "#0ea5e9",
		});
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
				links: z
					.array(
						z.object({ title: z.string().max(200), url: z.string().max(2048) }),
					)
					.max(5000),
			}),
		)
		.max(500),
});

/**
 * One-way mirror of the browser's bookmarks into a dedicated board. The board
 * is rebuilt on every sync, so edits should happen in the browser.
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
		let total = 0;
		yield* query((db) =>
			db.transaction(async (tx) => {
				await tx.delete(groups).where(eq(groups.boardId, boardId));
				for (const [index, folder] of data.folders.entries()) {
					const rows = folder.links.flatMap((link, position) => {
						const url = normalizeUrl(link.url);
						return url
							? [
									{
										url,
										title: link.title.trim() || titleFromUrl(url),
										position,
									},
								]
							: [];
					});
					if (rows.length === 0) continue;
					const [group] = await tx
						.insert(groups)
						.values({
							userId,
							boardId,
							name:
								folder.path.split(" / ").slice(-2).join(" / ").slice(0, 60) ||
								"Bookmarks",
							position: index,
						})
						.returning();
					for (let i = 0; i < rows.length; i += 200) {
						await tx
							.insert(bookmarks)
							.values(
								rows
									.slice(i, i + 200)
									.map((row) => ({
										...row,
										userId,
										groupId: group.id,
										meta: { favicon: faviconFor(row.url) },
									})),
							);
					}
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

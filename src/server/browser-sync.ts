import { and, asc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { type BrowserOp, browserOps } from "#/db/schema";
import type { BookmarkMeta, GroupOptions } from "#/lib/preferences";
import { query } from "./runtime";

/*
 * Two-way bookmark sync. The extension mirrors the browser's bookmarks into
 * the "Browser bookmarks" board (rebuilt on each sync, ids kept in
 * meta.browserId). Edits made to that board in tabz are queued here as
 * operations; the extension pulls them, applies them to the browser's
 * bookmarks, and acknowledges them before sending its next snapshot. While
 * operations are waiting, snapshots are refused so nothing is lost.
 *
 * Synced back: renaming and editing links, folders and top-level groups;
 * deleting links and folders; adding links and folders; moving within the
 * board. Not synced: order within a folder (the browser's order wins) and
 * groups made in tabz (they stay tabz-only and syncs leave them alone).
 */

const MAX_PENDING = 2000;

export const queueOps = (userId: string, ops: BrowserOp[]) =>
	ops.length === 0
		? Effect.void
		: query((db) =>
				db.insert(browserOps).values(ops.map((op) => ({ userId, op }))),
			).pipe(Effect.asVoid);

export const pendingCount = (userId: string) =>
	query((db) => db.$count(browserOps, eq(browserOps.userId, userId)));

export const listOps = (userId: string) =>
	query((db) =>
		db
			.select({ id: browserOps.id, op: browserOps.op })
			.from(browserOps)
			.where(eq(browserOps.userId, userId))
			.orderBy(asc(browserOps.createdAt))
			.limit(MAX_PENDING),
	).pipe(Effect.map((ops) => ({ ops })));

export const ackInput = z.object({
	ids: z.array(z.string().max(64)).max(MAX_PENDING),
});

export const ackOps = (userId: string, data: z.infer<typeof ackInput>) =>
	(data.ids.length
		? query((db) =>
				db
					.delete(browserOps)
					.where(
						and(
							eq(browserOps.userId, userId),
							inArray(browserOps.id, data.ids),
						),
					),
			)
		: Effect.void
	).pipe(Effect.as({ ok: true }));

type Board = { source: string | null };
type Group = { options: GroupOptions };
type Item = { id: string; kind: string; meta: BookmarkMeta };

export const isBrowserBoard = (board: Board) => board.source === "browser";

/**
 * Where something lands in the browser: its folder's browser id, a folder
 * still waiting to be made (by its tabz id), or its group's browser folder.
 * Null for tabz-only groups, which don't sync.
 */
export const browserParent = (
	group: Group,
	folder: Item | null,
): { parentId?: string; parentRef?: string } | null => {
	if (folder)
		return folder.meta.browserId
			? { parentId: folder.meta.browserId }
			: { parentRef: folder.id };
	return group.options.browserId ? { parentId: group.options.browserId } : null;
};

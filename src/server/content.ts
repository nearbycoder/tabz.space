import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { Effect } from "effect";
import { boards, bookmarks, groups } from "#/db/schema";
import { fetchPageMetadata } from "./metadata";
import { query } from "./runtime";

/*
 * Full-text search over the text of saved pages. `bookmark_text` is an FTS5
 * table (migration 0007) filled in the background; vault boards are never
 * indexed. Search results are always filtered to what the caller can see.
 */

/** Live, non-vault links: the only rows background jobs touch. */
export const monitoredLinks = and(
	eq(bookmarks.kind, "link"),
	isNull(bookmarks.deletedAt),
	isNull(groups.deletedAt),
	isNull(boards.deletedAt),
	eq(boards.vault, false),
);

/** Sets one key of a bookmark's meta JSON in place, leaving the rest alone. */
export const setMeta = (id: string, key: string, value: unknown) =>
	query((db) =>
		db
			.update(bookmarks)
			.set({
				meta: sql`json_set(${bookmarks.meta}, ${`$.${key}`}, json(${JSON.stringify(value)}))`,
				updatedAt: sql`${bookmarks.updatedAt}`,
			})
			.where(eq(bookmarks.id, id)),
	);

export const indexText = (id: string, title: string, body: string) =>
	query((db) =>
		db.batch([
			db.run(sql`DELETE FROM bookmark_text WHERE bookmark_id = ${id}`),
			db.run(
				sql`INSERT INTO bookmark_text (bookmark_id, title, body) VALUES (${id}, ${title}, ${body})`,
			),
		]),
	).pipe(Effect.andThen(setMeta(id, "indexedAt", Date.now())));

/** Fetches and indexes links that haven't been indexed yet, newest first. */
export const indexPending = (limit = 25) =>
	Effect.gen(function* () {
		const rows = yield* query((db) =>
			db
				.select({
					id: bookmarks.id,
					url: bookmarks.url,
					title: bookmarks.title,
				})
				.from(bookmarks)
				.innerJoin(groups, eq(groups.id, bookmarks.groupId))
				.innerJoin(boards, eq(boards.id, groups.boardId))
				.where(
					and(
						monitoredLinks,
						sql`json_extract(${bookmarks.meta}, '$.indexedAt') IS NULL`,
					),
				)
				.orderBy(
					asc(sql`${boards.source} IS NOT NULL`),
					desc(bookmarks.createdAt),
				)
				.limit(limit),
		);
		yield* Effect.forEach(
			rows,
			(row) =>
				fetchPageMetadata(row.url).pipe(
					Effect.flatMap((meta) =>
						indexText(row.id, meta.title ?? row.title, meta.text ?? ""),
					),
					Effect.ignore,
				),
			{ concurrency: 4, discard: true },
		);
		// Drop index rows for bookmarks that were deleted for good.
		yield* query((db) =>
			db.run(
				sql`DELETE FROM bookmark_text WHERE bookmark_id NOT IN (SELECT id FROM bookmarks)`,
			),
		);
		return { indexed: rows.length };
	});

/** Turns free text into a safe FTS5 query: every word must match, as a prefix. */
const ftsQuery = (text: string) =>
	text
		.toLowerCase()
		.split(/\s+/)
		.map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
		.filter((word) => word.length >= 2)
		.map((word) => `"${word}"*`)
		.join(" ");

export type ContentHit = { id: string; snippet: string };

/** Ranked page-text matches among `visible` bookmark ids. */
export const searchText = (text: string, visible: Set<string>, limit = 20) =>
	Effect.gen(function* () {
		const match = ftsQuery(text);
		if (!match || visible.size === 0) return [] as ContentHit[];
		const rows = yield* query((db) =>
			db.all<{ id: string; snippet: string }>(
				sql`SELECT bookmark_id AS id, snippet(bookmark_text, 2, '«', '»', '…', 14) AS snippet
					FROM bookmark_text WHERE bookmark_text MATCH ${match}
					ORDER BY bm25(bookmark_text, 0, 4, 1) LIMIT 500`,
			),
		).pipe(Effect.catch(() => Effect.succeed([] as ContentHit[])));
		return rows.filter((row) => visible.has(row.id)).slice(0, limit);
	});

import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { Effect } from "effect";
import { boards, bookmarks, groups } from "#/db/schema";
import type { BookmarkMeta, LinkHealth } from "#/lib/preferences";
import { canonicalUrl } from "#/lib/url";
import { autoTag } from "./ai";
import { indexText, monitoredLinks, setMeta } from "./content";
import { checkLink, fetchFeed, type PageMetadata } from "./metadata";
import { query } from "./runtime";

/*
 * Background monitors: link health (dead-link checker) and RSS/Atom feeds
 * (unread badges). Both write a single key of `bookmarks.meta` atomically.
 */

const DAY = 24 * 60 * 60_000;
const RECHECK_HEALTH = 7 * DAY;
const RECHECK_FEED = 2 * 60 * 60_000;

type Candidate = { id: string; url: string; meta: BookmarkMeta };

const samePlace = (a: URL, b: URL) =>
	a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");

/** Checks one link and stores the verdict. Only two failures in a row count as broken. */
export const checkHealth = (link: Candidate) =>
	Effect.gen(function* () {
		const result = yield* checkLink(link.url);
		const previous = link.meta.health;
		const now = Date.now();
		let health: LinkHealth;
		if (result.kind === "ok") {
			const from = new URL(link.url);
			const to = new URL(result.finalUrl);
			// A permanent redirect to another page on the same site: the link moved.
			// Temporary ones (locales, "latest" docs) and other-host ones (sign-in
			// pages) are fine.
			const moved =
				result.permanent &&
				samePlace(from, to) &&
				canonicalUrl(link.url) !== canonicalUrl(result.finalUrl);
			health = moved
				? {
						status: "redirected",
						code: result.code,
						location: result.finalUrl,
						checkedAt: now,
					}
				: { status: "ok", code: result.code, checkedAt: now };
		} else if (result.kind === "inconclusive") {
			health = { ...(previous ?? { status: "ok" }), checkedAt: now };
		} else {
			const failures = (previous?.failures ?? 0) + 1;
			health = {
				status: failures >= 2 ? "broken" : (previous?.status ?? "ok"),
				code: result.kind === "missing" ? result.code : undefined,
				failures,
				checkedAt: now,
			};
		}
		yield* setMeta(link.id, "health", health);
		return { id: link.id, health };
	});

const linkColumns = {
	id: bookmarks.id,
	url: bookmarks.url,
	meta: bookmarks.meta,
};

/** Job: re-checks the links that have gone longest without a check. */
export const checkStaleLinks = (limit = 30) =>
	Effect.gen(function* () {
		const rows = yield* query((db) =>
			db
				.select(linkColumns)
				.from(bookmarks)
				.innerJoin(groups, eq(groups.id, bookmarks.groupId))
				.innerJoin(boards, eq(boards.id, groups.boardId))
				.where(
					and(
						monitoredLinks,
						sql`coalesce(json_extract(${bookmarks.meta}, '$.health.checkedAt'), 0) < ${Date.now() - RECHECK_HEALTH}`,
					),
				)
				.orderBy(
					asc(
						sql`coalesce(json_extract(${bookmarks.meta}, '$.health.checkedAt'), 0)`,
					),
				)
				.limit(limit),
		);
		yield* Effect.forEach(rows, (row) => Effect.ignore(checkHealth(row)), {
			concurrency: 6,
			discard: true,
		});
		return { checked: rows.length };
	});

/** Checks specific links now (the "Check links" button), a few at a time. */
export const checkLinksNow = (links: Candidate[]) =>
	Effect.forEach(links, (link) => checkHealth(link).pipe(Effect.option), {
		concurrency: 8,
	}).pipe(
		Effect.map((results) =>
			results.flatMap((result) =>
				result._tag === "Some" ? [result.value] : [],
			),
		),
	);

/** Job: polls feeds that are due. Bookmarks sharing a feed share one fetch. */
export const pollFeeds = (limit = 40) =>
	Effect.gen(function* () {
		const rows = yield* query((db) =>
			db
				.select(linkColumns)
				.from(bookmarks)
				.innerJoin(groups, eq(groups.id, bookmarks.groupId))
				.innerJoin(boards, eq(boards.id, groups.boardId))
				.where(
					and(
						monitoredLinks,
						isNotNull(sql`json_extract(${bookmarks.meta}, '$.feedUrl')`),
						sql`coalesce(json_extract(${bookmarks.meta}, '$.feed.checkedAt'), 0) < ${Date.now() - RECHECK_FEED}`,
					),
				)
				.orderBy(
					asc(
						sql`coalesce(json_extract(${bookmarks.meta}, '$.feed.checkedAt'), 0)`,
					),
				)
				.limit(limit),
		);
		const byFeed = new Map<string, Candidate[]>();
		for (const row of rows) {
			const feedUrl = row.meta.feedUrl as string;
			byFeed.set(feedUrl, [...(byFeed.get(feedUrl) ?? []), row]);
		}
		yield* Effect.forEach(
			[...byFeed],
			([feedUrl, links]) =>
				fetchFeed(feedUrl).pipe(
					Effect.option,
					// A failing feed keeps its old items and waits for the next round.
					Effect.flatMap((items) =>
						Effect.forEach(
							links,
							(link) =>
								setMeta(link.id, "feed", {
									checkedAt: Date.now(),
									items:
										items._tag === "Some"
											? items.value
											: (link.meta.feed?.items ?? []),
								}),
							{ discard: true },
						),
					),
					Effect.ignore,
				),
			{ concurrency: 4, discard: true },
		);
		return { feeds: byFeed.size };
	});

/**
 * Follow-up after a page was fetched for a new or refreshed link: index its
 * text and load its feed right away instead of waiting for the jobs.
 * Vault links are never indexed or polled.
 */
export const afterFetch = (
	link: { id: string; title: string; vault: boolean },
	page: PageMetadata,
) =>
	link.vault
		? Effect.void
		: Effect.all(
				[
					indexText(link.id, page.title ?? link.title, page.text ?? "").pipe(
						Effect.andThen(autoTag(link.id, page)),
					),
					page.feedUrl
						? fetchFeed(page.feedUrl).pipe(
								Effect.flatMap((items) =>
									setMeta(link.id, "feed", { checkedAt: Date.now(), items }),
								),
							)
						: Effect.void,
				],
				{ concurrency: 2, discard: true },
			).pipe(Effect.ignore);

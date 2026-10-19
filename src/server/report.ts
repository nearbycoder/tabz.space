import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { activity, boards, bookmarks, groups, visits } from "#/db/schema";
import { hostnameOf } from "#/lib/url";
import { zonedToUtc } from "./ics";
import { query } from "./runtime";

/* "Your month in tabz": visit and library stats for one calendar month. */

export const reportInput = z.object({
	month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
	zone: z.string().max(64),
});

const validZone = (zone: string) => {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: zone });
		return zone;
	} catch {
		return "UTC";
	}
};

const monthRange = (month: string, zone: string) => {
	const [y, m] = month.split("-").map(Number);
	const start = zonedToUtc({ y, m, d: 1, h: 0, mi: 0, s: 0 }, zone);
	const end = zonedToUtc(
		{
			y: m === 12 ? y + 1 : y,
			m: m === 12 ? 1 : m + 1,
			d: 1,
			h: 0,
			mi: 0,
			s: 0,
		},
		zone,
	);
	return {
		start: new Date(start),
		end: new Date(end),
		days: new Date(Date.UTC(y, m, 0)).getUTCDate(),
	};
};

const previousMonth = (month: string) => {
	const [y, m] = month.split("-").map(Number);
	return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

// Only links on the user's own, visible, non-vault boards count.
const visibleLink = (userId: string) =>
	and(
		eq(boards.userId, userId),
		eq(boards.vault, false),
		isNull(boards.deletedAt),
		isNull(groups.deletedAt),
		isNull(bookmarks.deletedAt),
	);

export const monthlyReport = (
	userId: string,
	data: z.infer<typeof reportInput>,
) =>
	Effect.gen(function* () {
		const zone = validZone(data.zone);
		const { start, end, days } = monthRange(data.month, zone);
		const before = monthRange(previousMonth(data.month), zone);

		const monthVisits = yield* query((db) =>
			db
				.select({
					at: visits.at,
					bookmarkId: visits.bookmarkId,
					title: bookmarks.title,
					url: bookmarks.url,
					meta: bookmarks.meta,
				})
				.from(visits)
				.innerJoin(bookmarks, eq(bookmarks.id, visits.bookmarkId))
				.innerJoin(groups, eq(groups.id, bookmarks.groupId))
				.innerJoin(boards, eq(boards.id, groups.boardId))
				.where(
					and(
						eq(visits.userId, userId),
						gte(visits.at, start),
						lt(visits.at, end),
						visibleLink(userId),
					),
				),
		);
		const previousVisits = yield* query((db) =>
			db.$count(
				visits,
				and(
					eq(visits.userId, userId),
					gte(visits.at, before.start),
					lt(visits.at, before.end),
				),
			),
		);
		const added = yield* query((db) =>
			db
				.select({ url: bookmarks.url })
				.from(bookmarks)
				.innerJoin(groups, eq(groups.id, bookmarks.groupId))
				.innerJoin(boards, eq(boards.id, groups.boardId))
				.where(
					and(
						eq(bookmarks.kind, "link"),
						gte(bookmarks.createdAt, start),
						lt(bookmarks.createdAt, end),
						visibleLink(userId),
					),
				),
		);
		const actions = yield* query((db) =>
			db
				.select({ action: activity.action, count: sql<number>`count(*)` })
				.from(activity)
				.where(
					and(
						eq(activity.userId, userId),
						gte(activity.createdAt, start),
						lt(activity.createdAt, end),
					),
				)
				.groupBy(activity.action),
		);
		const library = yield* query((db) =>
			db
				.select({
					links: sql<number>`count(*)`,
					broken: sql<number>`sum(case when json_extract(${bookmarks.meta}, '$.health.status') = 'broken' then 1 else 0 end)`,
				})
				.from(bookmarks)
				.innerJoin(groups, eq(groups.id, bookmarks.groupId))
				.innerJoin(boards, eq(boards.id, groups.boardId))
				.where(and(eq(bookmarks.kind, "link"), visibleLink(userId))),
		);

		// Per-day and per-hour buckets in the viewer's zone.
		const dayFormat = new Intl.DateTimeFormat("en-US", {
			timeZone: zone,
			day: "numeric",
		});
		const hourFormat = new Intl.DateTimeFormat("en-US", {
			timeZone: zone,
			hour: "numeric",
			hourCycle: "h23",
		});
		const weekdayFormat = new Intl.DateTimeFormat("en-US", {
			timeZone: zone,
			weekday: "long",
		});
		const perDay = Array.from({ length: days }, () => 0);
		const perHour = Array.from({ length: 24 }, () => 0);
		const perWeekday = new Map<string, number>();
		const perLink = new Map<
			string,
			{ title: string; url: string; favicon?: string; count: number }
		>();
		for (const visit of monthVisits) {
			perDay[Number(dayFormat.format(visit.at)) - 1]++;
			perHour[Number(hourFormat.format(visit.at)) % 24]++;
			const weekday = weekdayFormat.format(visit.at);
			perWeekday.set(weekday, (perWeekday.get(weekday) ?? 0) + 1);
			const entry = perLink.get(visit.bookmarkId) ?? {
				title: visit.title,
				url: visit.url,
				favicon: visit.meta.favicon,
				count: 0,
			};
			entry.count++;
			perLink.set(visit.bookmarkId, entry);
		}
		const hosts = new Map<string, number>();
		for (const { url } of added)
			hosts.set(hostnameOf(url), (hosts.get(hostnameOf(url)) ?? 0) + 1);
		const top = <K>(map: Map<K, number>) =>
			[...map.entries()].sort((a, b) => b[1] - a[1])[0];
		const busiestHour = perHour.indexOf(Math.max(...perHour));

		return {
			month: data.month,
			visits: monthVisits.length,
			previousVisits,
			activeDays: perDay.filter(Boolean).length,
			perDay,
			busiestHour: monthVisits.length ? busiestHour : null,
			busiestWeekday: top(perWeekday)?.[0] ?? null,
			topLinks: [...perLink.values()]
				.sort((a, b) => b.count - a.count)
				.slice(0, 5),
			added: added.length,
			topAddedHost: top(hosts)?.[0] ?? null,
			changes: Object.fromEntries(
				actions.map((row) => [row.action, Number(row.count)]),
			),
			librarySize: Number(library[0]?.links ?? 0),
			broken: Number(library[0]?.broken ?? 0),
		};
	});

import type { HomeBoard, LinkItem } from "#/components/home/types";
import { type SmartRules, type SmartSort, unreadCount } from "./preferences";

/*
 * Smart groups are live views computed in the browser from the library that's
 * already loaded, so they update the moment anything changes.
 */

const time = (value: Date | string | null | undefined) =>
	value ? new Date(value).getTime() : 0;

const MONTH = 30 * 24 * 60 * 60_000;

const ORDER: Record<
	SmartSort,
	{ keep: (link: LinkItem) => boolean; score: (link: LinkItem) => number }
> = {
	visits: { keep: (l) => l.visitCount > 0, score: (l) => l.visitCount },
	recent: {
		keep: (l) => Boolean(l.lastVisitedAt),
		score: (l) => time(l.lastVisitedAt),
	},
	added: { keep: () => true, score: (l) => time(l.createdAt) },
	forgotten: {
		keep: (l) => Date.now() - time(l.lastVisitedAt ?? l.createdAt) > MONTH,
		// Oldest first.
		score: (l) => -time(l.lastVisitedAt ?? l.createdAt),
	},
	unread: {
		keep: (l) => unreadCount(l) > 0,
		score: (l) => l.meta.feed?.items[0]?.at ?? 0,
	},
	broken: {
		keep: (l) => Boolean(l.meta.health && l.meta.health.status !== "ok"),
		score: (l) => l.meta.health?.checkedAt ?? 0,
	},
};

export const SMART_EMPTY: Record<SmartSort, string> = {
	visits: "Links you open most will show up here.",
	recent: "Links you open will show up here.",
	added: "New links will show up here.",
	forgotten: "Links you haven't opened in a month will show up here.",
	unread: "Sites with new posts will show up here.",
	broken: "No broken links. Nice.",
};

/** Every link (including those inside folders) on non-vault boards. */
export const allLinks = (boards: HomeBoard[]) =>
	boards
		.filter((board) => !board.vault)
		.flatMap((board) =>
			board.groups.flatMap((group) =>
				group.bookmarks.flatMap((item) =>
					item.kind === "folder" ? item.children : [item as LinkItem],
				),
			),
		);

export function smartItems(boards: HomeBoard[], rules: SmartRules) {
	const order = ORDER[rules.sort];
	const query = rules.query?.toLowerCase();
	const tags = rules.tags?.map((tag) => tag.toLowerCase());
	const source = rules.boardId
		? boards.filter((board) => board.id === rules.boardId)
		: boards;
	return allLinks(source)
		.filter(
			(link) =>
				order.keep(link) &&
				(!tags?.length ||
					link.tags.some((tag) => tags.includes(tag.toLowerCase()))) &&
				(!query ||
					`${link.title} ${link.url} ${link.description ?? ""}`
						.toLowerCase()
						.includes(query)),
		)
		.sort((a, b) => order.score(b) - order.score(a))
		.slice(0, rules.limit);
}

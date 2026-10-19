import { DEFAULT_BOARD_LAYOUT } from "#/lib/preferences";

type StarterLink = { title: string; url: string };
export type StarterItem =
	| StarterLink
	| { folder: string; icon: string; bookmarks: StarterLink[] };

/** Starter content so a brand-new account lands on a useful page. */
export const STARTER_BOARD: {
	name: string;
	icon: string;
	layout: typeof DEFAULT_BOARD_LAYOUT;
	groups: { name: string; color: string; bookmarks: StarterItem[] }[];
} = {
	name: "Home",
	icon: "🏠",
	layout: DEFAULT_BOARD_LAYOUT,
	groups: [
		{
			name: "Daily",
			color: "#6366f1",
			bookmarks: [
				{ title: "Gmail", url: "https://mail.google.com" },
				{ title: "Calendar", url: "https://calendar.google.com" },
				{ title: "YouTube", url: "https://www.youtube.com" },
				{
					folder: "Social",
					icon: "💬",
					bookmarks: [
						{ title: "Reddit", url: "https://www.reddit.com" },
						{ title: "X", url: "https://x.com" },
						{ title: "Instagram", url: "https://www.instagram.com" },
						{ title: "LinkedIn", url: "https://www.linkedin.com" },
					],
				},
			],
		},
		{
			name: "Build",
			color: "#10b981",
			bookmarks: [
				{ title: "GitHub", url: "https://github.com" },
				{ title: "Railway", url: "https://railway.com" },
				{ title: "MDN", url: "https://developer.mozilla.org" },
			],
		},
		{
			name: "Read",
			color: "#f59e0b",
			bookmarks: [
				{ title: "Hacker News", url: "https://news.ycombinator.com" },
				{ title: "Wikipedia", url: "https://www.wikipedia.org" },
			],
		},
	],
};

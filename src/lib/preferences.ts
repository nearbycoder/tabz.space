import type {
	BoardLayout,
	BoardSchedule,
	GroupOptions,
	SmartRules,
	UserSettings,
	Widget,
} from "./schemas";

/*
 * Constants and types shared by the browser and the server. The zod schemas
 * that validate them live in ./schemas (server-side), so the browser never
 * downloads a validation library just to read these.
 */

export type {
	BoardLayout,
	BoardSchedule,
	GroupOptions,
	SmartRules,
	UserSettings,
	Widget,
};

export const SEARCH_ENGINES = {
	google: { label: "Google", url: "https://www.google.com/search?q=" },
	duckduckgo: { label: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
	bing: { label: "Bing", url: "https://www.bing.com/search?q=" },
	brave: { label: "Brave", url: "https://search.brave.com/search?q=" },
	kagi: { label: "Kagi", url: "https://kagi.com/search?q=" },
	perplexity: {
		label: "Perplexity",
		url: "https://www.perplexity.ai/search?q=",
	},
	chatgpt: { label: "ChatGPT", url: "https://chatgpt.com/?q=" },
} as const;

export type SearchEngine = keyof typeof SEARCH_ENGINES;

export const ACCENTS = [
	"#6366f1",
	"#0ea5e9",
	"#10b981",
	"#f59e0b",
	"#ef4444",
	"#ec4899",
	"#8b5cf6",
	"#64748b",
] as const;

/** Gradient backgrounds. `animate` slowly drifts them. */
export const BACKGROUNDS = {
	none: "",
	aurora:
		"radial-gradient(at 20% 10%, #6366f155 0, transparent 50%), radial-gradient(at 80% 0%, #ec489944 0, transparent 50%), radial-gradient(at 50% 100%, #0ea5e933 0, transparent 50%)",
	sunset: "linear-gradient(135deg, #f9731640, #ec489940 50%, #8b5cf640)",
	ocean: "linear-gradient(160deg, #0ea5e940, #10b98128 60%, transparent)",
	forest:
		"radial-gradient(at 0% 0%, #10b98150 0, transparent 55%), radial-gradient(at 100% 100%, #84cc1640 0, transparent 55%)",
	nebula:
		"radial-gradient(at 15% 20%, #7c3aed66 0, transparent 45%), radial-gradient(at 85% 30%, #db277755 0, transparent 45%), radial-gradient(at 50% 90%, #2563eb55 0, transparent 50%)",
	candy:
		"radial-gradient(at 0% 0%, #f472b655 0, transparent 50%), radial-gradient(at 100% 0%, #facc1544 0, transparent 50%), radial-gradient(at 50% 100%, #34d39944 0, transparent 55%)",
	peach: "linear-gradient(180deg, #fed7aa66, #fecdd366 60%, transparent)",
	mono: "radial-gradient(circle at 50% 0%, #64748b33, transparent 60%)",
} as const;

export type GradientKey = keyof typeof BACKGROUNDS;

export const PATTERNS = ["dots", "grid", "diagonal", "plus", "waves"] as const;
export type PatternKey = (typeof PATTERNS)[number];

/** Curated wallpapers (Unsplash). */
export const WALLPAPERS = [
	{ id: "1506744038136-46273834b3fb", label: "Valley lake" },
	{ id: "1519681393784-d120267933ba", label: "Starry peaks" },
	{ id: "1470071459604-3b5ec3a7fe05", label: "Misty hills" },
	{ id: "1507525428034-b723cf961d3e", label: "Beach" },
	{ id: "1501785888041-af3ef285b470", label: "Lakeside" },
	{ id: "1469474968028-56623f02e42e", label: "Sunbeams" },
	{ id: "1477346611705-65d1883cee1e", label: "Mountains" },
	{ id: "1534796636912-3b95b3ab5986", label: "Nebula" },
	{ id: "1557682250-33bd709cbe85", label: "Violet blur" },
	{ id: "1579546929518-9e396f3cc809", label: "Gradient" },
	{ id: "1493246507139-91e8fad9978e", label: "Alpine" },
	{ id: "1500530855697-b586d89ba3ee", label: "Road trip" },
].map((wallpaper) => ({
	...wallpaper,
	url: `https://images.unsplash.com/photo-${wallpaper.id}?auto=format&fit=crop&w=2400&q=80`,
	thumb: `https://images.unsplash.com/photo-${wallpaper.id}?auto=format&fit=crop&w=320&q=60`,
}));

export const FONTS = {
	geist: {
		label: "Modern",
		family: "'Geist Variable', 'Geist', ui-sans-serif, system-ui, sans-serif",
		// Self-hosted (bundled CSS), so nothing to fetch from Google.
		google: null,
	},
	grotesk: {
		label: "Bold",
		family: "'Space Grotesk', ui-sans-serif, sans-serif",
		google: "Space+Grotesk:wght@400..700",
	},
	rounded: {
		label: "Friendly",
		family: "'Nunito', ui-rounded, ui-sans-serif, sans-serif",
		google: "Nunito:wght@400..800",
	},
	serif: {
		label: "Editorial",
		family: "'Fraunces', Georgia, serif",
		google: "Fraunces:opsz,wght@9..144,400..700",
	},
	mono: {
		label: "Hacker",
		family: "'JetBrains Mono', ui-monospace, monospace",
		google: "JetBrains+Mono:wght@400..700",
	},
} as const;

export type FontKey = keyof typeof FONTS;

export const DEFAULT_SETTINGS: UserSettings = {
	theme: "system",
	accent: "#6366f1",
	background: {
		type: "preset",
		value: "aurora",
		dim: 0,
		blur: 0,
		animate: true,
	},
	font: "geist",
	radius: "soft",
	surface: "glass",
	searchEngine: "google",
	showSearch: true,
	showClock: true,
	showGreeting: true,
	clockFormat: "12h",
	greetingName: "",
	showTopSites: true,
	showRediscover: true,
	customCss: "",
	openInNewTab: false,
	incognitoAll: false,
	linkPreviews: true,
	feedBadges: true,
	autoTag: false,
	celebrate: true,
	tilt: true,
	activeBoardId: null,
	activeProfileId: null,
	profileBoards: {},
	focus: {
		enabled: false,
		days: [1, 2, 3, 4, 5],
		from: "09:00",
		to: "17:00",
		sites: [],
		until: null,
	},
	vaultCode: "vault",
};

/** One-click looks: each sets several appearance settings at once. */
export const THEME_PRESETS: {
	id: string;
	label: string;
	emoji: string;
	settings: Pick<
		UserSettings,
		"theme" | "accent" | "background" | "font" | "radius" | "surface"
	>;
}[] = [
	{
		id: "default",
		label: "Aurora",
		emoji: "🌌",
		settings: {
			theme: "system",
			accent: "#6366f1",
			background: {
				type: "preset",
				value: "aurora",
				dim: 0,
				blur: 0,
				animate: true,
			},
			font: "geist",
			radius: "soft",
			surface: "glass",
		},
	},
	{
		id: "midnight",
		label: "Midnight",
		emoji: "🌙",
		settings: {
			theme: "dark",
			accent: "#8b5cf6",
			background: {
				type: "preset",
				value: "nebula",
				dim: 0,
				blur: 0,
				animate: true,
			},
			font: "grotesk",
			radius: "round",
			surface: "glass",
		},
	},
	{
		id: "paper",
		label: "Paper",
		emoji: "📜",
		settings: {
			theme: "light",
			accent: "#b45309",
			background: {
				type: "color",
				value: "#f4efe6",
				dim: 0,
				blur: 0,
				animate: false,
			},
			font: "serif",
			radius: "sharp",
			surface: "outline",
		},
	},
	{
		id: "terminal",
		label: "Terminal",
		emoji: "💾",
		settings: {
			theme: "dark",
			accent: "#22c55e",
			background: {
				type: "pattern",
				value: "grid",
				dim: 0,
				blur: 0,
				animate: false,
			},
			font: "mono",
			radius: "sharp",
			surface: "outline",
		},
	},
	{
		id: "sakura",
		label: "Sakura",
		emoji: "🌸",
		settings: {
			theme: "light",
			accent: "#ec4899",
			background: {
				type: "preset",
				value: "candy",
				dim: 0,
				blur: 0,
				animate: true,
			},
			font: "rounded",
			radius: "round",
			surface: "glass",
		},
	},
	{
		id: "alpine",
		label: "Alpine",
		emoji: "🏔️",
		settings: {
			theme: "dark",
			accent: "#0ea5e9",
			background: {
				type: "image",
				value: WALLPAPERS[1].url,
				dim: 35,
				blur: 0,
				animate: false,
			},
			font: "geist",
			radius: "soft",
			surface: "glass",
		},
	},
	{
		id: "beach",
		label: "Beach",
		emoji: "🏖️",
		settings: {
			theme: "light",
			accent: "#0891b2",
			background: {
				type: "image",
				value: WALLPAPERS[3].url,
				dim: 15,
				blur: 6,
				animate: false,
			},
			font: "rounded",
			radius: "round",
			surface: "glass",
		},
	},
	{
		id: "studio",
		label: "Studio",
		emoji: "🎛️",
		settings: {
			theme: "light",
			accent: "#0f172a",
			background: {
				type: "pattern",
				value: "dots",
				dim: 0,
				blur: 0,
				animate: false,
			},
			font: "grotesk",
			radius: "soft",
			surface: "solid",
		},
	},
];

export const TILE_STYLES = ["tile", "card", "list", "icon", "gallery"] as const;
export type TileStyle = (typeof TILE_STYLES)[number];

export const DEFAULT_BOARD_LAYOUT: BoardLayout = {
	columns: 3,
	tileStyle: "tile",
	tileSize: "md",
	width: "wide",
	showGroupTitles: true,
};

/**
 * How much of a board row a group takes on wide screens. "auto" follows the
 * board's column count (and the group's older `span`).
 */
export const GROUP_WIDTHS = [
	"auto",
	"1/4",
	"1/3",
	"1/2",
	"2/3",
	"3/4",
	"1",
] as const;
export type GroupWidth = (typeof GROUP_WIDTHS)[number];

const fractionOf = (width: Exclude<GroupWidth, "auto">) => {
	const [top, bottom = "1"] = width.split("/");
	return Number(top) / Number(bottom);
};

/** A group's share of the row on wide screens (0–1). */
export function groupFraction(
	options: { width?: GroupWidth; span?: number },
	columns: number,
) {
	if (options.width && options.width !== "auto")
		return fractionOf(options.width);
	return Math.min(options.span ?? 1, columns) / columns;
}

/** The nearest allowed width to a fraction of the row (for drag-to-resize). */
export function nearestWidth(fraction: number): Exclude<GroupWidth, "auto"> {
	let best: Exclude<GroupWidth, "auto"> = "1";
	for (const width of GROUP_WIDTHS) {
		if (width === "auto") continue;
		if (
			Math.abs(fractionOf(width) - fraction) <
			Math.abs(fractionOf(best) - fraction)
		)
			best = width;
	}
	return best;
}

export const SMART_SORTS = {
	visits: "Most visited",
	recent: "Recently opened",
	added: "Newest",
	forgotten: "Not opened in a while",
	unread: "Unread feeds",
	broken: "Broken links",
} as const;
export type SmartSort = keyof typeof SMART_SORTS;

export const DEFAULT_SMART_RULES: SmartRules = { sort: "visits", limit: 12 };

export { WIDGET_TYPES, type WidgetType } from "./widget-catalog";

export type BookmarkMeta = {
	favicon?: string;
	siteName?: string;
	image?: string;
	/** When page metadata was last fetched (ms); unset = never looked up. */
	fetchedAt?: number;
	/** RSS/Atom feed advertised by the page (powers unread badges). */
	feedUrl?: string;
	/** Last link-health check. */
	health?: LinkHealth;
	/** For broken links: the Wayback Machine's closest copy (url null = none). */
	archive?: { url: string | null; at: number | null; checkedAt: number };
	/**
	 * Where the link ends up after only permanent redirects (http→https,
	 * renamed domains…). Opening it directly skips a round trip per click.
	 */
	go?: string | null;
	/** Latest items from `feedUrl`; unread = newer than the last visit. */
	feed?: { checkedAt: number; items: FeedItem[] };
	/** When the page text was added to the full-text index (ms). */
	indexedAt?: number;
	/**
	 * End-to-end encrypted contents of a vault link/folder ("v1.<base64>").
	 * Only the browser holding the vault key can read it.
	 */
	sealed?: string;
	/** Browser bookmarks board: the browser's id for this link or folder. */
	browserId?: string;
};

export type LinkHealth = {
	status: "ok" | "broken" | "redirected";
	code?: number;
	/** Where a redirected link ends up. */
	location?: string;
	/** Consecutive failed checks; a link is only "broken" after two. */
	failures?: number;
	checkedAt: number;
};

export type FeedItem = { title: string; url?: string; at: number };

/** Feed items published since the link was last opened (or added). */
export function unreadCount(bookmark: {
	meta: BookmarkMeta;
	lastVisitedAt: Date | string | null;
	createdAt: Date | string;
}) {
	const items = bookmark.meta.feed?.items;
	if (!items?.length) return 0;
	const since = new Date(
		bookmark.lastVisitedAt ?? bookmark.createdAt,
	).getTime();
	return items.filter((item) => item.at > since).length;
}

/** Stored settings over the defaults (no validation; the server validates). */
export function mergeSettings(stored: unknown): UserSettings {
	const value = (stored ?? {}) as Partial<UserSettings>;
	return {
		...DEFAULT_SETTINGS,
		...value,
		background: { ...DEFAULT_SETTINGS.background, ...value.background },
	};
}

/** Settings a community theme carries: how tabz looks, never what it does. */
export const THEME_KEYS = [
	"theme",
	"accent",
	"background",
	"font",
	"radius",
	"surface",
	"customCss",
] as const satisfies readonly (keyof UserSettings)[];

/**
 * Custom CSS can restyle the page but must not phone home or break out of
 * its <style> tag: no @import, no external url(), no closing tags.
 */
export function sanitizeCss(css: string) {
	return css
		.replace(/<\/?\s*style/gi, "")
		.replace(/@import[^;]*;?/gi, "")
		.replace(/url\(\s*(['"]?)(?!data:)[^)]*\)/gi, "none")
		.replace(/expression\s*\(/gi, "")
		.slice(0, 20_000);
}

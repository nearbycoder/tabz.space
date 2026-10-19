import { z } from "zod";

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
		family: "'Geist', ui-sans-serif, system-ui, sans-serif",
		google: "Geist:wght@400..700",
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

const searchEngineSchema = z.enum(
	Object.keys(SEARCH_ENGINES) as [SearchEngine, ...SearchEngine[]],
);

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

export const backgroundSchema = z.object({
	type: z.enum(["preset", "pattern", "color", "image"]),
	value: z.string().max(2048),
	/** Darken/lighten overlay strength, 0–90 (%). */
	dim: z.number().min(0).max(90).default(0),
	/** Image blur in px. */
	blur: z.number().min(0).max(30).default(0),
	/** Slowly drift gradients. */
	animate: z.boolean().default(false),
});

export const userSettingsSchema = z.object({
	theme: z.enum(["system", "light", "dark"]),
	accent: hex,
	background: backgroundSchema,
	font: z.enum(Object.keys(FONTS) as [FontKey, ...FontKey[]]).default("geist"),
	radius: z.enum(["sharp", "soft", "round"]).default("soft"),
	surface: z.enum(["glass", "solid", "outline"]).default("glass"),
	searchEngine: searchEngineSchema,
	showSearch: z.boolean(),
	showClock: z.boolean(),
	showGreeting: z.boolean(),
	clockFormat: z.enum(["12h", "24h"]),
	greetingName: z.string().max(40).default(""),
	showTopSites: z.boolean().default(true),
	showRediscover: z.boolean().default(true),
	/** The browser's IANA time zone, so schedules work during server rendering. */
	timeZone: z.string().max(64).optional(),
	/** Last monthly report ("YYYY-MM") the user opened or dismissed. */
	reportSeen: z.string().max(7).optional(),
	openInNewTab: z.boolean(),
	/** Open every link in a private window (needs the browser extension). */
	incognitoAll: z.boolean().default(false),
	linkPreviews: z.boolean().default(true),
	feedBadges: z.boolean().default(true),
	celebrate: z.boolean().default(true),
	tilt: z.boolean().default(true),
	activeBoardId: z.string().nullable(),
	/** Letters typed anywhere on the home page to open the vault. */
	vaultCode: z
		.string()
		.regex(/^[a-z0-9]{3,24}$/i)
		.default("vault"),
});

export type UserSettings = z.output<typeof userSettingsSchema>;

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
	openInNewTab: false,
	incognitoAll: false,
	linkPreviews: true,
	feedBadges: true,
	celebrate: true,
	tilt: true,
	activeBoardId: null,
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

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** When a board shows up on its own, e.g. weekdays 09:00–17:00. */
export const boardScheduleSchema = z.object({
	/** 0 = Sunday … 6 = Saturday. */
	days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
	from: clockTime,
	to: clockTime,
});
export type BoardSchedule = z.infer<typeof boardScheduleSchema>;

export const boardLayoutSchema = z.object({
	columns: z.number().int().min(1).max(6),
	tileStyle: z.enum(TILE_STYLES),
	tileSize: z.enum(["sm", "md", "lg"]),
	width: z.enum(["narrow", "wide", "full"]),
	showGroupTitles: z.boolean(),
	schedule: boardScheduleSchema.nullable().optional(),
});

export type BoardLayout = z.infer<typeof boardLayoutSchema>;

export const DEFAULT_BOARD_LAYOUT: BoardLayout = {
	columns: 3,
	tileStyle: "tile",
	tileSize: "md",
	width: "wide",
	showGroupTitles: true,
};

export const SMART_SORTS = {
	visits: "Most visited",
	recent: "Recently opened",
	added: "Newest",
	forgotten: "Not opened in a while",
	unread: "Unread feeds",
	broken: "Broken links",
} as const;
export type SmartSort = keyof typeof SMART_SORTS;

/** Rules for a smart group: a live view over every non-vault board. */
export const smartRulesSchema = z.object({
	sort: z.enum(Object.keys(SMART_SORTS) as [SmartSort, ...SmartSort[]]),
	/** Only links carrying any of these tags. */
	tags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
	/** Only links whose title, URL or description contain this text. */
	query: z.string().trim().max(100).optional(),
	/** Only links from this board. */
	boardId: z.string().max(64).optional(),
	limit: z.number().int().min(1).max(60),
});
export type SmartRules = z.infer<typeof smartRulesSchema>;

export const DEFAULT_SMART_RULES: SmartRules = { sort: "visits", limit: 12 };

export const WIDGET_TYPES = {
	notes: { label: "Notes", icon: "📝" },
	todo: { label: "To-do", icon: "✅" },
	pomodoro: { label: "Focus timer", icon: "🍅" },
	weather: { label: "Weather", icon: "🌤️" },
	calendar: { label: "Calendar", icon: "📅" },
	stocks: { label: "Stocks", icon: "📈" },
	feed: { label: "News feed", icon: "📰" },
} as const;
export type WidgetType = keyof typeof WIDGET_TYPES;

const publicUrl = z
	.string()
	.trim()
	.max(2048)
	.regex(/^(https?|webcal):\/\//i, "Use an http(s) or webcal:// address");

export const widgetSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("notes"), text: z.string().max(20_000) }),
	z.object({
		type: z.literal("todo"),
		items: z
			.array(
				z.object({
					id: z.string().max(40),
					text: z.string().trim().min(1).max(300),
					done: z.boolean(),
				}),
			)
			.max(200),
	}),
	z.object({
		type: z.literal("pomodoro"),
		work: z.number().int().min(1).max(120),
		rest: z.number().int().min(1).max(60),
	}),
	z.object({
		type: z.literal("weather"),
		place: z.string().max(120),
		lat: z.number().min(-90).max(90),
		lon: z.number().min(-180).max(180),
		unit: z.enum(["c", "f"]),
	}),
	z.object({
		type: z.literal("calendar"),
		url: publicUrl,
		days: z.number().int().min(1).max(31),
	}),
	z.object({
		type: z.literal("stocks"),
		symbols: z
			.array(
				z
					.string()
					.trim()
					.min(1)
					.max(20)
					.regex(/^[\w.^=-]+$/),
			)
			.min(1)
			.max(12),
	}),
	z.object({
		type: z.literal("feed"),
		url: publicUrl,
		count: z.number().int().min(1).max(20),
	}),
]);
export type Widget = z.infer<typeof widgetSchema>;

export const groupOptionsSchema = z.object({
	tileStyle: z.enum(TILE_STYLES).optional(),
	span: z.number().int().min(1).max(6).optional(),
	smart: smartRulesSchema.optional(),
	widget: widgetSchema.optional(),
});

export type GroupOptions = z.infer<typeof groupOptionsSchema>;

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
	/** Latest items from `feedUrl`; unread = newer than the last visit. */
	feed?: { checkedAt: number; items: FeedItem[] };
	/** When the page text was added to the full-text index (ms). */
	indexedAt?: number;
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

/** Merges stored (possibly older-shaped) JSON with current defaults. */
export function resolveSettings(stored: unknown): UserSettings {
	const value = (stored ?? {}) as Partial<UserSettings>;
	const merged = {
		...DEFAULT_SETTINGS,
		...value,
		background: { ...DEFAULT_SETTINGS.background, ...value.background },
	};
	const parsed = userSettingsSchema.safeParse(merged);
	return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export function resolveLayout(stored: unknown): BoardLayout {
	const merged = { ...DEFAULT_BOARD_LAYOUT, ...(stored as object) };
	const parsed = boardLayoutSchema.safeParse(merged);
	return parsed.success ? parsed.data : DEFAULT_BOARD_LAYOUT;
}

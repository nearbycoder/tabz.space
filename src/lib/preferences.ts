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

export const BACKGROUNDS = {
	none: "",
	aurora:
		"radial-gradient(at 20% 10%, #6366f155 0, transparent 50%), radial-gradient(at 80% 0%, #ec489944 0, transparent 50%), radial-gradient(at 50% 100%, #0ea5e933 0, transparent 50%)",
	sunset: "linear-gradient(135deg, #f9731633, #ec489933 50%, #8b5cf633)",
	ocean: "linear-gradient(160deg, #0ea5e933, #10b98122 60%, transparent)",
	forest:
		"radial-gradient(at 0% 0%, #10b98144 0, transparent 55%), radial-gradient(at 100% 100%, #84cc1633 0, transparent 55%)",
	mono: "radial-gradient(circle at 50% 0%, #64748b33, transparent 60%)",
} as const;

const searchEngineSchema = z.enum(
	Object.keys(SEARCH_ENGINES) as [SearchEngine, ...SearchEngine[]],
);

export const userSettingsSchema = z.object({
	theme: z.enum(["system", "light", "dark"]),
	accent: z.string().regex(/^#[0-9a-f]{6}$/i),
	background: z.object({
		type: z.enum(["preset", "image"]),
		value: z.string().max(2048),
	}),
	searchEngine: searchEngineSchema,
	showSearch: z.boolean(),
	showClock: z.boolean(),
	showGreeting: z.boolean(),
	clockFormat: z.enum(["12h", "24h"]),
	openInNewTab: z.boolean(),
	activeBoardId: z.string().nullable(),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

export const DEFAULT_SETTINGS: UserSettings = {
	theme: "system",
	accent: "#6366f1",
	background: { type: "preset", value: "aurora" },
	searchEngine: "google",
	showSearch: true,
	showClock: true,
	showGreeting: true,
	clockFormat: "12h",
	openInNewTab: false,
	activeBoardId: null,
};

export const TILE_STYLES = ["tile", "card", "list", "icon"] as const;
export type TileStyle = (typeof TILE_STYLES)[number];

export const boardLayoutSchema = z.object({
	columns: z.number().int().min(1).max(6),
	tileStyle: z.enum(TILE_STYLES),
	tileSize: z.enum(["sm", "md", "lg"]),
	width: z.enum(["narrow", "wide", "full"]),
	showGroupTitles: z.boolean(),
});

export type BoardLayout = z.infer<typeof boardLayoutSchema>;

export const DEFAULT_BOARD_LAYOUT: BoardLayout = {
	columns: 3,
	tileStyle: "tile",
	tileSize: "md",
	width: "wide",
	showGroupTitles: true,
};

export const groupOptionsSchema = z.object({
	tileStyle: z.enum(TILE_STYLES).optional(),
	span: z.number().int().min(1).max(6).optional(),
});

export type GroupOptions = z.infer<typeof groupOptionsSchema>;

export type BookmarkMeta = {
	favicon?: string;
	siteName?: string;
	image?: string;
};

/** Merges stored (possibly older-shaped) JSON with current defaults. */
export function resolveSettings(stored: unknown): UserSettings {
	const merged = { ...DEFAULT_SETTINGS, ...(stored as object) };
	const parsed = userSettingsSchema.safeParse(merged);
	return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export function resolveLayout(stored: unknown): BoardLayout {
	const merged = { ...DEFAULT_BOARD_LAYOUT, ...(stored as object) };
	const parsed = boardLayoutSchema.safeParse(merged);
	return parsed.success ? parsed.data : DEFAULT_BOARD_LAYOUT;
}

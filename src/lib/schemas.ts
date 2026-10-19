import { z } from "zod";
import {
	DEFAULT_BOARD_LAYOUT,
	DEFAULT_SETTINGS,
	FONTS,
	type FontKey,
	SEARCH_ENGINES,
	type SearchEngine,
	SMART_SORTS,
	type SmartSort,
	TILE_STYLES,
} from "./preferences";

/*
 * Validation for everything users can customize. Used by the server (inputs,
 * stored JSON); the browser only needs the inferred types, imported type-only.
 */

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
	/** Extra CSS applied to the home page (Customize → Look → Custom CSS). */
	customCss: z.string().max(20_000).default(""),
	/** The browser's IANA time zone, so schedules work during server rendering. */
	timeZone: z.string().max(64).optional(),
	/** Last monthly report ("YYYY-MM") the user opened or dismissed. */
	reportSeen: z.string().max(7).optional(),
	openInNewTab: z.boolean(),
	/** Open every link in a private window (needs the browser extension). */
	incognitoAll: z.boolean().default(false),
	linkPreviews: z.boolean().default(true),
	feedBadges: z.boolean().default(true),
	/** Tag new links with AI (only offered when the server has a Claude key). */
	autoTag: z.boolean().default(false),
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

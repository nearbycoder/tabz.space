import type { ComponentType } from "react";
import type { CatalogType } from "#/lib/widget-catalog";
import type { JsonValue, WidgetProps } from "./kit";
import { CATALOG_LOADERS } from "./loaders";

/*
 * How each catalog widget is built: its starting data, the settings form
 * (generated from `fields`) and its code, which is a separate chunk loaded
 * only when the widget is on screen.
 */

export type Field = { key: string; label: string; hint?: string } & (
	| {
			kind:
				| "text"
				| "url"
				| "textarea"
				| "code"
				| "date"
				| "datetime"
				| "color";
			placeholder?: string;
	  }
	| { kind: "number"; min?: number; max?: number; step?: number }
	| { kind: "select"; options: [value: string, label: string][] }
	| { kind: "toggle" }
	/** One entry per line, stored as string[]. */
	| { kind: "list"; placeholder?: string }
	| { kind: "timezone" }
	| { kind: "timezones" }
	/** City search; stores place, lat and lon. */
	| { kind: "place" }
);

type Data = Record<string, JsonValue>;

export type WidgetDef = {
	// biome-ignore lint/suspicious/noExplicitAny: each widget declares its own data shape
	load: () => Promise<{ default: ComponentType<WidgetProps<any>> }>;
	defaults: Data;
	fields?: Field[];
	/** Whether the settings are complete enough to add the widget. */
	ready?: (data: Data) => boolean;
};

const has = (key: string) => (data: Data) =>
	typeof data[key] === "string" && (data[key] as string).trim().length > 0;
const isUrl = (key: string) => (data: Data) =>
	/^https?:\/\/\S+\.\S+/i.test(String(data[key] ?? ""));

const place: Field = { key: "place", label: "City", kind: "place" };
const count = (label = "Show", max = 20): Field => ({
	key: "count",
	label,
	kind: "number",
	min: 1,
	max,
});

export const REGISTRY: Record<CatalogType, WidgetDef> = {
	// Productivity
	habits: {
		load: CATALOG_LOADERS.habits,
		defaults: { habits: ["Exercise", "Read", "Meditate"], done: {} },
		fields: [
			{
				key: "habits",
				label: "Habits",
				kind: "list",
				hint: "One per line",
				placeholder: "Drink water",
			},
		],
	},
	"top-three": {
		load: CATALOG_LOADERS["top-three"],
		defaults: { day: "", items: [] },
	},
	kanban: {
		load: CATALOG_LOADERS.kanban,
		defaults: { todo: [], doing: [], done: [] },
	},
	goal: {
		load: CATALOG_LOADERS.goal,
		defaults: {
			label: "Books read",
			current: 0,
			target: 24,
			unit: "",
			step: 1,
		},
		fields: [
			{ key: "label", label: "Goal", kind: "text" },
			{ key: "target", label: "Target", kind: "number", min: 1 },
			{ key: "step", label: "Step", kind: "number", min: 0.01 },
			{
				key: "unit",
				label: "Unit",
				kind: "text",
				placeholder: "km, $, pages…",
			},
		],
	},
	counter: {
		load: CATALOG_LOADERS.counter,
		defaults: { label: "", value: 0, step: 1, daily: false, day: "" },
		fields: [
			{ key: "label", label: "Counting", kind: "text", placeholder: "Coffees" },
			{ key: "step", label: "Step", kind: "number", min: 1 },
			{ key: "daily", label: "Reset every day", kind: "toggle" },
		],
	},
	journal: {
		load: CATALOG_LOADERS.journal,
		defaults: { entries: {} },
	},
	mood: {
		load: CATALOG_LOADERS.mood,
		defaults: { log: {} },
	},
	expenses: {
		load: CATALOG_LOADERS.expenses,
		defaults: { currency: "$", budget: 0, items: [] },
		fields: [
			{ key: "currency", label: "Currency symbol", kind: "text" },
			{
				key: "budget",
				label: "Monthly budget",
				kind: "number",
				min: 0,
				hint: "0 = no budget",
			},
		],
	},
	snippets: {
		load: CATALOG_LOADERS.snippets,
		defaults: { items: ["hello@example.com", "Thanks so much!"] },
		fields: [
			{
				key: "items",
				label: "Snippets",
				kind: "list",
				hint: "One per line. Use “Label | text” to show a short label.",
			},
		],
	},
	flashcards: {
		load: CATALOG_LOADERS.flashcards,
		defaults: {
			cards: "Bonjour | Hello\nMerci | Thank you\nAu revoir | Goodbye",
		},
		fields: [
			{
				key: "cards",
				label: "Cards",
				kind: "textarea",
				hint: "One per line: front | back",
			},
		],
	},
	markdown: {
		load: CATALOG_LOADERS.markdown,
		defaults: {
			text: "## Hello\n\nWrite **markdown** here:\n\n- lists\n- [links](https://tabz.space)\n- `code`",
		},
		fields: [{ key: "text", label: "Markdown", kind: "code" }],
	},
	// Time & date
	"analog-clock": {
		load: CATALOG_LOADERS["analog-clock"],
		defaults: { zone: "", label: "", seconds: true },
		fields: [
			{ key: "zone", label: "Time zone", kind: "timezone" },
			{ key: "label", label: "Label", kind: "text", placeholder: "Home" },
			{ key: "seconds", label: "Second hand", kind: "toggle" },
		],
	},
	"world-clocks": {
		load: CATALOG_LOADERS["world-clocks"],
		defaults: {
			zones: ["America/New_York", "Europe/London", "Asia/Tokyo"],
			hour12: false,
		},
		fields: [
			{ key: "zones", label: "Cities", kind: "timezones" },
			{ key: "hour12", label: "12-hour clock", kind: "toggle" },
		],
	},
	countdown: {
		load: CATALOG_LOADERS.countdown,
		defaults: { label: "", target: "" },
		fields: [
			{ key: "label", label: "Event", kind: "text", placeholder: "Vacation" },
			{ key: "target", label: "When", kind: "datetime" },
		],
		ready: has("target"),
	},
	"days-since": {
		load: CATALOG_LOADERS["days-since"],
		defaults: { label: "", since: "" },
		fields: [
			{
				key: "label",
				label: "Since",
				kind: "text",
				placeholder: "Last day off",
			},
			{ key: "since", label: "Date", kind: "date" },
		],
		ready: has("since"),
	},
	stopwatch: {
		load: CATALOG_LOADERS.stopwatch,
		defaults: { startedAt: null, elapsed: 0, laps: [] },
	},
	timer: {
		load: CATALOG_LOADERS.timer,
		defaults: { minutes: 5, endsAt: null, presets: [1, 3, 5, 10, 15, 30] },
	},
	"year-progress": {
		load: CATALOG_LOADERS["year-progress"],
		defaults: {},
	},
	"moon-phase": {
		load: CATALOG_LOADERS["moon-phase"],
		defaults: {},
	},
	"sun-times": {
		load: CATALOG_LOADERS["sun-times"],
		defaults: { place: "", lat: 0, lon: 0 },
		fields: [place],
		ready: has("place"),
	},
	birthdays: {
		load: CATALOG_LOADERS.birthdays,
		defaults: { people: ["Ada Lovelace | 12-10", "Alan Turing | 06-23"] },
		fields: [
			{
				key: "people",
				label: "People",
				kind: "list",
				hint: "One per line: Name | MM-DD (or YYYY-MM-DD to show their age)",
			},
		],
	},
	"life-calendar": {
		load: CATALOG_LOADERS["life-calendar"],
		defaults: { birthdate: "", years: 90 },
		fields: [
			{ key: "birthdate", label: "Birthday", kind: "date" },
			{ key: "years", label: "Years", kind: "number", min: 10, max: 120 },
		],
		ready: has("birthdate"),
	},
	// News & data
	quote: { load: CATALOG_LOADERS.quote, defaults: {} },
	word: { load: CATALOG_LOADERS.word, defaults: {} },
	"on-this-day": {
		load: CATALOG_LOADERS["on-this-day"],
		defaults: { count: 5 },
		fields: [count("Events", 10)],
	},
	wikipedia: {
		load: CATALOG_LOADERS.wikipedia,
		defaults: { mode: "featured" },
		fields: [
			{
				key: "mode",
				label: "Show",
				kind: "select",
				options: [
					["featured", "Today's featured article"],
					["random", "A random article"],
				],
			},
		],
	},
	"hacker-news": {
		load: CATALOG_LOADERS["hacker-news"],
		defaults: { list: "front_page", count: 8 },
		fields: [
			{
				key: "list",
				label: "List",
				kind: "select",
				options: [
					["front_page", "Front page"],
					["show_hn", "Show HN"],
					["ask_hn", "Ask HN"],
				],
			},
			count("Stories"),
		],
	},
	reddit: {
		load: CATALOG_LOADERS.reddit,
		defaults: { subreddit: "programming", sort: "top", count: 6 },
		fields: [
			{
				key: "subreddit",
				label: "Subreddit",
				kind: "text",
				placeholder: "pics",
			},
			{
				key: "sort",
				label: "Sort",
				kind: "select",
				options: [
					["top", "Top today"],
					["hot", "Hot"],
					["new", "New"],
				],
			},
			count("Posts"),
		],
		ready: has("subreddit"),
	},
	"github-repo": {
		load: CATALOG_LOADERS["github-repo"],
		defaults: { repos: ["facebook/react", "vercel/next.js"] },
		fields: [
			{
				key: "repos",
				label: "Repositories",
				kind: "list",
				hint: "One per line: owner/name",
			},
		],
	},
	crypto: {
		load: CATALOG_LOADERS.crypto,
		defaults: { coins: ["bitcoin", "ethereum", "solana"], currency: "usd" },
		fields: [
			{
				key: "coins",
				label: "Coins",
				kind: "list",
				hint: "CoinGecko ids, one per line (bitcoin, dogecoin, cardano…)",
			},
			{
				key: "currency",
				label: "Currency",
				kind: "select",
				options: [
					["usd", "US dollar"],
					["eur", "Euro"],
					["gbp", "Pound"],
					["jpy", "Yen"],
					["cad", "Canadian dollar"],
					["aud", "Australian dollar"],
				],
			},
		],
	},
	currency: {
		load: CATALOG_LOADERS.currency,
		defaults: { base: "USD", targets: ["EUR", "GBP", "JPY", "CAD"] },
		fields: [
			{ key: "base", label: "From", kind: "text", placeholder: "USD" },
			{
				key: "targets",
				label: "To",
				kind: "list",
				hint: "Currency codes, one per line",
			},
		],
	},
	"air-quality": {
		load: CATALOG_LOADERS["air-quality"],
		defaults: { place: "", lat: 0, lon: 0 },
		fields: [place],
		ready: has("place"),
	},
	earthquakes: {
		load: CATALOG_LOADERS.earthquakes,
		defaults: { feed: "significant_week", count: 6 },
		fields: [
			{
				key: "feed",
				label: "Show",
				kind: "select",
				options: [
					["significant_week", "Significant, past week"],
					["4.5_day", "Magnitude 4.5+, past day"],
					["2.5_day", "Magnitude 2.5+, past day"],
					["4.5_week", "Magnitude 4.5+, past week"],
				],
			},
			count("Quakes"),
		],
	},
	joke: { load: CATALOG_LOADERS.joke, defaults: {} },
	advice: { load: CATALOG_LOADERS.advice, defaults: {} },
	pets: {
		load: CATALOG_LOADERS.pets,
		defaults: { kind: "dog" },
		fields: [
			{
				key: "kind",
				label: "Show",
				kind: "select",
				options: [
					["dog", "Dogs"],
					["cat", "Cats"],
				],
			},
		],
	},
	trivia: { load: CATALOG_LOADERS.trivia, defaults: {} },
	// Tools
	calculator: { load: CATALOG_LOADERS.calculator, defaults: {} },
	converter: {
		load: CATALOG_LOADERS.converter,
		defaults: { category: "length" },
	},
	"tip-split": {
		load: CATALOG_LOADERS["tip-split"],
		defaults: { tip: 18, people: 2 },
	},
	password: {
		load: CATALOG_LOADERS.password,
		defaults: { length: 20, symbols: true, plain: false },
	},
	picker: {
		load: CATALOG_LOADERS.picker,
		defaults: { options: ["Pizza", "Sushi", "Tacos", "Curry", "Salad"] },
		fields: [
			{ key: "options", label: "Choices", kind: "list", hint: "One per line" },
		],
	},
	dice: {
		load: CATALOG_LOADERS.dice,
		defaults: { count: 2, sides: 6 },
	},
	coin: {
		load: CATALOG_LOADERS.coin,
		defaults: { heads: 0, tails: 0 },
	},
	palette: {
		load: CATALOG_LOADERS.palette,
		defaults: { colors: [] },
	},
	"qr-code": {
		load: CATALOG_LOADERS["qr-code"],
		defaults: { text: "https://tabz.space" },
	},
	"dev-tools": {
		load: CATALOG_LOADERS["dev-tools"],
		defaults: { tool: "uuid" },
	},
	"site-search": {
		load: CATALOG_LOADERS["site-search"],
		defaults: { site: "youtube" },
	},
	metronome: {
		load: CATALOG_LOADERS.metronome,
		defaults: { bpm: 100, beats: 4 },
	},
	// Wellness
	breathing: {
		load: CATALOG_LOADERS.breathing,
		defaults: { pattern: "box" },
	},
	ambient: {
		load: CATALOG_LOADERS.ambient,
		defaults: { color: "brown", volume: 0.4 },
	},
	"break-reminder": {
		load: CATALOG_LOADERS["break-reminder"],
		defaults: { every: 20 },
		fields: [
			{
				key: "every",
				label: "Remind me every (minutes)",
				kind: "number",
				min: 5,
				max: 180,
			},
		],
	},
	water: {
		load: CATALOG_LOADERS.water,
		defaults: { goal: 8, glasses: 0, day: "" },
		fields: [
			{
				key: "goal",
				label: "Daily goal (glasses)",
				kind: "number",
				min: 1,
				max: 30,
			},
		],
	},
	// Media
	youtube: {
		load: CATALOG_LOADERS.youtube,
		defaults: { url: "" },
		fields: [
			{
				key: "url",
				label: "Video or playlist link",
				kind: "url",
				placeholder: "https://www.youtube.com/watch?v=…",
			},
		],
		ready: isUrl("url"),
	},
	music: {
		load: CATALOG_LOADERS.music,
		defaults: { url: "" },
		fields: [
			{
				key: "url",
				label: "Spotify, Apple Music or SoundCloud link",
				kind: "url",
				placeholder: "https://open.spotify.com/playlist/…",
			},
		],
		ready: isUrl("url"),
	},
	photos: {
		load: CATALOG_LOADERS.photos,
		defaults: { urls: [], every: 1, fit: "cover" },
		fields: [
			{
				key: "urls",
				label: "Image links",
				kind: "list",
				hint: "One per line (https://…jpg)",
			},
			{
				key: "every",
				label: "Change every (minutes)",
				kind: "number",
				min: 1,
				max: 1440,
			},
			{
				key: "fit",
				label: "Fit",
				kind: "select",
				options: [
					["cover", "Fill"],
					["contain", "Whole picture"],
				],
			},
		],
		ready: (data) => Array.isArray(data.urls) && data.urls.length > 0,
	},
	map: {
		load: CATALOG_LOADERS.map,
		defaults: { place: "", lat: 0, lon: 0, zoom: 12 },
		fields: [
			place,
			{ key: "zoom", label: "Zoom", kind: "number", min: 2, max: 18 },
		],
		ready: has("place"),
	},
	embed: {
		load: CATALOG_LOADERS.embed,
		defaults: { url: "", height: 360 },
		fields: [
			{
				key: "url",
				label: "Page link",
				kind: "url",
				hint: "Many sites refuse to be embedded; look for an “Embed” link.",
			},
			{
				key: "height",
				label: "Height (px)",
				kind: "number",
				min: 120,
				max: 1200,
			},
		],
		ready: isUrl("url"),
	},
	// Your links
	"random-link": {
		load: CATALOG_LOADERS["random-link"],
		defaults: {},
	},
	"top-links": {
		load: CATALOG_LOADERS["top-links"],
		defaults: { count: 8 },
		fields: [count("Links")],
	},
	"recent-links": {
		load: CATALOG_LOADERS["recent-links"],
		defaults: { count: 8 },
		fields: [count("Links")],
	},
	"library-stats": {
		load: CATALOG_LOADERS["library-stats"],
		defaults: {},
	},
	"reading-list": {
		load: CATALOG_LOADERS["reading-list"],
		defaults: { count: 6 },
		fields: [count("Articles")],
	},
	// Custom
	"custom-html": {
		load: CATALOG_LOADERS["custom-html"],
		defaults: { html: "", state: null },
		ready: has("html"),
	},
	"json-api": {
		load: CATALOG_LOADERS["json-api"],
		defaults: {
			url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
			path: "bitcoin.usd",
			mode: "value",
			template: "Bitcoin: {{value}} USD",
			title: "{{title}}",
			link: "{{url}}",
			aside: "",
			count: 8,
			refresh: 10,
		},
		fields: [
			{ key: "url", label: "API address", kind: "url" },
			{
				key: "mode",
				label: "Show",
				kind: "select",
				options: [
					["value", "A single value"],
					["list", "A list of items"],
				],
			},
			{
				key: "path",
				label: "Path to the value or list",
				kind: "text",
				placeholder: "data.items",
				hint: "Dots between keys, numbers for array positions: data.0.price. Leave empty for the whole response.",
			},
			{
				key: "template",
				label: "Value format",
				kind: "text",
				hint: "{{value}} is replaced; for objects use {{value.key}}",
			},
			{
				key: "title",
				label: "List item text",
				kind: "text",
				hint: "Use the item's keys: {{title}} by {{author}}",
			},
			{ key: "link", label: "List item link", kind: "text" },
			{ key: "aside", label: "List item detail", kind: "text" },
			count("Items", 30),
			{
				key: "refresh",
				label: "Refresh every (minutes)",
				kind: "number",
				min: 1,
				max: 1440,
			},
		],
		ready: isUrl("url"),
	},
};

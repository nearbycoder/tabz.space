import type { ComponentType } from "react";
import type { CatalogType } from "#/lib/widget-catalog";
import type { JsonValue, WidgetProps } from "./kit";

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
		load: () => import("./catalog/habits"),
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
		load: () => import("./catalog/top-three"),
		defaults: { day: "", items: [] },
	},
	kanban: {
		load: () => import("./catalog/kanban"),
		defaults: { todo: [], doing: [], done: [] },
	},
	goal: {
		load: () => import("./catalog/goal"),
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
		load: () => import("./catalog/counter"),
		defaults: { label: "", value: 0, step: 1, daily: false, day: "" },
		fields: [
			{ key: "label", label: "Counting", kind: "text", placeholder: "Coffees" },
			{ key: "step", label: "Step", kind: "number", min: 1 },
			{ key: "daily", label: "Reset every day", kind: "toggle" },
		],
	},
	journal: {
		load: () => import("./catalog/journal"),
		defaults: { entries: {} },
	},
	mood: {
		load: () => import("./catalog/mood"),
		defaults: { log: {} },
	},
	expenses: {
		load: () => import("./catalog/expenses"),
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
		load: () => import("./catalog/snippets"),
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
		load: () => import("./catalog/flashcards"),
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
		load: () => import("./catalog/markdown"),
		defaults: {
			text: "## Hello\n\nWrite **markdown** here:\n\n- lists\n- [links](https://tabz.space)\n- `code`",
		},
		fields: [{ key: "text", label: "Markdown", kind: "code" }],
	},
	// Time & date
	"analog-clock": {
		load: () => import("./catalog/analog-clock"),
		defaults: { zone: "", label: "", seconds: true },
		fields: [
			{ key: "zone", label: "Time zone", kind: "timezone" },
			{ key: "label", label: "Label", kind: "text", placeholder: "Home" },
			{ key: "seconds", label: "Second hand", kind: "toggle" },
		],
	},
	"world-clocks": {
		load: () => import("./catalog/world-clocks"),
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
		load: () => import("./catalog/countdown"),
		defaults: { label: "", target: "" },
		fields: [
			{ key: "label", label: "Event", kind: "text", placeholder: "Vacation" },
			{ key: "target", label: "When", kind: "datetime" },
		],
		ready: has("target"),
	},
	"days-since": {
		load: () => import("./catalog/days-since"),
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
		load: () => import("./catalog/stopwatch"),
		defaults: { startedAt: null, elapsed: 0, laps: [] },
	},
	timer: {
		load: () => import("./catalog/timer"),
		defaults: { minutes: 5, endsAt: null, presets: [1, 3, 5, 10, 15, 30] },
	},
	"year-progress": {
		load: () => import("./catalog/year-progress"),
		defaults: {},
	},
	"moon-phase": {
		load: () => import("./catalog/moon-phase"),
		defaults: {},
	},
	"sun-times": {
		load: () => import("./catalog/sun-times"),
		defaults: { place: "", lat: 0, lon: 0 },
		fields: [place],
		ready: has("place"),
	},
	birthdays: {
		load: () => import("./catalog/birthdays"),
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
		load: () => import("./catalog/life-calendar"),
		defaults: { birthdate: "", years: 90 },
		fields: [
			{ key: "birthdate", label: "Birthday", kind: "date" },
			{ key: "years", label: "Years", kind: "number", min: 10, max: 120 },
		],
		ready: has("birthdate"),
	},
	// News & data
	quote: { load: () => import("./catalog/quote"), defaults: {} },
	word: { load: () => import("./catalog/word"), defaults: {} },
	"on-this-day": {
		load: () => import("./catalog/on-this-day"),
		defaults: { count: 5 },
		fields: [count("Events", 10)],
	},
	wikipedia: {
		load: () => import("./catalog/wikipedia"),
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
		load: () => import("./catalog/hacker-news"),
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
		load: () => import("./catalog/reddit"),
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
		load: () => import("./catalog/github-repo"),
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
		load: () => import("./catalog/crypto"),
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
		load: () => import("./catalog/currency"),
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
		load: () => import("./catalog/air-quality"),
		defaults: { place: "", lat: 0, lon: 0 },
		fields: [place],
		ready: has("place"),
	},
	earthquakes: {
		load: () => import("./catalog/earthquakes"),
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
	joke: { load: () => import("./catalog/joke"), defaults: {} },
	advice: { load: () => import("./catalog/advice"), defaults: {} },
	pets: {
		load: () => import("./catalog/pets"),
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
	trivia: { load: () => import("./catalog/trivia"), defaults: {} },
	// Tools
	calculator: { load: () => import("./catalog/calculator"), defaults: {} },
	converter: {
		load: () => import("./catalog/converter"),
		defaults: { category: "length" },
	},
	"tip-split": {
		load: () => import("./catalog/tip-split"),
		defaults: { tip: 18, people: 2 },
	},
	password: {
		load: () => import("./catalog/password"),
		defaults: { length: 20, symbols: true, plain: false },
	},
	picker: {
		load: () => import("./catalog/picker"),
		defaults: { options: ["Pizza", "Sushi", "Tacos", "Curry", "Salad"] },
		fields: [
			{ key: "options", label: "Choices", kind: "list", hint: "One per line" },
		],
	},
	dice: {
		load: () => import("./catalog/dice"),
		defaults: { count: 2, sides: 6 },
	},
	coin: {
		load: () => import("./catalog/coin"),
		defaults: { heads: 0, tails: 0 },
	},
	palette: {
		load: () => import("./catalog/palette"),
		defaults: { colors: [] },
	},
	"qr-code": {
		load: () => import("./catalog/qr-code"),
		defaults: { text: "https://tabz.space" },
	},
	"dev-tools": {
		load: () => import("./catalog/dev-tools"),
		defaults: { tool: "uuid" },
	},
	"site-search": {
		load: () => import("./catalog/site-search"),
		defaults: { site: "youtube" },
	},
	metronome: {
		load: () => import("./catalog/metronome"),
		defaults: { bpm: 100, beats: 4 },
	},
	// Wellness
	breathing: {
		load: () => import("./catalog/breathing"),
		defaults: { pattern: "box" },
	},
	ambient: {
		load: () => import("./catalog/ambient"),
		defaults: { color: "brown", volume: 0.4 },
	},
	"break-reminder": {
		load: () => import("./catalog/break-reminder"),
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
		load: () => import("./catalog/water"),
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
		load: () => import("./catalog/youtube"),
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
		load: () => import("./catalog/music"),
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
		load: () => import("./catalog/photos"),
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
		load: () => import("./catalog/map"),
		defaults: { place: "", lat: 0, lon: 0, zoom: 12 },
		fields: [
			place,
			{ key: "zoom", label: "Zoom", kind: "number", min: 2, max: 18 },
		],
		ready: has("place"),
	},
	embed: {
		load: () => import("./catalog/embed"),
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
		load: () => import("./catalog/random-link"),
		defaults: {},
	},
	"top-links": {
		load: () => import("./catalog/top-links"),
		defaults: { count: 8 },
		fields: [count("Links")],
	},
	"recent-links": {
		load: () => import("./catalog/recent-links"),
		defaults: { count: 8 },
		fields: [count("Links")],
	},
	"library-stats": {
		load: () => import("./catalog/library-stats"),
		defaults: {},
	},
	// Custom
	"custom-html": {
		load: () => import("./catalog/custom-html"),
		defaults: { html: "", state: null },
		ready: has("html"),
	},
	"json-api": {
		load: () => import("./catalog/json-api"),
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

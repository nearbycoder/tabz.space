/*
 * Every widget tabz offers: name and icon. Shared by the server (valid types)
 * and the browser (card headers), so it stays tiny: categories and
 * descriptions live in ./widget-details (gallery only), and each widget's code
 * and settings in components/home/widgets/registry.ts, loaded on demand.
 */

type Entry = { label: string; icon: string };

/** The original widgets, which keep their own stored shape. */
export const LEGACY_WIDGETS = {
	notes: {
		label: "Notes",
		icon: "📝",
	},
	todo: {
		label: "To-do",
		icon: "✅",
	},
	pomodoro: {
		label: "Focus timer",
		icon: "🍅",
	},
	weather: {
		label: "Weather",
		icon: "🌤️",
	},
	calendar: {
		label: "Calendar",
		icon: "📅",
	},
	stocks: {
		label: "Stocks",
		icon: "📈",
	},
	feed: {
		label: "News feed",
		icon: "📰",
	},
} as const satisfies Record<string, Entry>;

/** Widgets stored as `{ type, data }`; settings are described by fields. */
export const CATALOG_WIDGETS = {
	// Productivity
	habits: {
		label: "Habit tracker",
		icon: "🔁",
	},
	"top-three": {
		label: "Today's top 3",
		icon: "🥇",
	},
	kanban: {
		label: "Kanban",
		icon: "🗂️",
	},
	goal: {
		label: "Goal progress",
		icon: "🎯",
	},
	counter: {
		label: "Counter",
		icon: "🔢",
	},
	journal: {
		label: "Daily journal",
		icon: "📓",
	},
	mood: {
		label: "Mood tracker",
		icon: "🙂",
	},
	expenses: {
		label: "Spending",
		icon: "💸",
	},
	snippets: {
		label: "Snippets",
		icon: "📋",
	},
	flashcards: {
		label: "Flashcards",
		icon: "🃏",
	},
	markdown: {
		label: "Markdown",
		icon: "Ⓜ️",
	},
	// Time & date
	"analog-clock": {
		label: "Analog clock",
		icon: "🕰️",
	},
	"world-clocks": {
		label: "World clocks",
		icon: "🌍",
	},
	countdown: {
		label: "Countdown",
		icon: "⏳",
	},
	"days-since": {
		label: "Days since",
		icon: "📆",
	},
	stopwatch: {
		label: "Stopwatch",
		icon: "⏱️",
	},
	timer: {
		label: "Timer",
		icon: "⏲️",
	},
	"year-progress": {
		label: "Year progress",
		icon: "📊",
	},
	"moon-phase": {
		label: "Moon phase",
		icon: "🌙",
	},
	"sun-times": {
		label: "Sunrise & sunset",
		icon: "🌅",
	},
	birthdays: {
		label: "Birthdays",
		icon: "🎂",
	},
	"life-calendar": {
		label: "Life in weeks",
		icon: "🗓️",
	},
	// News & data
	quote: {
		label: "Quote of the day",
		icon: "💬",
	},
	word: {
		label: "Word of the day",
		icon: "🔤",
	},
	"on-this-day": {
		label: "On this day",
		icon: "📜",
	},
	wikipedia: {
		label: "Wikipedia",
		icon: "📚",
	},
	"hacker-news": {
		label: "Hacker News",
		icon: "🟧",
	},
	reddit: {
		label: "Subreddit",
		icon: "👽",
	},
	"github-repo": {
		label: "GitHub repo",
		icon: "🐙",
	},
	crypto: {
		label: "Crypto prices",
		icon: "🪙",
	},
	currency: {
		label: "Exchange rates",
		icon: "💱",
	},
	"air-quality": {
		label: "Air quality",
		icon: "🌫️",
	},
	earthquakes: {
		label: "Earthquakes",
		icon: "🌋",
	},
	joke: {
		label: "Dad joke",
		icon: "😄",
	},
	advice: {
		label: "Advice",
		icon: "🧭",
	},
	pets: {
		label: "Dog or cat",
		icon: "🐶",
	},
	trivia: {
		label: "Trivia",
		icon: "❓",
	},
	// Tools
	calculator: {
		label: "Calculator",
		icon: "🧮",
	},
	converter: {
		label: "Unit converter",
		icon: "📏",
	},
	"tip-split": {
		label: "Tip & split",
		icon: "🧾",
	},
	password: {
		label: "Password generator",
		icon: "🔑",
	},
	picker: {
		label: "Random picker",
		icon: "🎡",
	},
	dice: {
		label: "Dice",
		icon: "🎲",
	},
	coin: {
		label: "Coin flip",
		icon: "🪙",
	},
	palette: {
		label: "Color palette",
		icon: "🎨",
	},
	"qr-code": {
		label: "QR code",
		icon: "🔳",
	},
	"dev-tools": {
		label: "Dev tools",
		icon: "🛠️",
	},
	"site-search": {
		label: "Site search",
		icon: "🔎",
	},
	metronome: {
		label: "Metronome",
		icon: "🎼",
	},
	// Wellness
	breathing: {
		label: "Breathing",
		icon: "🫁",
	},
	ambient: {
		label: "Ambient sound",
		icon: "🌊",
	},
	"break-reminder": {
		label: "Break reminder",
		icon: "👀",
	},
	water: {
		label: "Water intake",
		icon: "💧",
	},
	// Media
	youtube: {
		label: "YouTube",
		icon: "▶️",
	},
	music: {
		label: "Music player",
		icon: "🎵",
	},
	photos: {
		label: "Photo frame",
		icon: "🖼️",
	},
	map: {
		label: "Map",
		icon: "🗺️",
	},
	embed: {
		label: "Embed a page",
		icon: "🪟",
	},
	// Your links
	"random-link": {
		label: "Random link",
		icon: "🎰",
	},
	"top-links": {
		label: "Most visited",
		icon: "🔥",
	},
	"recent-links": {
		label: "Recently added",
		icon: "🆕",
	},
	"library-stats": {
		label: "Library stats",
		icon: "📈",
	},
	"reading-list": {
		label: "Read later",
		icon: "📖",
	},
	// Custom
	"custom-html": {
		label: "Custom code",
		icon: "🧩",
	},
	"json-api": {
		label: "JSON API",
		icon: "🔌",
	},
} as const satisfies Record<string, Entry>;

export const WIDGET_TYPES = { ...LEGACY_WIDGETS, ...CATALOG_WIDGETS };
export type WidgetType = keyof typeof WIDGET_TYPES;
export type CatalogType = keyof typeof CATALOG_WIDGETS;
export const CATALOG_TYPES = Object.keys(CATALOG_WIDGETS) as [
	CatalogType,
	...CatalogType[],
];

export const isCatalogType = (type: string): type is CatalogType =>
	type in CATALOG_WIDGETS;

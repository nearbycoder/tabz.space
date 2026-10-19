import type { WidgetType } from "./widget-catalog";

/* Gallery-only details: which shelf a widget sits on and what it does. */

export const WIDGET_CATEGORIES = {
	productivity: "Productivity",
	time: "Time & date",
	info: "News & data",
	tools: "Tools",
	wellness: "Wellness",
	media: "Media",
	links: "Your links",
	custom: "Custom",
} as const;
export type WidgetCategory = keyof typeof WIDGET_CATEGORIES;

export const WIDGET_DETAILS: Record<
	WidgetType,
	{ category: WidgetCategory; description: string }
> = {
	notes: {
		category: "productivity",
		description: "A sticky note that saves as you type",
	},
	todo: {
		category: "productivity",
		description: "A checklist; done items sink to the bottom",
	},
	pomodoro: {
		category: "productivity",
		description: "Pomodoro work and break intervals",
	},
	weather: {
		category: "info",
		description: "Current conditions and a 4-day forecast",
	},
	calendar: {
		category: "productivity",
		description: "Upcoming events from any iCal link",
	},
	stocks: {
		category: "info",
		description: "Quotes for stocks, indexes, crypto and currencies",
	},
	feed: {
		category: "info",
		description: "Latest posts from any site's RSS feed",
	},
	habits: {
		category: "productivity",
		description: "Tick off daily habits and keep your streaks",
	},
	"top-three": {
		category: "productivity",
		description: "Three priorities for today; clears each morning",
	},
	kanban: {
		category: "productivity",
		description: "A tiny board: to do, doing, done",
	},
	goal: {
		category: "productivity",
		description: "Track progress toward any number",
	},
	counter: { category: "productivity", description: "Tap to count anything" },
	journal: {
		category: "productivity",
		description: "One line a day, with your recent entries",
	},
	mood: {
		category: "productivity",
		description: "Log how you feel and see the last two weeks",
	},
	expenses: {
		category: "productivity",
		description: "Jot down expenses; totals for this month",
	},
	snippets: {
		category: "productivity",
		description: "Text you paste often, one tap to copy",
	},
	flashcards: {
		category: "productivity",
		description: "Flip through cards to learn anything",
	},
	markdown: {
		category: "productivity",
		description: "Formatted text: headings, lists, links",
	},
	"analog-clock": {
		category: "time",
		description: "A classic clock face, any time zone",
	},
	"world-clocks": {
		category: "time",
		description: "The time in several cities at once",
	},
	countdown: {
		category: "time",
		description: "Days, hours and minutes until an event",
	},
	"days-since": {
		category: "time",
		description: "How long it's been since something happened",
	},
	stopwatch: { category: "time", description: "Start, stop and record laps" },
	timer: {
		category: "time",
		description: "A kitchen timer with presets and a chime",
	},
	"year-progress": {
		category: "time",
		description: "How far through the day, week, month and year",
	},
	"moon-phase": {
		category: "time",
		description: "Tonight's moon and the next full moon",
	},
	"sun-times": {
		category: "time",
		description: "Daylight hours for your city",
	},
	birthdays: {
		category: "time",
		description: "Upcoming birthdays and anniversaries",
	},
	"life-calendar": {
		category: "time",
		description: "Every week of a 90-year life on one grid",
	},
	quote: {
		category: "info",
		description: "A new line to think about each day",
	},
	word: { category: "info", description: "Learn a new word every day" },
	"on-this-day": {
		category: "info",
		description: "Historic events from today's date",
	},
	wikipedia: {
		category: "info",
		description: "Today's featured article or a random one",
	},
	"hacker-news": {
		category: "info",
		description: "The front page of Hacker News",
	},
	reddit: { category: "info", description: "Top posts from any subreddit" },
	"github-repo": {
		category: "info",
		description: "Stars, forks and issues for repositories",
	},
	crypto: {
		category: "info",
		description: "Bitcoin, Ethereum and more, with 24h change",
	},
	currency: {
		category: "info",
		description: "Convert between currencies at today's rate",
	},
	"air-quality": {
		category: "info",
		description: "AQI and particulates for your city",
	},
	earthquakes: {
		category: "info",
		description: "Recent significant earthquakes worldwide",
	},
	joke: { category: "info", description: "A groan-worthy joke on demand" },
	advice: { category: "info", description: "A random piece of advice" },
	pets: { category: "info", description: "A random dog or cat photo" },
	trivia: {
		category: "info",
		description: "A multiple-choice question to test yourself",
	},
	calculator: { category: "tools", description: "Type a sum, get the answer" },
	converter: {
		category: "tools",
		description: "Length, weight, temperature, speed and more",
	},
	"tip-split": {
		category: "tools",
		description: "Work out the tip and each person's share",
	},
	password: {
		category: "tools",
		description: "Strong random passwords and passphrases",
	},
	picker: {
		category: "tools",
		description: "Can't decide? Let tabz pick from your list",
	},
	dice: { category: "tools", description: "Roll any number of dice" },
	coin: {
		category: "tools",
		description: "Heads or tails, with a running tally",
	},
	palette: {
		category: "tools",
		description: "Generate harmonious colors; tap to copy",
	},
	"qr-code": {
		category: "tools",
		description: "Turn any text or link into a QR code",
	},
	"dev-tools": {
		category: "tools",
		description: "UUIDs, Base64, URL encoding and JSON formatting",
	},
	"site-search": {
		category: "tools",
		description: "Search YouTube, GitHub, Wikipedia and more",
	},
	metronome: { category: "tools", description: "A steady beat at any tempo" },
	breathing: {
		category: "wellness",
		description: "Guided box and 4-7-8 breathing",
	},
	ambient: {
		category: "wellness",
		description: "White, pink or brown noise to focus",
	},
	"break-reminder": {
		category: "wellness",
		description: "Nudges to rest your eyes and stretch",
	},
	water: {
		category: "wellness",
		description: "Count glasses toward a daily goal",
	},
	youtube: { category: "media", description: "Play a video or playlist" },
	music: {
		category: "media",
		description: "Spotify, Apple Music or SoundCloud",
	},
	photos: {
		category: "media",
		description: "Your favourite pictures, one at a time",
	},
	map: { category: "media", description: "A map of any place" },
	embed: { category: "media", description: "Show any embeddable web page" },
	"random-link": {
		category: "links",
		description: "Rediscover something you saved",
	},
	"top-links": { category: "links", description: "The links you open most" },
	"recent-links": { category: "links", description: "Your newest saved links" },
	"library-stats": {
		category: "links",
		description: "Links, folders, visits and top sites",
	},
	"custom-html": {
		category: "custom",
		description: "Build your own with HTML, CSS and JavaScript",
	},
	"json-api": {
		category: "custom",
		description: "Show values from any JSON API, no code needed",
	},
};

import { lazyNamed } from "#/lib/lazy";
import type { CatalogType } from "#/lib/widget-catalog";

/*
 * Where each widget's code lives, kept apart from the registry (settings and
 * defaults) and the widget frame. The home page can then fetch a board's
 * widgets the moment it renders, all at once, instead of one after another:
 * frame first, then each widget once the frame has run.
 */

export const CATALOG_LOADERS = {
	habits: () => import("./catalog/habits"),
	"top-three": () => import("./catalog/top-three"),
	kanban: () => import("./catalog/kanban"),
	goal: () => import("./catalog/goal"),
	counter: () => import("./catalog/counter"),
	journal: () => import("./catalog/journal"),
	mood: () => import("./catalog/mood"),
	expenses: () => import("./catalog/expenses"),
	snippets: () => import("./catalog/snippets"),
	flashcards: () => import("./catalog/flashcards"),
	markdown: () => import("./catalog/markdown"),
	"analog-clock": () => import("./catalog/analog-clock"),
	"world-clocks": () => import("./catalog/world-clocks"),
	countdown: () => import("./catalog/countdown"),
	"days-since": () => import("./catalog/days-since"),
	stopwatch: () => import("./catalog/stopwatch"),
	timer: () => import("./catalog/timer"),
	"year-progress": () => import("./catalog/year-progress"),
	"moon-phase": () => import("./catalog/moon-phase"),
	"sun-times": () => import("./catalog/sun-times"),
	birthdays: () => import("./catalog/birthdays"),
	"life-calendar": () => import("./catalog/life-calendar"),
	quote: () => import("./catalog/quote"),
	word: () => import("./catalog/word"),
	"on-this-day": () => import("./catalog/on-this-day"),
	wikipedia: () => import("./catalog/wikipedia"),
	"hacker-news": () => import("./catalog/hacker-news"),
	reddit: () => import("./catalog/reddit"),
	"github-repo": () => import("./catalog/github-repo"),
	crypto: () => import("./catalog/crypto"),
	currency: () => import("./catalog/currency"),
	"air-quality": () => import("./catalog/air-quality"),
	earthquakes: () => import("./catalog/earthquakes"),
	joke: () => import("./catalog/joke"),
	advice: () => import("./catalog/advice"),
	pets: () => import("./catalog/pets"),
	trivia: () => import("./catalog/trivia"),
	calculator: () => import("./catalog/calculator"),
	converter: () => import("./catalog/converter"),
	"tip-split": () => import("./catalog/tip-split"),
	password: () => import("./catalog/password"),
	picker: () => import("./catalog/picker"),
	dice: () => import("./catalog/dice"),
	coin: () => import("./catalog/coin"),
	palette: () => import("./catalog/palette"),
	"qr-code": () => import("./catalog/qr-code"),
	"dev-tools": () => import("./catalog/dev-tools"),
	"site-search": () => import("./catalog/site-search"),
	metronome: () => import("./catalog/metronome"),
	breathing: () => import("./catalog/breathing"),
	ambient: () => import("./catalog/ambient"),
	"break-reminder": () => import("./catalog/break-reminder"),
	water: () => import("./catalog/water"),
	youtube: () => import("./catalog/youtube"),
	music: () => import("./catalog/music"),
	photos: () => import("./catalog/photos"),
	map: () => import("./catalog/map"),
	embed: () => import("./catalog/embed"),
	"random-link": () => import("./catalog/random-link"),
	"top-links": () => import("./catalog/top-links"),
	"recent-links": () => import("./catalog/recent-links"),
	"library-stats": () => import("./catalog/library-stats"),
	"reading-list": () => import("./catalog/reading-list"),
	"custom-html": () => import("./catalog/custom-html"),
	"json-api": () => import("./catalog/json-api"),
} satisfies Record<CatalogType, () => Promise<unknown>>;

const BUILT_IN: Record<string, () => Promise<unknown>> = {
	notes: () => import("./LocalWidgets"),
	todo: () => import("./LocalWidgets"),
	pomodoro: () => import("./LocalWidgets"),
	weather: () => import("./DataWidgets"),
	calendar: () => import("./DataWidgets"),
	stocks: () => import("./DataWidgets"),
	feed: () => import("./DataWidgets"),
};

/** The widget frame (WidgetBody), shared so preloading fills the same cache. */
export const WidgetFrame = lazyNamed(
	() => import("./WidgetBody"),
	"WidgetBody",
);

const started = new Set<string>();

/**
 * Loads the code for these widget types and the widget frame, all at once.
 * Resolves once it's all here and the widgets can render without suspending.
 */
export function preloadWidgetCode(types: string[]): Promise<unknown> {
	if (typeof window === "undefined" || types.length === 0)
		return Promise.resolve();
	const loaders: Record<string, (() => Promise<unknown>) | undefined> = {
		...BUILT_IN,
		...CATALOG_LOADERS,
	};
	// Start every download now rather than after the frame has run.
	for (const type of types) {
		if (started.has(type)) continue;
		started.add(type);
		void loaders[type]?.().catch(() => started.delete(type));
	}
	return Promise.all([
		WidgetFrame.preload(),
		import("./WidgetBody").then((module) => module.preloadWidgets(types)),
	]).catch(() => {});
}

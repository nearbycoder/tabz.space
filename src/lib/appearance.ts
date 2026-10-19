import { FONTS, type FontKey, type UserSettings } from "./preferences";

const loadedFonts = new Set<string>(["geist"]);

/** Loads a Google font the first time it's needed. */
export function loadFont(key: FontKey) {
	if (loadedFonts.has(key) || !FONTS[key].google) return;
	loadedFonts.add(key);
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = `https://fonts.googleapis.com/css2?family=${FONTS[key].google}&display=swap`;
	document.head.appendChild(link);
}

/** Applies font, corners, surface and accent to <html> (so portals match too). */
export function applyAppearance(settings: UserSettings) {
	const root = document.documentElement;
	root.style.setProperty("--accent", settings.accent);
	root.dataset.radius = settings.radius;
	root.dataset.surface = settings.surface;
	root.style.setProperty("--user-font", FONTS[settings.font].family);
	loadFont(settings.font);
	// Tint the mobile browser chrome / status bar to match the page.
	const canvas = getComputedStyle(root).getPropertyValue("--canvas").trim();
	for (const meta of document.querySelectorAll('meta[name="theme-color"]'))
		meta.setAttribute("content", canvas);
}

/** Website screenshot used when a page has no og:image. */
export const screenshotFor = (url: string) =>
	`https://image.thum.io/get/width/640/crop/800/${url}`;

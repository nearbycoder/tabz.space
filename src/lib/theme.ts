import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import type { UserSettings } from "./preferences";

const KEY = "tabz-theme";

/**
 * Inline script that applies the last theme before first paint.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${KEY}")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export function applyTheme(theme: UserSettings["theme"]) {
	localStorage.setItem(KEY, theme);
	// Also a cookie, so the server can render the right theme from the first
	// byte (no white flash, e.g. when launching from the home screen).
	// biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API isn't in Safari yet
	document.cookie = `${KEY}=${theme}; path=/; max-age=31536000; samesite=lax`;
	const dark =
		theme === "dark" ||
		(theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.classList.toggle("dark", dark);
}

export type ThemePreference = UserSettings["theme"];

/** The theme saved in the cookie: read from the request on the server, document.cookie in the browser. */
export const readThemePreference = createIsomorphicFn()
	.server((): ThemePreference => parseTheme(getCookie(KEY)))
	.client(
		(): ThemePreference =>
			parseTheme(document.cookie.match(/(?:^|; )tabz-theme=([^;]*)/)?.[1]),
	);

const parseTheme = (value: string | undefined): ThemePreference =>
	value === "dark" || value === "light" ? value : "system";

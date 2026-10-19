import type { UserSettings } from "./preferences";

const KEY = "tabz-theme";

/** Inline script that applies the last theme before paint to avoid a flash. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${KEY}")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export function applyTheme(theme: UserSettings["theme"]) {
	localStorage.setItem(KEY, theme);
	const dark =
		theme === "dark" ||
		(theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.classList.toggle("dark", dark);
}

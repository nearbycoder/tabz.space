import { whenIdle } from "./lazy";

/*
 * Instant, offline-capable new tabs (see public/sw.js). Launches open
 * "/?launch=…" so the service worker answers from the saved copy; the page
 * then tidies the address bar and refetches anything stale on its own.
 */

const PAGES = "tabz-pages-v1";

export function startOffline() {
	if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

	const url = new URL(window.location.href);
	if (url.searchParams.has("launch")) {
		url.searchParams.delete("launch");
		window.history.replaceState(
			window.history.state,
			"",
			url.pathname + url.search + url.hash,
		);
	}

	// Was this page the saved copy, and did it turn out to be another
	// account's (or a signed-out session's)? The worker answers once it knows.
	navigator.serviceWorker.addEventListener("message", (event) => {
		if (event.data?.type === "tabz:reload") window.location.reload();
	});
	navigator.serviceWorker.controller?.postMessage({ type: "tabz:check" });

	whenIdle(() => {
		navigator.serviceWorker.register("/sw.js").catch(() => {});
	});

	// Refresh the saved copy whenever you leave a tab, so the next one is current.
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden")
			navigator.serviceWorker.controller?.postMessage({ type: "tabz:refresh" });
	});

	// A saved page from an older deploy asked for code that's gone: reload once.
	window.addEventListener("vite:preloadError", (event) => {
		if (sessionStorage.getItem("tabz-chunk-reload")) return;
		sessionStorage.setItem("tabz-chunk-reload", "1");
		event.preventDefault();
		window.location.reload();
	});
}

/** Drops the saved home page, e.g. when signing out. */
export async function forgetOfflinePage() {
	navigator.serviceWorker?.controller?.postMessage({ type: "tabz:forget" });
	await globalThis.caches?.delete(PAGES).catch(() => false);
}

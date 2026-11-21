// Runs on tabz.space only. Relays requests from the page to the background
// worker (private windows, opening tabs, history search) and receives the API
// token the signed-in page mints for the extension.
const ORIGIN = location.origin;

// A new tab the extension is loading out of sight (newtab.js): say as soon as
// the page is parsed, so it can be shown without waiting for every image.
if (new URLSearchParams(location.search).has("launch"))
	document.addEventListener(
		"DOMContentLoaded",
		() => chrome.runtime.sendMessage({ type: "page-ready" }).catch(() => {}),
		{ once: true },
	);
const post = (message) =>
	window.postMessage({ source: "tabz-extension", ...message }, ORIGIN);

async function announce() {
	try {
		const status = await chrome.runtime.sendMessage({ type: "status" });
		if (status?.installed) post({ type: "status", ...status });
	} catch {
		// Extension reloaded or unavailable; the page falls back gracefully.
	}
}

window.addEventListener("message", async (event) => {
	if (
		event.source !== window ||
		event.origin !== ORIGIN ||
		event.data?.source !== "tabz-page"
	)
		return;
	const { type, id } = event.data;
	if (type === "hello") return announce();
	if (type === "look")
		return chrome.runtime
			.sendMessage({ type: "set-look", look: event.data.look })
			.catch(() => {});
	if (type === "sync-browser")
		return chrome.runtime.sendMessage({ type: "pull-ops" }).catch(() => {});
	if (type === "focus")
		return chrome.runtime
			.sendMessage({
				type: "focus-settings",
				focus: event.data.focus,
				timeZone: event.data.timeZone,
			})
			.catch(() => {});
	try {
		if (type === "history-search") {
			const result = await chrome.runtime.sendMessage({
				type,
				text: String(event.data.text ?? ""),
			});
			post({ type: "history", id, items: result?.items ?? [] });
			return;
		}
		if (type === "set-token") {
			await chrome.runtime.sendMessage({
				type,
				token: event.data.token,
				baseUrl: ORIGIN,
			});
			return announce();
		}
		if (type === "open-settings" || type === "history-settings") {
			const result = await chrome.runtime.sendMessage({ type });
			post({ type: "opened", id, ok: result?.ok === true });
			return;
		}
		if (
			type === "open-incognito" ||
			type === "open-tabs" ||
			type === "focus-snooze"
		) {
			const result = await chrome.runtime.sendMessage({
				type,
				urls: event.data.urls,
			});
			post({ type: "opened", id, ok: result?.ok === true });
		}
	} catch {
		post({
			type: type === "history-search" ? "history" : "opened",
			id,
			ok: false,
			items: [],
		});
	}
});

announce();
// Coming back from the options page (e.g. after allowing history): refresh.
document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "visible") announce();
});

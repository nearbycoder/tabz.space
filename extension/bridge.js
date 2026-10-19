// Runs on tabz.space only. Relays requests from the page to the background
// worker (private windows, opening tabs) and receives the API token the
// signed-in page mints for the extension.
const ORIGIN = location.origin;
const post = (message) =>
	window.postMessage({ source: "tabz-extension", ...message }, ORIGIN);

async function announce() {
	try {
		post({
			type: "status",
			...(await chrome.runtime.sendMessage({ type: "status" })),
		});
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
	try {
		if (type === "set-token") {
			await chrome.runtime.sendMessage({
				type,
				token: event.data.token,
				baseUrl: ORIGIN,
			});
			return announce();
		}
		if (type === "open-incognito" || type === "open-tabs") {
			const result = await chrome.runtime.sendMessage({
				type,
				urls: event.data.urls,
			});
			post({ type: "opened", id, ok: result?.ok === true });
		}
	} catch {
		post({ type: "opened", id, ok: false });
	}
});

announce();

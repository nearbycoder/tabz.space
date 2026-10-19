// Runs on tabz.space only. Relays "open privately" requests from the page to
// the background worker, which is the only place allowed to open incognito windows.
const ORIGIN = location.origin;

async function announce() {
	try {
		const status = await chrome.runtime.sendMessage({ type: "status" });
		window.postMessage(
			{ source: "tabz-extension", type: "status", ...status },
			ORIGIN,
		);
	} catch {
		// Extension reloaded or unavailable; the page falls back to copy-link.
	}
}

window.addEventListener("message", async (event) => {
	if (
		event.source !== window ||
		event.origin !== ORIGIN ||
		event.data?.source !== "tabz-page"
	)
		return;
	if (event.data.type === "hello") announce();
	if (event.data.type === "open-incognito") {
		let ok = false;
		try {
			ok =
				(
					await chrome.runtime.sendMessage({
						type: "open-incognito",
						urls: event.data.urls,
					})
				)?.ok === true;
		} catch {
			ok = false;
		}
		window.postMessage(
			{ source: "tabz-extension", type: "opened", id: event.data.id, ok },
			ORIGIN,
		);
	}
});

announce();

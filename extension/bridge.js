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

/**
 * The page's background, for the new tab page to paint while tabz loads.
 * Values end up in CSS, so only plain colors, gradients and https images pass.
 */
function rememberLook(look) {
	if (!look || typeof look !== "object") return;
	const color = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
	const gradient = /^[\w\s#%(),.-]+$/;
	const clean = {
		canvas: color.test(look.canvas ?? "") ? look.canvas : "#0b0c10",
		gradient:
			typeof look.gradient === "string" &&
			look.gradient.length < 600 &&
			gradient.test(look.gradient)
				? look.gradient
				: undefined,
		image:
			typeof look.image === "string" &&
			/^https:\/\/[^\s"'()\\]+$/.test(look.image) &&
			look.image.length < 2048
				? look.image
				: undefined,
		dim: Number.isFinite(look.dim) ? Math.min(90, Math.max(0, look.dim)) : 0,
	};
	chrome.storage.local.set({ look: clean }).catch(() => {});
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
	if (type === "look") return rememberLook(event.data.look);
	try {
		if (type === "set-token") {
			await chrome.runtime.sendMessage({
				type,
				token: event.data.token,
				baseUrl: ORIGIN,
			});
			return announce();
		}
		if (type === "open-settings") {
			const result = await chrome.runtime.sendMessage({ type });
			post({ type: "opened", id, ok: result?.ok === true });
			return;
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

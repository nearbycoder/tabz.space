/*
 * tabz service worker: makes new tabs open instantly, even offline.
 *
 * - Launches (the extension's new tab and the installed app open "/?launch=…")
 *   are answered straight from the last saved copy of your home page, then
 *   refreshed in the background. The page refetches anything stale itself.
 * - Every other visit to "/" goes to the network first (sign-in redirects
 *   never see an old page) and falls back to the saved copy when offline.
 * - Built files under /assets/ are content-hashed, so they're kept and served
 *   from here; an old saved page can always find the code it was built with.
 *
 * - Each saved copy brings its code along: after a deploy renames every built
 *   file, the worker fetches the new versions of the ones you use before the
 *   next new tab needs them, so the first tab after a deploy is instant too.
 *
 * The server says what may be saved (x-tabz-offline): "1" save, "keep" leave
 * the current copy alone (the vault is unlocked, so this render shows it),
 * "clear" forget it (signed out). x-tabz-viewer identifies the account, so a
 * copy from someone else is replaced and the page reloads.
 */

const PAGES = "tabz-pages-v1";
const ASSETS = "tabz-assets-v1";
const ICONS = "tabz-icons-v1";
const READS = "tabz-reads-v1";
const MAX_READS = 150;
const MAX_ASSETS = 400;
const MAX_ICONS = 800;
const HOME = "/";
const REFRESH_EVERY = 30_000;
let lastRefresh = 0;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys())
				if (![PAGES, ASSETS, ICONS, READS].includes(key))
					await caches.delete(key);
			await self.clients.claim();
		})(),
	);
});

/**
 * Saves a fresh render of the home page; returns true if the account changed.
 * `extend` keeps the worker alive while the copy's code downloads.
 */
async function remember(response, previous, extend) {
	const mode = response.headers.get("x-tabz-offline");
	const cache = await caches.open(PAGES);
	if (mode === "clear") {
		await cache.delete(HOME);
		return Boolean(previous);
	}
	const changed =
		Boolean(previous) &&
		previous.headers.get("x-tabz-viewer") !==
			response.headers.get("x-tabz-viewer");
	const html = (response.headers.get("content-type") || "").includes("text/html");
	if (mode === "1" && response.ok && !response.redirected && html) {
		const page = await response.clone().text();
		await cache.put(HOME, response);
		extend(warm(page));
	} else if (changed) await cache.delete(HOME);
	return changed;
}

/** "/assets/hacker-news-DYkgA_ia.js" → "hacker-news.js": stays put across deploys. */
const baseName = (path) =>
	path.replace(/^.*\//, "").replace(/-[\w-]{8}(\.\w+)$/, "$1");
const IN_PAGE = /\/assets\/[\w.-]+\.(?:js|css|woff2)/g;
// Chunks name the others they load: "assets/x-hash.js" (on demand) and
// "./x-hash.js" (imported directly).
const IN_CODE = /(?:assets\/|\.\/)[\w.-]+\.(?:js|css)/g;

/**
 * Caches the code a saved page needs: everything it names, plus the chunks it
 * loads later (widgets, dialogs, …) that you've used before. Those are found
 * by following each chunk's references, matched by name without the hash.
 */
async function warm(page) {
	const cache = await caches.open(ASSETS);
	const used = new Set(
		(await cache.keys()).map((request) => baseName(new URL(request.url).pathname)),
	);
	const seen = new Set();
	const queue = [...new Set(page.match(IN_PAGE) ?? [])];
	while (queue.length) {
		await Promise.all(
			queue.splice(0, 8).map(async (path) => {
				if (seen.has(path)) return;
				seen.add(path);
				let response = await cache.match(path);
				if (!response) {
					response = await fetch(path).catch(() => null);
					if (!response?.ok) return;
					await cache.put(path, response.clone());
				}
				if (!path.endsWith(".js")) return;
				for (const found of (await response.text()).match(IN_CODE) ?? []) {
					const next = `/assets/${found.replace(/^(assets\/|\.\/)/, "")}`;
					if (!seen.has(next) && used.has(baseName(next))) queue.push(next);
				}
			}),
		);
	}
	const keys = await cache.keys();
	for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)))
		await cache.delete(key);
}

/*
 * Pages served from the saved copy ask, once they're running, whether that
 * copy turned out to be someone else's. (A message pushed earlier could
 * arrive before the page is listening.) Keyed by the new page's client id.
 */
const checks = new Map();

async function home(event) {
	const url = new URL(event.request.url);
	const cache = await caches.open(PAGES);
	const cached = await cache.match(HOME);
	const launch = url.searchParams.has("launch");
	const network = fetch(event.request);
	const update = network
		.then((response) =>
			remember(response.clone(), cached, (work) => event.waitUntil(work)),
		)
		.catch(() => false);
	event.waitUntil(update);
	if (cached && launch) {
		const id = event.resultingClientId;
		if (id) {
			checks.set(id, update);
			setTimeout(() => checks.delete(id), 60_000);
		}
		return cached;
	}
	try {
		return await network;
	} catch (error) {
		if (cached) return cached;
		throw error;
	}
}

/** Cache-first with a size cap: built files and site icons. */
async function cached(event, name = ASSETS, max = MAX_ASSETS) {
	const cache = await caches.open(name);
	const hit = await cache.match(event.request);
	if (hit) return hit;
	const response = await fetch(event.request);
	if (response.ok && response.type === "basic") {
		const copy = response.clone();
		event.waitUntil(
			(async () => {
				await cache.put(event.request, copy);
				const keys = await cache.keys();
				for (const key of keys.slice(0, Math.max(0, keys.length - max)))
					await cache.delete(key);
			})(),
		);
	}
	return response;
}

/**
 * Reader pages (/read, /read/<id>): network first, keeping a copy of each
 * article you open so it reads offline. Sign-in redirects are never kept.
 */
async function reading(event) {
	const cache = await caches.open(READS);
	const key = new URL(event.request.url);
	key.search = "";
	try {
		const response = await fetch(event.request);
		const html = (response.headers.get("content-type") || "").includes(
			"text/html",
		);
		if (response.ok && !response.redirected && html) {
			const copy = response.clone();
			event.waitUntil(
				(async () => {
					await cache.put(key.toString(), copy);
					const keys = await cache.keys();
					for (const old of keys.slice(0, Math.max(0, keys.length - MAX_READS)))
						await cache.delete(old);
				})(),
			);
		}
		return response;
	} catch (error) {
		const hit = await cache.match(key.toString());
		if (hit) return hit;
		throw error;
	}
}

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (request.mode === "navigate" && url.pathname === HOME)
		event.respondWith(home(event));
	else if (
		request.mode === "navigate" &&
		(url.pathname === "/read" || url.pathname.startsWith("/read/"))
	)
		event.respondWith(reading(event));
	else if (url.pathname.startsWith("/assets/")) event.respondWith(cached(event));
	// Site icons, so tiles keep their icons on an offline new tab.
	else if (url.pathname === "/api/icon")
		event.respondWith(cached(event, ICONS, MAX_ICONS));
});

/** Pages ask for a refresh when you leave them, so the next new tab is current. */
async function refresh() {
	if (Date.now() - lastRefresh < REFRESH_EVERY) return;
	lastRefresh = Date.now();
	const cache = await caches.open(PAGES);
	const previous = await cache.match(HOME);
	try {
		const response = await fetch(HOME, {
			credentials: "same-origin",
			headers: { accept: "text/html" },
		});
		let warming;
		await remember(response, previous, (work) => {
			warming = work;
		});
		await warming;
	} catch {
		// Offline: keep the copy we have.
	}
}

self.addEventListener("message", (event) => {
	const type = event.data && event.data.type;
	if (type === "tabz:refresh") event.waitUntil(refresh());
	if (type === "tabz:forget")
		event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(READS)]));
	if (type === "tabz:check" && event.source) {
		const pending = checks.get(event.source.id);
		if (pending)
			event.waitUntil(
				pending.then((changed) => {
					checks.delete(event.source.id);
					if (changed) event.source.postMessage({ type: "tabz:reload" });
				}),
			);
	}
});

import { api, getBaseUrl, getToken } from "./config.js";

const OFFICIAL = new Set(["https://tabz.space", "https://www.tabz.space"]);

/* ----------------------------- saving pages ----------------------------- */

/** The detailed add flow: the /add page in a small window (uses the site session). */
async function openAdd(url, title) {
	if (!/^https?:/i.test(url ?? "")) return;
	const base = await getBaseUrl();
	const params = new URLSearchParams({ url, title: title ?? "", popup: "1" });
	await chrome.windows.create({
		url: `${base}/add?${params}`,
		type: "popup",
		width: 460,
		height: 680,
	});
}

chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: "tabz-page",
		title: "Add page to tabz",
		contexts: ["page"],
	});
	chrome.contextMenus.create({
		id: "tabz-link",
		title: "Add link to tabz",
		contexts: ["link"],
	});
	chrome.contextMenus.create({
		id: "tabz-tabs",
		title: "Save all tabs to tabz",
		contexts: ["action"],
	});
	scheduleSync();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === "tabz-link")
		openAdd(info.linkUrl, info.selectionText);
	else if (info.menuItemId === "tabz-tabs")
		saveWindowTabs({ windowId: tab?.windowId });
	else openAdd(tab?.url, tab?.title);
});

const isWebUrl = (url) => typeof url === "string" && /^https?:\/\//i.test(url);

/** Saves a window's tabs as a new group, optionally closing them (OneTab-style). */
async function saveWindowTabs({ windowId, close = false } = {}) {
	const base = await getBaseUrl();
	const tabs = (
		await chrome.tabs.query(windowId ? { windowId } : { currentWindow: true })
	).filter((tab) => isWebUrl(tab.url) && !tab.url.startsWith(base));
	if (tabs.length === 0) return { saved: 0 };
	const when = new Date().toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
	const result = await api("/tabs", {
		method: "POST",
		body: {
			name: `Tabs · ${when}`,
			tabs: tabs.map((tab) => ({ url: tab.url, title: tab.title })),
		},
	});
	if (close) {
		await chrome.tabs.create({ url: base, windowId: tabs[0].windowId });
		await chrome.tabs.remove(
			tabs.filter((tab) => !tab.pinned).map((tab) => tab.id),
		);
	}
	return result;
}

/* --------------------------- browser bookmark sync --------------------------- */

/** Flattens the bookmark tree into folders with their direct links. */
function flatten(nodes, path = [], out = []) {
	for (const node of nodes) {
		if (node.children) {
			const here = node.title ? [...path, node.title] : path;
			const links = node.children
				.filter((child) => child.url && isWebUrl(child.url))
				.map((child) => ({ title: child.title || child.url, url: child.url }));
			if (links.length)
				out.push({
					path: here.join(" / ") || "Bookmarks",
					segments: here.length ? here : ["Bookmarks"],
					links,
				});
			flatten(
				node.children.filter((child) => child.children),
				here,
				out,
			);
		}
	}
	return out;
}

async function syncBookmarks() {
	const { syncBookmarks: enabled } =
		await chrome.storage.sync.get("syncBookmarks");
	if (!enabled || !(await getToken())) return null;
	const folders = flatten(await chrome.bookmarks.getTree()).slice(0, 500);
	const result = await api("/sync/browser", {
		method: "PUT",
		body: { folders },
	});
	await chrome.storage.local.set({
		lastSync: result.syncedAt,
		lastSyncCount: result.links,
	});
	return result;
}

let syncTimer;
function scheduleSync(delay = 4000) {
	clearTimeout(syncTimer);
	syncTimer = setTimeout(() => syncBookmarks().catch(() => {}), delay);
}

for (const event of [
	"onCreated",
	"onRemoved",
	"onChanged",
	"onMoved",
	"onChildrenReordered",
]) {
	chrome.bookmarks?.[event]?.addListener(() => scheduleSync());
}
chrome.runtime.onStartup.addListener(() => scheduleSync(10_000));

/* ------------------------------ private windows ------------------------------ */

/** Opens URLs as tabs in an existing incognito window, or a new one. */
/**
 * The browser's page for this extension, where "Allow in Incognito" lives.
 * Web pages can't open chrome:// URLs, but the extension can. Firefox keeps
 * the switch in about:addons, which extensions can't open.
 */
async function openExtensionSettings() {
	if (navigator.userAgent.includes("Firefox")) return false;
	await chrome.tabs.create({
		url: `chrome://extensions/?id=${chrome.runtime.id}`,
	});
	return true;
}

async function openIncognito(urls) {
	const safe = (Array.isArray(urls) ? urls : []).filter(isWebUrl).slice(0, 50);
	if (safe.length === 0 || !(await chrome.extension.isAllowedIncognitoAccess()))
		return false;
	const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
	const existing = windows.find((win) => win.incognito);
	if (existing?.id !== undefined) {
		for (const url of safe)
			await chrome.tabs.create({ windowId: existing.id, url });
		await chrome.windows.update(existing.id, { focused: true });
	} else {
		await chrome.windows.create({ url: safe, incognito: true, focused: true });
	}
	return true;
}

/** Opens a group's links as tabs in a new normal window. */
async function openTabs(urls) {
	const safe = (Array.isArray(urls) ? urls : []).filter(isWebUrl).slice(0, 50);
	if (safe.length === 0) return false;
	await chrome.windows.create({ url: safe, focused: true });
	return true;
}

/* -------------------------------- messaging -------------------------------- */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	// Only accept requests from our own content script and popup.
	if (sender.id !== chrome.runtime.id) return false;
	const reply = (promise) => {
		promise.then(sendResponse, (error) =>
			sendResponse({ ok: false, error: String(error?.message ?? error) }),
		);
		return true;
	};
	switch (message?.type) {
		case "status":
			return reply(
				(async () => ({
					installed: true,
					incognitoAllowed: await chrome.extension.isAllowedIncognitoAccess(),
					hasToken: Boolean(await getToken()),
					baseUrl: await getBaseUrl(),
					version: chrome.runtime.getManifest().version,
				}))(),
			);
		case "set-token":
			// Sent by the bridge on tabz.space after the signed-in page minted a token.
			return reply(
				(async () => {
					if (
						typeof message.token !== "string" ||
						!message.token.startsWith("tabz_")
					)
						return { ok: false };
					// Only the server you've pointed the extension at (options page),
					// or tabz.space itself, can connect it. Otherwise any page on
					// localhost could redirect your bookmark sync to itself.
					const origin = String(message.baseUrl ?? "").replace(/\/+$/, "");
					if (origin !== (await getBaseUrl()) && !OFFICIAL.has(origin))
						return { ok: false };
					await chrome.storage.local.set({ token: message.token });
					await chrome.storage.sync.set({ baseUrl: origin });
					scheduleSync(1000);
					return { ok: true };
				})(),
			);
		case "open-incognito":
			return reply(openIncognito(message.urls).then((ok) => ({ ok })));
		case "open-tabs":
			return reply(openTabs(message.urls).then((ok) => ({ ok })));
		case "open-settings":
			return reply(openExtensionSettings().then((ok) => ({ ok })));
		case "save-page":
			return reply(
				api("/bookmarks", {
					method: "POST",
					body: {
						url: message.url,
						title: message.title,
						group: message.group,
					},
				}).then((bookmark) => ({ ok: true, bookmark })),
			);
		case "open-add":
			return reply(
				openAdd(message.url, message.title).then(() => ({ ok: true })),
			);
		case "save-tabs":
			return reply(
				saveWindowTabs({
					windowId: message.windowId,
					close: message.close,
				}).then((result) => ({ ok: true, ...result })),
			);
		case "sync-now":
			return reply(syncBookmarks().then((result) => ({ ok: true, ...result })));
		default:
			return false;
	}
});

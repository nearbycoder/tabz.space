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
		id: "tabz-read-later",
		title: "Read later in tabz",
		contexts: ["page", "link"],
	});
	chrome.contextMenus.create({
		id: "tabz-tabs",
		title: "Save all tabs to tabz",
		contexts: ["action"],
	});
	scheduleSync();
	scheduleArchive();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === "tabz-link")
		openAdd(info.linkUrl, info.selectionText);
	else if (info.menuItemId === "tabz-read-later")
		readLater(info.linkUrl ?? tab?.url, info.linkUrl ? undefined : tab?.title)
			.then(() => badge("✓"))
			.catch(() => badge("!"));
	else if (info.menuItemId === "tabz-tabs")
		saveWindowTabs({ windowId: tab?.windowId });
	else openAdd(tab?.url, tab?.title);
});

const isWebUrl = (url) => typeof url === "string" && /^https?:\/\//i.test(url);

/** A brief mark on the toolbar icon (context-menu actions have no popup). */
function badge(text) {
	chrome.action.setBadgeText({ text });
	setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
}

/** Saves a page to "Read later"; tabz keeps a clean reader copy for offline. */
function readLater(url, title) {
	if (!isWebUrl(url)) return Promise.reject(new Error("Not a web page"));
	return api("/read-later", { method: "POST", body: { url, title } });
}

const stamp = () =>
	new Date().toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});

/**
 * Saves a window's tabs as a new group, optionally closing them (OneTab-style).
 * A named session goes to the "Sessions" board (made on first use); restore it
 * with the group's "Open all as tabs".
 */
async function saveWindowTabs({ windowId, close = false, session } = {}) {
	const base = await getBaseUrl();
	const tabs = (
		await chrome.tabs.query(windowId ? { windowId } : { currentWindow: true })
	).filter((tab) => isWebUrl(tab.url) && !tab.url.startsWith(base));
	if (tabs.length === 0) return { saved: 0 };
	const name = typeof session === "string" ? session.trim().slice(0, 60) : "";
	const result = await api("/tabs", {
		method: "POST",
		body: {
			name: name || `Tabs · ${stamp()}`,
			...(name ? { board: "Sessions", createBoard: true } : {}),
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

/* ------------------------------ idle tab archive ------------------------------ */

const DAY = 86_400_000;

/** Tabs you haven't looked at in `days` (never pinned, playing, or the one in view). */
async function idleTabs(days = 3) {
	const base = await getBaseUrl();
	const cutoff = Date.now() - (Number(days) || 3) * DAY;
	return (await chrome.tabs.query({ windowType: "normal" })).filter(
		(tab) =>
			isWebUrl(tab.url) &&
			!tab.url.startsWith(base) &&
			!tab.pinned &&
			!tab.active &&
			!tab.audible &&
			!tab.incognito &&
			typeof tab.lastAccessed === "number" &&
			tab.lastAccessed < cutoff,
	);
}

/** Saves idle tabs to the "Archived tabs" board, then closes them. */
async function archiveIdleTabs(days = 3) {
	const tabs = (await idleTabs(days)).slice(0, 200);
	if (tabs.length === 0) return { saved: 0 };
	const result = await api("/tabs", {
		method: "POST",
		body: {
			name: `Idle tabs · ${stamp()}`,
			board: "Archived tabs",
			createBoard: true,
			tabs: tabs.map((tab) => ({ url: tab.url, title: tab.title })),
		},
	});
	await chrome.tabs.remove(tabs.map((tab) => tab.id));
	return result;
}

/* Optional: archive idle tabs once a day (options page). */
chrome.alarms?.onAlarm.addListener(async (alarm) => {
	if (alarm.name !== "archive-idle") return;
	const { autoArchive } = await chrome.storage.sync.get("autoArchive");
	if (autoArchive && (await getToken()))
		await archiveIdleTabs(Number(autoArchive) || 3).catch(() => {});
});

async function scheduleArchive() {
	if (!chrome.alarms) return;
	const { autoArchive } = await chrome.storage.sync.get("autoArchive");
	if (autoArchive)
		await chrome.alarms.create("archive-idle", {
			delayInMinutes: 30,
			periodInMinutes: 24 * 60,
		});
	else await chrome.alarms.clear("archive-idle");
}
chrome.storage.onChanged.addListener((changes) => {
	if (changes.autoArchive) scheduleArchive();
});

/* --------------------------- browser bookmark sync --------------------------- */

/*
 * Two-way: the browser's bookmarks (with their ids) go up as a snapshot;
 * edits made in tabz to the "Browser bookmarks" board come back down as
 * operations, applied here before the next snapshot is sent.
 */

/** Flattens the bookmark tree into folders with their direct links. */
function flatten(nodes, path = [], ids = [], out = []) {
	for (const node of nodes) {
		if (node.children) {
			const here = node.title ? [...path, node.title] : path;
			const hereIds = node.title ? [...ids, node.id] : ids;
			const links = node.children
				.filter((child) => child.url && isWebUrl(child.url))
				.map((child) => ({
					id: child.id,
					title: child.title || child.url,
					url: child.url,
				}));
			if (links.length)
				out.push({
					path: here.join(" / ") || "Bookmarks",
					segments: here.length ? here : ["Bookmarks"],
					segmentIds: here.length ? hereIds : [],
					links,
				});
			flatten(
				node.children.filter((child) => child.children),
				here,
				hereIds,
				out,
			);
		}
	}
	return out;
}

/** Same page, ignoring what tabz tidies up (trailing slash, www, case of the host). */
function sameUrl(a, b) {
	const key = (value) => {
		try {
			const url = new URL(value);
			return `${url.host.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${url.search}`;
		} catch {
			return value;
		}
	};
	return Boolean(a && b) && key(a) === key(b);
}

/** Applies edits made in tabz to the browser's bookmarks; returns how many. */
async function applyRemoteOps() {
	const { ops } = await api("/sync/browser/ops");
	if (!ops?.length) return 0;
	const made = new Map();
	const parentOf = (op) => op.parentId ?? made.get(op.parentRef);
	const done = [];
	for (const { id, op } of ops) {
		try {
			if (op.type === "update") {
				const changes = {};
				if (typeof op.title === "string") changes.title = op.title;
				if (isWebUrl(op.url)) changes.url = op.url;
				await chrome.bookmarks.update(op.browserId, changes);
			} else if (op.type === "remove") {
				const [node] = await chrome.bookmarks.get(op.browserId).catch(() => []);
				// Only the bookmark tabz knew about: same link, or a folder.
				if (node && (op.url ? sameUrl(node.url, op.url) : !node.url)) {
					if (op.tree) await chrome.bookmarks.removeTree(node.id);
					else await chrome.bookmarks.remove(node.id);
				}
			} else if (op.type === "move") {
				const parentId = parentOf(op);
				if (parentId) await chrome.bookmarks.move(op.browserId, { parentId });
			} else if (op.type === "create" || op.type === "folder") {
				const parentId = parentOf(op);
				if (parentId && (op.type === "folder" || isWebUrl(op.url))) {
					const node = await chrome.bookmarks.create({
						parentId,
						title: String(op.title ?? "").slice(0, 200),
						...(op.type === "create" ? { url: op.url } : {}),
					});
					made.set(op.bookmarkId, node.id);
				}
			}
		} catch {
			// Already gone or changed in the browser: the snapshot settles it.
		}
		done.push(id);
	}
	await api("/sync/browser/ops/ack", { method: "POST", body: { ids: done } });
	return done.length;
}

let syncing = null;

function syncBookmarks() {
	syncing ??= (async () => {
		try {
			const { syncBookmarks: enabled } =
				await chrome.storage.sync.get("syncBookmarks");
			if (!enabled || !(await getToken())) return null;
			let result;
			for (let attempt = 0; attempt < 3; attempt++) {
				await applyRemoteOps();
				const folders = flatten(await chrome.bookmarks.getTree()).slice(0, 500);
				result = await api("/sync/browser", {
					method: "PUT",
					body: { folders },
				});
				// tabz had new edits waiting: apply those, then try again.
				if (!result.deferred) break;
			}
			if (!result.deferred)
				await chrome.storage.local.set({
					lastSync: result.syncedAt,
					lastSyncCount: result.links,
				});
			return result;
		} finally {
			syncing = null;
		}
	})();
	return syncing;
}

/** Checks for edits made in tabz now and then (cheap when there are none). */
async function pullRemoteOps() {
	const { syncBookmarks: enabled } =
		await chrome.storage.sync.get("syncBookmarks");
	if (!enabled || !(await getToken()) || syncing) return;
	const { ops } = await api("/sync/browser/ops").catch(() => ({ ops: [] }));
	if (ops?.length) await syncBookmarks();
}
chrome.alarms?.create("browser-ops", { periodInMinutes: 1 });
chrome.alarms?.onAlarm.addListener((alarm) => {
	if (alarm.name === "browser-ops") pullRemoteOps().catch(() => {});
});

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

/* -------------------------------- focus mode -------------------------------- */

/*
 * During focus time (your schedule, or a session started on tabz), sites on
 * your block list open tabz's /focus page instead, which offers "5 more
 * minutes". Settings come from the tabz page (live) and the API (every 15 min).
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SNOOZE_MS = 5 * 60_000;
const HOST = /^[a-z0-9.-]+\.[a-z]{2,}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Keeps only well-formed focus settings (they come from a web page). */
function cleanFocus(focus) {
	if (!focus || typeof focus !== "object") return null;
	return {
		enabled: focus.enabled === true,
		days: Array.isArray(focus.days)
			? focus.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
			: [],
		from: TIME.test(focus.from) ? focus.from : "09:00",
		to: TIME.test(focus.to) ? focus.to : "17:00",
		sites: Array.isArray(focus.sites)
			? focus.sites
					.filter((site) => typeof site === "string" && HOST.test(site))
					.slice(0, 100)
			: [],
		until: Number.isFinite(focus.until) ? focus.until : null,
	};
}

function localNow(now, zone) {
	let format;
	try {
		format = new Intl.DateTimeFormat("en-US", {
			timeZone: zone || undefined,
			weekday: "short",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		});
	} catch {
		format = new Intl.DateTimeFormat("en-US", {
			weekday: "short",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		});
	}
	const parts = format.formatToParts(now);
	const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
	return {
		day: WEEKDAYS.indexOf(get("weekday")),
		minutes: Number(get("hour")) * 60 + Number(get("minute")),
	};
}

const toMinutes = (time) => {
	const [h, m] = time.split(":").map(Number);
	return h * 60 + m;
};

/** Same rules as tabz's own (src/lib/schedule.ts). */
function focusing(focus, zone, now = Date.now()) {
	if (!focus) return false;
	if (focus.until && focus.until > now) return true;
	if (!focus.enabled || focus.days.length === 0) return false;
	const { day, minutes } = localNow(now, zone);
	const from = toMinutes(focus.from);
	const to = toMinutes(focus.to);
	if (from === to) return focus.days.includes(day);
	if (from < to)
		return focus.days.includes(day) && minutes >= from && minutes < to;
	return (
		(focus.days.includes(day) && minutes >= from) ||
		(focus.days.includes((day + 6) % 7) && minutes < to)
	);
}

/** The block-list entry covering a URL (the site itself or a subdomain). */
function blockedSite(url, sites) {
	let host;
	try {
		host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return null;
	}
	return (
		sites.find((site) => host === site || host.endsWith(`.${site}`)) ?? null
	);
}

async function storeFocus(focus, timeZone) {
	const clean = cleanFocus(focus);
	if (!clean) return;
	await chrome.storage.local.set({
		focus: clean,
		focusZone: typeof timeZone === "string" ? timeZone.slice(0, 64) : null,
	});
}

async function refreshFocus() {
	if (!(await getToken())) return;
	const result = await api("/focus").catch(() => null);
	if (result?.focus) await storeFocus(result.focus, result.timeZone);
}

chrome.alarms?.create("focus-refresh", { periodInMinutes: 15 });
chrome.alarms?.onAlarm.addListener((alarm) => {
	if (alarm.name === "focus-refresh") refreshFocus();
});
chrome.runtime.onStartup.addListener(() => refreshFocus());

chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
	const url = change.url;
	if (!url || !isWebUrl(url) || tab.incognito) return;
	const { focus, focusZone } = await chrome.storage.local.get([
		"focus",
		"focusZone",
	]);
	if (!focus?.sites?.length || !focusing(focus, focusZone)) return;
	const site = blockedSite(url, focus.sites);
	if (!site) return;
	const snoozes = (await chrome.storage.session.get("snoozes")).snoozes ?? {};
	if ((snoozes[site] ?? 0) > Date.now()) return;
	const base = await getBaseUrl();
	await chrome.tabs.update(tabId, {
		url: `${base}/focus?${new URLSearchParams({ site, from: url })}`,
	});
});

/** "5 more minutes" on the /focus page: let the site through, then go back. */
async function snoozeFocus(urls, tabId) {
	const url = Array.isArray(urls) ? urls[0] : null;
	if (!isWebUrl(url) || tabId === undefined) return false;
	const { focus } = await chrome.storage.local.get("focus");
	const site = blockedSite(url, focus?.sites ?? []);
	if (!site) return false;
	const snoozes = (await chrome.storage.session.get("snoozes")).snoozes ?? {};
	snoozes[site] = Date.now() + SNOOZE_MS;
	await chrome.storage.session.set({ snoozes });
	await chrome.tabs.update(tabId, { url });
	return true;
}

/* ------------------------------- address bar ------------------------------- */

/*
 * Type "t", a space, then a few words in the address bar: your matching links
 * appear as suggestions. Enter on free text opens tabz with ⌘K prefilled.
 */
const escapeXml = (text) =>
	String(text).replace(
		/[<>&"']/g,
		(char) =>
			({
				"<": "&lt;",
				">": "&gt;",
				"&": "&amp;",
				'"': "&quot;",
				"'": "&apos;",
			})[char],
	);

/** Recent suggestions, so picking one knows whether it's a private link. */
const suggested = new Map();
let omniboxRequest = 0;

chrome.omnibox?.setDefaultSuggestion({
	description: "Search your tabz for <match>%s</match>",
});

chrome.omnibox?.onInputChanged.addListener(async (text, suggest) => {
	const query = text.trim();
	if (query.length < 2 || !(await getToken())) return;
	const request = ++omniboxRequest;
	try {
		const results = await api(
			`/bookmarks?${new URLSearchParams({ q: query, limit: "8" })}`,
		);
		if (request !== omniboxRequest) return;
		suggested.clear();
		const items = results.filter((item) => isWebUrl(item.url)).slice(0, 8);
		for (const item of items) suggested.set(item.url, item);
		suggest(
			items.map((item) => ({
				content: item.url,
				description: `${escapeXml(item.title)}${item.private ? " 🕶" : ""} <dim>· ${escapeXml(
					[item.board, item.group, item.folder].filter(Boolean).join(" / "),
				)}</dim> <url>${escapeXml(item.url)}</url>`,
			})),
		);
	} catch {
		// Offline or signed out: no suggestions.
	}
});

chrome.omnibox?.onInputEntered.addListener(async (text, disposition) => {
	const base = await getBaseUrl();
	const picked = suggested.get(text);
	if (picked?.private && (await openIncognito([picked.url]))) return;
	// A private link never opens in a normal tab: without incognito access,
	// show it in tabz instead, which explains how to allow it.
	const url = picked?.private
		? `${base}/?${new URLSearchParams({ q: picked.title })}`
		: isWebUrl(text)
			? text
			: `${base}/?${new URLSearchParams({ q: text.trim() })}`;
	if (disposition === "currentTab") await chrome.tabs.update({ url });
	else
		await chrome.tabs.create({
			url,
			active: disposition === "newForegroundTab",
		});
});

/* ------------------------------ history search ----------------------------- */

// Optional: asked for from the options page, so updating the extension never
// shows a new permission warning or disables it.
const HISTORY = { permissions: ["history"] };
const hasHistory = () =>
	chrome.permissions.contains(HISTORY).catch(() => false);

/** Only tabz itself may read history: the bridge also runs on any localhost page. */
async function fromTabz(sender) {
	const url = sender.origin ?? sender.url ?? "";
	let origin;
	try {
		origin = new URL(url).origin;
	} catch {
		return false;
	}
	return origin === (await getBaseUrl()) || OFFICIAL.has(origin);
}

/**
 * Pages from your browser history matching `text`, best first: often and
 * recently visited, and addresses you typed, rank higher. Results go straight
 * to the tabz page in this browser; they're never sent to the server. Not in
 * incognito windows, and never tabz's own pages.
 */
async function searchHistory(text, sender) {
	const query = String(text ?? "")
		.trim()
		.slice(0, 200);
	if (!query || sender.tab?.incognito) return [];
	if (!(await fromTabz(sender)) || !(await hasHistory())) return [];
	const [items, base] = await Promise.all([
		chrome.history.search({ text: query, startTime: 0, maxResults: 100 }),
		getBaseUrl(),
	]);
	const now = Date.now();
	return items
		.filter(
			(item) =>
				/^https?:\/\//i.test(item.url ?? "") &&
				!item.url.startsWith(base) &&
				![...OFFICIAL].some((origin) => item.url.startsWith(origin)),
		)
		.map((item) => {
			const weeks = (now - (item.lastVisitTime ?? 0)) / 604_800_000;
			const visits = Math.min(item.visitCount ?? 0, 100);
			return {
				url: item.url,
				title: (item.title ?? "").slice(0, 300),
				lastVisit: item.lastVisitTime ?? 0,
				score: ((item.typedCount ?? 0) * 3 + visits + 1) / (1 + weeks),
			};
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, 12)
		.map(({ score, ...item }) => item);
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
					historyAllowed: await hasHistory(),
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
					refreshFocus();
					return { ok: true };
				})(),
			);
		case "open-incognito":
			return reply(openIncognito(message.urls).then((ok) => ({ ok })));
		case "open-tabs":
			return reply(openTabs(message.urls).then((ok) => ({ ok })));
		case "open-settings":
			return reply(openExtensionSettings().then((ok) => ({ ok })));
		case "history-search":
			return reply(
				searchHistory(message.text, sender).then((items) => ({
					ok: true,
					items,
				})),
			);
		case "history-settings":
			return reply(
				chrome.tabs
					.create({ url: chrome.runtime.getURL("options.html#history") })
					.then(() => ({ ok: true })),
			);
		case "focus-settings":
			return reply(
				storeFocus(message.focus, message.timeZone).then(() => ({ ok: true })),
			);
		case "focus-snooze":
			return reply(
				snoozeFocus(message.urls, sender.tab?.id).then((ok) => ({ ok })),
			);
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
		case "read-later":
			return reply(
				readLater(message.url, message.title).then((bookmark) => ({
					ok: true,
					bookmark,
				})),
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
					session: message.session,
				}).then((result) => ({ ok: true, ...result })),
			);
		case "idle-count":
			return reply(
				idleTabs(message.days).then((tabs) => ({
					ok: true,
					count: tabs.length,
				})),
			);
		case "archive-idle":
			return reply(
				archiveIdleTabs(message.days).then((result) => ({
					ok: true,
					...result,
				})),
			);
		case "pull-ops":
			return reply(pullRemoteOps().then(() => ({ ok: true })));
		case "sync-now":
			return reply(syncBookmarks().then((result) => ({ ok: true, ...result })));
		default:
			return false;
	}
});

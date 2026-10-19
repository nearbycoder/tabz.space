import { getBaseUrl } from "./config.js";

// The add flow is just the /add page in a small window, so it reuses the
// user's existing tabz session — no tokens to manage.
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

chrome.action.onClicked.addListener((tab) => openAdd(tab.url, tab.title));

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
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === "tabz-link")
		openAdd(info.linkUrl, info.selectionText);
	else openAdd(tab?.url, tab?.title);
});

const isWebUrl = (url) => typeof url === "string" && /^https?:\/\//i.test(url);

/** Opens URLs as tabs in an existing incognito window, or a new one. */
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	// Only accept requests relayed by our own content script.
	if (sender.id !== chrome.runtime.id) return false;
	if (message?.type === "status") {
		chrome.extension.isAllowedIncognitoAccess().then((incognitoAllowed) =>
			sendResponse({
				installed: true,
				incognitoAllowed,
				version: chrome.runtime.getManifest().version,
			}),
		);
		return true;
	}
	if (message?.type === "open-incognito") {
		openIncognito(message.urls)
			.then((ok) => sendResponse({ ok }))
			.catch(() => sendResponse({ ok: false }));
		return true;
	}
	return false;
});

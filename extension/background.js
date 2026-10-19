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

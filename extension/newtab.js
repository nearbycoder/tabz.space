import { getBaseUrl } from "./config.js";

const [{ newTab = true, focusPage = true }, { look }] = await Promise.all([
	chrome.storage.sync.get(["newTab", "focusPage"]),
	chrome.storage.local.get("look"),
]);
// Keep a synchronous copy for look.js, which paints before this module runs.
if (look) localStorage.setItem("tabz-look", JSON.stringify(look));

/** Resolves when the tab has finished loading, or after `ms` regardless. */
function loaded(tabId, ms) {
	return new Promise((resolve) => {
		const done = () => {
			chrome.tabs.onUpdated.removeListener(listener);
			clearTimeout(timer);
			resolve();
		};
		const listener = (id, info) => {
			if (id === tabId && info.status === "complete") done();
		};
		const timer = setTimeout(done, ms);
		chrome.tabs.onUpdated.addListener(listener);
		chrome.tabs
			.get(tabId)
			.then((tab) => tab.status === "complete" && done())
			.catch(done);
	});
}

if (!newTab) {
	// Fall back to the browser's default new tab page.
	chrome.tabs.update({ url: "chrome://new-tab-page" });
} else {
	// "?launch" lets tabz answer instantly from its saved copy (offline too).
	const url = `${await getBaseUrl()}/?launch=newtab`;
	const tab = focusPage ? await chrome.tabs.getCurrent() : null;
	if (tab?.id !== undefined) {
		// On a new-tab page the browser keeps the cursor in the address bar; a
		// regular tab gives it to the page, so tabz's search box can take it.
		// Load tabz in a hidden tab next to this one and only switch once it's
		// drawn: no blank, unstyled tab in between. This page shows tabz's
		// background meanwhile (look.js).
		const opened = await chrome.tabs.create({
			url,
			index: tab.index + 1,
			windowId: tab.windowId,
			active: false,
		});
		if (
			typeof tab.groupId === "number" &&
			tab.groupId >= 0 &&
			chrome.tabs.group
		)
			await chrome.tabs
				.group({ groupId: tab.groupId, tabIds: opened.id })
				.catch(() => {});
		await loaded(opened.id, 1200);
		await chrome.tabs.update(opened.id, { active: true });
		await chrome.tabs.remove(tab.id);
	} else {
		location.replace(url);
	}
}

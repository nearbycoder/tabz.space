import { getBaseUrl } from "./config.js";

const { newTab = true, focusPage = true } = await chrome.storage.sync.get([
	"newTab",
	"focusPage",
]);

if (!newTab) {
	// Fall back to the browser's default new tab page.
	chrome.tabs.update({ url: "chrome://new-tab-page" });
} else {
	// "?launch" lets tabz answer instantly from its saved copy (offline too).
	const url = `${await getBaseUrl()}/?launch=newtab`;
	const tab = focusPage ? await chrome.tabs.getCurrent() : null;
	if (tab?.id !== undefined) {
		// On a new-tab page the browser keeps the cursor in the address bar. A
		// regular tab gives it to the page, so tabz's search box can take it:
		// open tabz in its place and close this one.
		const opened = await chrome.tabs.create({
			url,
			index: tab.index,
			windowId: tab.windowId,
			active: true,
		});
		if (
			typeof tab.groupId === "number" &&
			tab.groupId >= 0 &&
			chrome.tabs.group
		)
			await chrome.tabs
				.group({ groupId: tab.groupId, tabIds: opened.id })
				.catch(() => {});
		await chrome.tabs.remove(tab.id);
	} else {
		location.replace(url);
	}
}

import { getBaseUrl } from "./config.js";

const { newTab = true } = await chrome.storage.sync.get("newTab");
if (newTab) {
	location.replace(await getBaseUrl());
} else {
	// Fall back to the browser's default new tab page.
	chrome.tabs.update({ url: "chrome://new-tab-page" });
}

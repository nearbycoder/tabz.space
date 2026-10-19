import { DEFAULT_BASE_URL } from "./config.js";

const baseUrl = document.getElementById("baseUrl");
const newTab = document.getElementById("newTab");
const status = document.getElementById("status");

const stored = await chrome.storage.sync.get(["baseUrl", "newTab"]);
baseUrl.value = stored.baseUrl || DEFAULT_BASE_URL;
newTab.checked = stored.newTab ?? true;

document.getElementById("save").addEventListener("click", async () => {
	await chrome.storage.sync.set({
		baseUrl: baseUrl.value.trim(),
		newTab: newTab.checked,
	});
	status.textContent = " Saved";
	setTimeout(() => {
		status.textContent = "";
	}, 1500);
});

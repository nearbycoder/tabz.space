import { DEFAULT_BASE_URL, getToken } from "./config.js";

const $ = (id) => document.getElementById(id);
const flash = (text) => {
	$("status").textContent = ` ${text}`;
	setTimeout(() => {
		$("status").textContent = "";
	}, 2500);
};

const stored = await chrome.storage.sync.get([
	"baseUrl",
	"newTab",
	"syncBookmarks",
]);
const local = await chrome.storage.local.get(["lastSync", "lastSyncCount"]);
$("baseUrl").value = stored.baseUrl || DEFAULT_BASE_URL;
$("newTab").checked = stored.newTab ?? true;
$("syncBookmarks").checked = stored.syncBookmarks ?? false;
$("connection").textContent = (await getToken())
	? "Connected to your tabz account."
	: "Not connected yet. Open tabz.space while signed in.";
if (local.lastSync)
	$("lastSync").textContent =
		`Last synced ${new Date(local.lastSync).toLocaleString()} (${local.lastSyncCount} links).`;

$("save").addEventListener("click", async () => {
	if (
		$("syncBookmarks").checked &&
		!(await chrome.permissions.contains({ permissions: ["bookmarks"] }))
	) {
		await chrome.permissions.request({ permissions: ["bookmarks"] });
	}
	await chrome.storage.sync.set({
		baseUrl: $("baseUrl").value.trim(),
		newTab: $("newTab").checked,
		syncBookmarks: $("syncBookmarks").checked,
	});
	flash("Saved");
	if ($("syncBookmarks").checked)
		chrome.runtime.sendMessage({ type: "sync-now" });
});

$("syncNow").addEventListener("click", async () => {
	const result = await chrome.runtime.sendMessage({ type: "sync-now" });
	flash(
		result?.ok && result.links !== undefined
			? `Synced ${result.links} links`
			: result?.error || "Turn on sync first",
	);
});

$("disconnect").addEventListener("click", async () => {
	await chrome.storage.local.remove("token");
	$("connection").textContent = "Disconnected.";
});

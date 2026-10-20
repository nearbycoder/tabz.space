import { getBaseUrl, getToken } from "./config.js";

const $ = (id) => document.getElementById(id);
const say = (text) => {
	$("message").textContent = text;
};
const send = (message) => chrome.runtime.sendMessage(message);

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const isWeb = /^https?:/i.test(tab?.url ?? "");
const connected = Boolean(await getToken());

$("state").textContent = connected ? "connected" : "not connected";
$("connect").hidden = connected;
$("actions").hidden = !connected;
$("page-title").textContent = tab?.title || "This page";
$("page-host").textContent = isWeb
	? new URL(tab.url).hostname
	: "Can't save this kind of page";
$("save-page").disabled = !isWeb;
$("save-details").disabled = !isWeb;
$("read-later").disabled = !isWeb;

$("open-site").addEventListener("click", async () =>
	chrome.tabs.create({ url: await getBaseUrl() }),
);
$("options").addEventListener("click", () => chrome.runtime.openOptionsPage());

$("save-page").addEventListener("click", async () => {
	$("save-page").disabled = true;
	say("Saving…");
	const result = await send({
		type: "save-page",
		url: tab.url,
		title: tab.title,
	});
	say(
		result?.ok
			? `Saved “${result.bookmark.title}”`
			: result?.error || "Couldn't save",
	);
	if (result?.ok) setTimeout(() => window.close(), 900);
	else $("save-page").disabled = false;
});

$("save-details").addEventListener("click", async () => {
	await send({ type: "open-add", url: tab.url, title: tab.title });
	window.close();
});

$("session-name").addEventListener("input", () => {
	$("save-tabs").textContent = $("session-name").value.trim()
		? "Save as a session"
		: "Save all tabs as a group";
});

$("read-later").addEventListener("click", async () => {
	$("read-later").disabled = true;
	say("Saving for later…");
	const result = await send({
		type: "read-later",
		url: tab.url,
		title: tab.title,
	});
	say(result?.ok ? "Added to Read later" : result?.error || "Couldn't save");
	if (result?.ok) setTimeout(() => window.close(), 900);
	else $("read-later").disabled = false;
});

// Tabs you haven't looked at in 3 days, ready to archive in one click.
if (connected) {
	const idle = await send({ type: "idle-count", days: 3 });
	if (idle?.count) {
		$("archive-idle").hidden = false;
		$("archive-idle").textContent =
			`Archive ${idle.count} tab${idle.count === 1 ? "" : "s"} idle 3+ days`;
	}
}
$("archive-idle").addEventListener("click", async () => {
	$("archive-idle").disabled = true;
	say("Archiving…");
	const result = await send({ type: "archive-idle", days: 3 });
	say(
		result?.ok
			? `Archived ${result.saved ?? 0} tabs to “Archived tabs”`
			: result?.error || "Couldn't archive",
	);
	if (result?.ok) $("archive-idle").hidden = true;
	else $("archive-idle").disabled = false;
});

$("save-tabs").addEventListener("click", async () => {
	$("save-tabs").disabled = true;
	say("Saving tabs…");
	const result = await send({
		type: "save-tabs",
		windowId: tab?.windowId,
		close: $("close-tabs").checked,
		session: $("session-name").value,
	});
	say(
		result?.ok
			? `Saved ${result.saved ?? 0} tabs to “${result.name ?? "a new group"}”`
			: result?.error || "Couldn't save tabs",
	);
	$("save-tabs").disabled = false;
});

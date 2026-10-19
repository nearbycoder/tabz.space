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

$("save-tabs").addEventListener("click", async () => {
	$("save-tabs").disabled = true;
	say("Saving tabs…");
	const result = await send({
		type: "save-tabs",
		windowId: tab?.windowId,
		close: $("close-tabs").checked,
	});
	say(
		result?.ok
			? `Saved ${result.saved ?? 0} tabs to “${result.name ?? "a new group"}”`
			: result?.error || "Couldn't save tabs",
	);
	$("save-tabs").disabled = false;
});

import { toast } from "sonner";
import { call, run } from "#/lib/api";
import { issueExtensionToken } from "#/server/developer";

/*
 * Web pages can't open private windows; the tabz browser extension can. Its
 * content script (extension/bridge.js) answers these postMessage calls.
 */

export type ExtensionStatus = {
	installed: boolean;
	incognitoAllowed: boolean;
	/** The extension holds an API token for this site. */
	connected: boolean;
	/** Can search browser history (0.5.0+); undefined on older versions. */
	historyAllowed?: boolean;
	version?: string;
};

/** A page from the browser's history, found by the extension. */
export type HistoryItem = { url: string; title: string; lastVisit: number };

let status: ExtensionStatus = {
	installed: false,
	incognitoAllowed: false,
	connected: false,
};
const listeners = new Set<(status: ExtensionStatus) => void>();
const pending = new Map<string, (ok: boolean) => void>();
const pendingHistory = new Map<string, (items: HistoryItem[]) => void>();

if (typeof window !== "undefined") {
	window.addEventListener("message", (event) => {
		if (
			event.source !== window ||
			event.origin !== location.origin ||
			event.data?.source !== "tabz-extension"
		)
			return;
		if (event.data.type === "status") {
			status = {
				installed: true,
				incognitoAllowed: Boolean(event.data.incognitoAllowed),
				connected:
					Boolean(event.data.hasToken) &&
					event.data.baseUrl === location.origin,
				historyAllowed:
					typeof event.data.historyAllowed === "boolean"
						? event.data.historyAllowed
						: undefined,
				version: event.data.version,
			};
			for (const listener of listeners) listener(status);
		}
		if (event.data.type === "history") {
			const items: unknown = event.data.items;
			pendingHistory.get(event.data.id)?.(
				Array.isArray(items) ? items.filter(isHistoryItem) : [],
			);
			pendingHistory.delete(event.data.id);
		}
		if (event.data.type === "opened") {
			pending.get(event.data.id)?.(Boolean(event.data.ok));
			pending.delete(event.data.id);
		}
	});
	window.postMessage({ source: "tabz-page", type: "hello" }, location.origin);
}

export const getExtensionStatus = () => status;

export function onExtensionStatus(listener: (status: ExtensionStatus) => void) {
	listeners.add(listener);
	window.postMessage({ source: "tabz-page", type: "hello" }, location.origin);
	return () => {
		listeners.delete(listener);
	};
}

let connecting = false;

/**
 * Signs the extension in: the signed-in page mints an API token and hands it
 * to the extension through the bridge, so there's nothing to paste.
 */
export function connectExtension() {
	return onExtensionStatus(async (next) => {
		if (!next.installed || next.connected || connecting) return;
		connecting = true;
		try {
			const { token } = await run(call(issueExtensionToken));
			window.postMessage(
				{ source: "tabz-page", type: "set-token", token },
				location.origin,
			);
		} finally {
			// Allow a retry later, e.g. after the token is revoked.
			setTimeout(() => {
				connecting = false;
			}, 10_000);
		}
	});
}

function request(
	type:
		| "open-incognito"
		| "open-tabs"
		| "open-settings"
		| "history-settings"
		| "focus-snooze",
	urls: string[] = [],
) {
	const id = crypto.randomUUID();
	return new Promise<boolean>((resolve) => {
		pending.set(id, resolve);
		window.postMessage(
			{ source: "tabz-page", type, id, urls },
			location.origin,
		);
		setTimeout(() => {
			if (pending.delete(id)) resolve(false);
		}, 3000);
	});
}

const requestIncognito = (urls: string[]) =>
	status.incognitoAllowed
		? request("open-incognito", urls)
		: Promise.resolve(false);

/**
 * Opens links as background tabs. Browsers block more than one window.open
 * per click, so this needs the extension; without it the first link opens.
 */
export async function openTabs(urls: string[]) {
	if (status.installed && (await request("open-tabs", urls))) return true;
	window.open(urls[0], "_blank", "noopener");
	if (urls.length > 1)
		toast("Opened the first link", {
			description: "Install the tabz extension to open a whole group at once.",
		});
	return false;
}

const isHistoryItem = (item: unknown): item is HistoryItem =>
	typeof item === "object" &&
	item !== null &&
	typeof (item as HistoryItem).url === "string" &&
	/^https?:\/\//i.test((item as HistoryItem).url) &&
	typeof (item as HistoryItem).title === "string";

/**
 * Searches the browser's history through the extension. Stays in this
 * browser: the extension answers the page directly, nothing goes to the server.
 */
export function searchHistory(text: string) {
	if (!status.historyAllowed) return Promise.resolve<HistoryItem[]>([]);
	const id = crypto.randomUUID();
	return new Promise<HistoryItem[]>((resolve) => {
		pendingHistory.set(id, resolve);
		window.postMessage(
			{ source: "tabz-page", type: "history-search", id, text },
			location.origin,
		);
		setTimeout(() => {
			if (pendingHistory.delete(id)) resolve([]);
		}, 2000);
	});
}

/** Opens the extension's options at the history switch. */
export const openHistorySettings = () => request("history-settings");

/** Where this browser keeps the extension's private-window switch. */
function incognitoSwitch() {
	const agent = navigator.userAgent;
	if (agent.includes("Firefox"))
		return "Firefox: Add-ons → tabz → Run in Private Windows → Allow.";
	const browser = agent.includes("Edg/")
		? "Edge"
		: (navigator as { brave?: unknown }).brave
			? "Brave"
			: "Chrome";
	return `${browser}: Extensions → tabz → Details → “Allow in Incognito”.`;
}

/** Opens links privately; never falls back to a normal tab, so nothing leaks into history. */
export async function openIncognito(urls: string[]) {
	if (await requestIncognito(urls)) return true;
	const shortcut = /Mac|iPhone|iPad/.test(navigator.platform)
		? "⌘⇧N"
		: "Ctrl+Shift+N";
	const copy = {
		label: urls.length > 1 ? "Copy links" : "Copy link",
		onClick: () => navigator.clipboard.writeText(urls.join("\n")),
	};
	const firefox = navigator.userAgent.includes("Firefox");
	if (status.installed) {
		toast("Allow private windows", {
			icon: "🕶️",
			description: firefox
				? `${incognitoSwitch()} Or copy the link and press ${shortcut}.`
				: incognitoSwitch(),
			// Chromium browsers: the extension can open its own details page.
			action: firefox
				? copy
				: {
						label: "Open settings",
						onClick: () => {
							void request("open-settings");
						},
					},
			cancel: firefox ? undefined : copy,
			duration: 15_000,
		});
		return false;
	}
	toast("Open this privately", {
		icon: "🕶️",
		description: `Install the tabz extension to open private links in one click, or copy the link and press ${shortcut}.`,
		action: copy,
		duration: 10_000,
	});
	return false;
}

/** What the page looks like, so the extension's new tab page can match it. */
export type PageLook = {
	canvas: string;
	gradient?: string;
	image?: string;
	dim?: number;
};

/**
 * Hands the extension this page's background. While a new tab loads, the
 * extension shows it instead of a blank page, so tabz appears without a flash.
 */
export function shareLookWithExtension(look: PageLook) {
	window.postMessage(
		{ source: "tabz-page", type: "look", look },
		location.origin,
	);
}

/** Focus mode settings, so the extension can block sites on its own schedule. */
export function shareFocusWithExtension(focus: unknown, timeZone?: string) {
	window.postMessage(
		{ source: "tabz-page", type: "focus", focus, timeZone },
		location.origin,
	);
}

/** "5 more minutes": the extension lets this site through briefly, then goes back to it. */
export const snoozeFocus = (url: string) => request("focus-snooze", [url]);

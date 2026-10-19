import { toast } from "sonner";

/*
 * Web pages can't open private windows; the tabz browser extension can. Its
 * content script (extension/bridge.js) answers these postMessage calls.
 */

export type ExtensionStatus = {
	installed: boolean;
	incognitoAllowed: boolean;
	version?: string;
};

let status: ExtensionStatus = { installed: false, incognitoAllowed: false };
const listeners = new Set<(status: ExtensionStatus) => void>();
const pending = new Map<string, (ok: boolean) => void>();

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
				version: event.data.version,
			};
			for (const listener of listeners) listener(status);
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

function requestIncognito(urls: string[]) {
	if (!status.incognitoAllowed) return Promise.resolve(false);
	const id = crypto.randomUUID();
	return new Promise<boolean>((resolve) => {
		pending.set(id, resolve);
		window.postMessage(
			{ source: "tabz-page", type: "open-incognito", id, urls },
			location.origin,
		);
		setTimeout(() => {
			if (pending.delete(id)) resolve(false);
		}, 3000);
	});
}

/** Opens links privately; never falls back to a normal tab, so nothing leaks into history. */
export async function openIncognito(urls: string[]) {
	if (await requestIncognito(urls)) return true;
	const shortcut = /Mac|iPhone|iPad/.test(navigator.platform)
		? "⌘⇧N"
		: "Ctrl+Shift+N";
	toast("Open this privately", {
		icon: "🕶️",
		description: status.installed
			? `Turn on "Allow in Incognito" for the tabz extension, or copy the link and press ${shortcut}.`
			: `Install the tabz extension to open private links in one click, or copy the link and press ${shortcut}.`,
		action: {
			label: urls.length > 1 ? "Copy links" : "Copy link",
			onClick: () => navigator.clipboard.writeText(urls.join("\n")),
		},
		duration: 10_000,
	});
	return false;
}

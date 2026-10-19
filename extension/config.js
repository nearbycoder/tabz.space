export const DEFAULT_BASE_URL = "https://tabz.space";

/** The tabz server this extension talks to (overridable on the options page). */
export async function getBaseUrl() {
	const { baseUrl } = await chrome.storage.sync.get("baseUrl");
	return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

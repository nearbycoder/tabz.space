export const DEFAULT_BASE_URL = "https://tabz.space";

/** The tabz server this extension talks to (overridable on the options page). */
export async function getBaseUrl() {
	const { baseUrl } = await chrome.storage.sync.get("baseUrl");
	return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** The API token handed over by the tabz page (stored locally, never synced). */
export async function getToken() {
	const { token } = await chrome.storage.local.get("token");
	return token || null;
}

/** Calls the tabz REST API with the extension's token. */
export async function api(path, { method = "GET", body } = {}) {
	const token = await getToken();
	if (!token)
		throw new Error(
			"Open tabz.space once while signed in to connect the extension.",
		);
	const response = await fetch(`${await getBaseUrl()}/api/v1${path}`, {
		method,
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const data = await response.json().catch(() => ({}));
	if (response.status === 401) await chrome.storage.local.remove("token");
	if (!response.ok)
		throw new Error(data.error || `Request failed (${response.status})`);
	return data;
}

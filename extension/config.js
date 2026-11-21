export const DEFAULT_BASE_URL = "https://tabz.space";

/** Only https:// origins (or http://localhost for local dev) are allowed. */
export function normalizeBaseUrl(raw) {
	const text = String(raw ?? "").trim();
	if (!text) return DEFAULT_BASE_URL;
	try {
		const url = new URL(text);
		const isLocal =
			url.protocol === "http:" &&
			(url.hostname === "localhost" || url.hostname === "127.0.0.1");
		if (url.protocol !== "https:" && !isLocal) return null;
		return url.origin;
	} catch {
		return null;
	}
}

/** The tabz server this extension talks to (overridable on the options page). */
export async function getBaseUrl() {
	const { baseUrl } = await chrome.storage.sync.get("baseUrl");
	return normalizeBaseUrl(baseUrl) ?? DEFAULT_BASE_URL;
}

/** The API token handed over by the tabz page (stored locally, bound to its issuing origin). */
export async function getToken() {
	const { token, tokenOrigin } = await chrome.storage.local.get([
		"token",
		"tokenOrigin",
	]);
	if (!token) return null;
	if (tokenOrigin && tokenOrigin !== (await getBaseUrl())) return null;
	return token;
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

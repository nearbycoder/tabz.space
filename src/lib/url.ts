/** Accepts "github.com" style input and returns a normalized absolute URL. */
export function normalizeUrl(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
		? trimmed
		: `https://${trimmed}`;
	try {
		const url = new URL(candidate);
		if (!["http:", "https:"].includes(url.protocol)) return null;
		if (!url.hostname.includes(".") && url.hostname !== "localhost")
			return null;
		return url.toString();
	} catch {
		return null;
	}
}

export function hostnameOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

export function faviconFor(url: string, size = 64): string {
	return `https://www.google.com/s2/favicons?sz=${size}&domain_url=${encodeURIComponent(hostnameOf(url))}`;
}

export function titleFromUrl(url: string): string {
	const host = hostnameOf(url).split(".");
	const name = host.length > 1 ? host[host.length - 2] : host[0];
	return name.charAt(0).toUpperCase() + name.slice(1);
}

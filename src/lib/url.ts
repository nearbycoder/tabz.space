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

const TRACKING =
	/^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|igshid|si)$/i;

/**
 * A comparison key for "is this the same page?": ignores scheme, www, trailing
 * slashes, fragments and tracking parameters.
 */
export function canonicalUrl(input: string): string {
	try {
		const url = new URL(input);
		const params = [...url.searchParams.entries()]
			.filter(([key]) => !TRACKING.test(key))
			.sort(([a], [b]) => a.localeCompare(b));
		const search = params.length
			? `?${new URLSearchParams(params).toString()}`
			: "";
		const path = url.pathname.replace(/\/+$/, "") || "";
		return `${url.hostname.replace(/^www\./, "").toLowerCase()}${path}${search}`;
	} catch {
		return input.trim().toLowerCase();
	}
}

/** Pulls every http(s) URL out of free text (one per line, Markdown, HTML…). */
export function extractUrls(text: string): string[] {
	const found = text.match(/https?:\/\/[^\s<>"'`)\]]+/gi) ?? [];
	const bare = text
		.split(/\s+/)
		.filter(
			(token) =>
				/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(token) && !token.includes("@"),
		);
	const all = [...found, ...bare].map((url) => url.replace(/[.,;:!?]+$/, ""));
	return [...new Set(all)];
}

/**
 * Hosts where each first path segment is its own site: GitHub/GitLab/Codeberg
 * Pages project sites, and Google's Docs/Sites apps (Sheets vs Docs icons).
 */
const PATH_SCOPED =
	/(^|\.)(github\.io|gitlab\.io|codeberg\.page|bitbucket\.io)$|^(docs|sites)\.google\.com$/i;

/**
 * The part of a URL that shares one icon: the site's origin, or origin + first
 * path segment on hosts like *.github.io where every project is its own site.
 */
export function iconScope(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
			return null;
		const segment = parsed.pathname.split("/").filter(Boolean)[0];
		return segment && PATH_SCOPED.test(parsed.hostname)
			? `${parsed.origin}/${segment}/`
			: `${parsed.origin}/`;
	} catch {
		return null;
	}
}

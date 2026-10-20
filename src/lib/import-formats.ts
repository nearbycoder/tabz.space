import {
	type ImportItem,
	type ParsedGroup,
	parseBookmarkHtml,
} from "./bookmark-file";

/*
 * Imports from other start pages and read-it-later apps, detected from the
 * file's contents:
 *
 *   - browser / Pocket / Raindrop HTML  (Netscape bookmark format)
 *   - start.me and feed readers         (OPML)
 *   - Raindrop.io and Pocket            (CSV with url/title/folder columns)
 *   - Toby                              (JSON: lists of cards, or groups of lists)
 *   - Momentum and anything else JSON   (any objects with a url, grouped by
 *                                        the list or folder they sit in)
 */

const MAX_ITEMS = 5000;
const isWeb = (url: unknown): url is string =>
	typeof url === "string" && /^https?:\/\//i.test(url.trim());

/** RFC 4180-ish CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (char === '"') quoted = false;
			else field += char;
		} else if (char === '"') quoted = true;
		else if (char === ",") {
			row.push(field);
			field = "";
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else field += char;
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => r.some((cell) => cell.trim()));
}

/** Puts a link at a folder path ("Work/Docs") inside a group's items. */
function place(items: ImportItem[], path: string[], link: ImportItem) {
	let level = items;
	for (const name of path) {
		let folder = level.find((item) => !item.url && item.title === name);
		if (!folder) {
			folder = { title: name, items: [] };
			level.push(folder);
		}
		folder.items ??= [];
		level = folder.items;
	}
	level.push(link);
}

/** Raindrop.io (url,title,folder,…) and Pocket (title,url,…,tags) CSV exports. */
function fromCsv(text: string): ParsedGroup[] {
	const [header, ...rows] = parseCsv(text);
	if (!header) return [];
	const column = (...names: string[]) =>
		header.findIndex((cell) => names.includes(cell.trim().toLowerCase()));
	const url = column("url", "link", "href");
	if (url < 0) return [];
	const title = column("title", "name");
	const folder = column("folder", "collection", "category", "list");
	const groups = new Map<string, ImportItem[]>();
	for (const row of rows.slice(0, MAX_ITEMS)) {
		const href = row[url]?.trim();
		if (!isWeb(href)) continue;
		const [top, ...rest] = (folder >= 0 ? row[folder] : "")
			.split("/")
			.map((part) => part.trim())
			.filter(Boolean);
		const name = top || "Imported";
		const items = groups.get(name) ?? [];
		groups.set(name, items);
		place(items, rest, { title: row[title]?.trim() || href, url: href });
	}
	return [...groups].map(([name, bookmarks]) => ({ name, bookmarks }));
}

/** OPML outlines (start.me, feed readers): top level outlines become groups. */
function fromOpml(text: string): ParsedGroup[] {
	const doc = new DOMParser().parseFromString(text, "text/xml");
	const body = doc.querySelector("body");
	if (!body) return [];
	let count = 0;
	const toItems = (outline: Element): ImportItem[] =>
		[...outline.children]
			.filter((child) => child.tagName.toLowerCase() === "outline")
			.flatMap((child): ImportItem[] => {
				if (count >= MAX_ITEMS) return [];
				const title =
					child.getAttribute("title") || child.getAttribute("text") || "";
				const href =
					child.getAttribute("url") ||
					child.getAttribute("htmlUrl") ||
					child.getAttribute("xmlUrl");
				if (isWeb(href)) {
					count++;
					return [{ title: title || href, url: href }];
				}
				const items = toItems(child);
				return items.length ? [{ title: title || "Folder", items }] : [];
			});
	const top = toItems(body);
	const loose = top.filter((item) => item.url);
	return [
		...(loose.length ? [{ name: "Imported", bookmarks: loose }] : []),
		...top
			.filter((item) => !item.url)
			.map((item) => ({ name: item.title, bookmarks: item.items ?? [] })),
	];
}

type Json = unknown;
const record = (value: Json): value is Record<string, Json> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const label = (value: Record<string, Json>) =>
	[value.title, value.name, value.label, value.customTitle].find(
		(item): item is string => typeof item === "string" && item.trim() !== "",
	);

/** A Toby card / Momentum link / generic {url, title}. */
const asLink = (value: Json): ImportItem | null => {
	if (!record(value)) return null;
	const href = [value.url, value.href, value.link].find(isWeb);
	if (!href) return null;
	return {
		title:
			(typeof value.customTitle === "string" && value.customTitle) ||
			label(value) ||
			href,
		url: href.trim(),
	};
};

/**
 * Toby ({lists:[{title,cards}]} or {groups:[{name,lists}]}) and any other
 * JSON: every array of link-like objects becomes a group named after the
 * object holding it.
 */
function fromJson(data: Json): ParsedGroup[] {
	const groups: ParsedGroup[] = [];
	let count = 0;
	const visit = (value: Json, name: string, prefix: string) => {
		if (count >= MAX_ITEMS) return;
		if (Array.isArray(value)) {
			const links = value
				.map(asLink)
				.filter((link): link is ImportItem => link !== null);
			if (links.length) {
				count += links.length;
				groups.push({
					name: (prefix ? `${prefix} · ${name}` : name).slice(0, 60),
					bookmarks: links.slice(0, MAX_ITEMS),
				});
			}
			for (const item of value)
				if (record(item) && !asLink(item))
					visit(item, label(item) ?? name, prefix);
			return;
		}
		if (!record(value)) return;
		const here = label(value);
		for (const [key, child] of Object.entries(value))
			if (typeof child === "object" && child !== null)
				visit(
					child,
					here ?? (key === "cards" || key === "links" ? name : key),
					// Toby groups hold lists: keep the group name as a prefix.
					key === "lists" && here ? here : prefix,
				);
	};
	visit(data, "Imported", "");
	return groups;
}

/** Reads any supported export; returns groups of links and folders. */
export function parseImportFile(text: string): ParsedGroup[] {
	const head = text.trimStart().slice(0, 500).toLowerCase();
	if (head.startsWith("{") || head.startsWith("[")) {
		try {
			return fromJson(JSON.parse(text));
		} catch {
			return [];
		}
	}
	if (head.includes("<opml")) return fromOpml(text);
	if (head.startsWith("<") || head.includes("<!doctype netscape"))
		return parseBookmarkHtml(text);
	return fromCsv(text);
}

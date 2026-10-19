/** Import/export for the Netscape bookmark HTML format every browser speaks. */

/** A link, or a folder of further items (any depth). */
export type ImportItem = { title: string; url?: string; items?: ImportItem[] };

export type ParsedGroup = { name: string; bookmarks: ImportItem[] };

const MAX_ITEMS = 5000;

/**
 * Each top-level folder in the file becomes a group; folders inside it stay
 * folders (nested as deep as they were). Loose top-level links go to "Imported".
 */
export function parseBookmarkHtml(html: string): ParsedGroup[] {
	const doc = new DOMParser().parseFromString(html, "text/html");
	let count = 0;
	// DTs sit directly in their DL (sometimes wrapped in a stray <p>).
	const entries = (dl: Element) =>
		[...dl.children].flatMap((child) =>
			child.tagName === "DT"
				? [child]
				: child.tagName === "P"
					? [...child.children].filter((el) => el.tagName === "DT")
					: [],
		);
	const readList = (dl: Element | null, depth: number): ImportItem[] => {
		if (!dl || depth > 32) return [];
		return entries(dl).flatMap((dt): ImportItem[] => {
			if (count >= MAX_ITEMS) return [];
			const heading = dt.querySelector(":scope > h3");
			if (heading) {
				const list =
					dt.querySelector(":scope > dl") ??
					(heading.nextElementSibling?.tagName === "DL"
						? heading.nextElementSibling
						: null);
				return [
					{
						title: (heading.textContent ?? "").trim().slice(0, 60) || "Folder",
						items: readList(list, depth + 1),
					},
				];
			}
			const anchor = dt.querySelector(":scope > a[href]");
			const url = anchor?.getAttribute("href") ?? "";
			if (!anchor || !/^https?:/i.test(url)) return [];
			count++;
			return [
				{
					title: (anchor.textContent ?? "").trim().slice(0, 200),
					url: url.slice(0, 2048),
				},
			];
		});
	};

	const top = readList(doc.querySelector("dl"), 0);
	const groups: ParsedGroup[] = [];
	const loose: ImportItem[] = [];
	for (const item of top) {
		if (item.items) {
			if (item.items.length)
				groups.push({ name: item.title, bookmarks: item.items });
		} else loose.push(item);
	}
	if (loose.length) groups.unshift({ name: "Imported", bookmarks: loose });
	return groups.slice(0, 200);
}

const escapeHtml = (value: string) =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

type ExportItem = {
	kind: string;
	title: string;
	url: string;
	children?: ExportItem[];
};

export function toBookmarkHtml(
	boards: {
		name: string;
		groups: { name: string; bookmarks: ExportItem[] }[];
	}[],
) {
	const lines = [
		"<!DOCTYPE NETSCAPE-Bookmark-file-1>",
		'<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
		"<TITLE>Bookmarks</TITLE>",
		"<H1>Bookmarks</H1>",
		"<DL><p>",
	];
	const folder = (name: string, items: ExportItem[], indent: string) => {
		lines.push(`${indent}<DT><H3>${escapeHtml(name)}</H3>`, `${indent}<DL><p>`);
		for (const item of items) {
			if (item.kind === "folder")
				folder(item.title, item.children ?? [], `${indent}  `);
			else
				lines.push(
					`${indent}  <DT><A HREF="${escapeHtml(item.url)}">${escapeHtml(item.title)}</A>`,
				);
		}
		lines.push(`${indent}</DL><p>`);
	};
	for (const board of boards) {
		lines.push(`  <DT><H3>${escapeHtml(board.name)}</H3>`, "  <DL><p>");
		for (const group of board.groups)
			folder(group.name, group.bookmarks, "    ");
		lines.push("  </DL><p>");
	}
	lines.push("</DL><p>");
	return lines.join("\n");
}

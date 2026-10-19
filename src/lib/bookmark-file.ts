/** Import/export for the Netscape bookmark HTML format every browser speaks. */

export type ParsedGroup = {
	name: string;
	bookmarks: { title: string; url: string }[];
};

export function parseBookmarkHtml(html: string): ParsedGroup[] {
	const doc = new DOMParser().parseFromString(html, "text/html");
	const groups = new Map<string, ParsedGroup>();
	for (const anchor of doc.querySelectorAll("a[href]")) {
		const url = anchor.getAttribute("href") ?? "";
		if (!/^https?:/i.test(url)) continue;
		const folders: string[] = [];
		for (let el = anchor.parentElement; el; el = el.parentElement) {
			if (el.tagName !== "DL") continue;
			const heading = el.previousElementSibling;
			if (heading?.tagName === "H3" && heading.textContent)
				folders.unshift(heading.textContent.trim());
		}
		const name = (folders.at(-1) ?? "Imported").slice(0, 60) || "Imported";
		const key = folders.join("/") || name;
		const group = groups.get(key) ?? { name, bookmarks: [] };
		group.bookmarks.push({
			title: (anchor.textContent ?? "").trim().slice(0, 200),
			url: url.slice(0, 2048),
		});
		groups.set(key, group);
	}
	return [...groups.values()].slice(0, 200);
}

const escapeHtml = (value: string) =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

export function toBookmarkHtml(
	boards: {
		name: string;
		groups: { name: string; bookmarks: { title: string; url: string }[] }[];
	}[],
) {
	const lines = [
		"<!DOCTYPE NETSCAPE-Bookmark-file-1>",
		'<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
		"<TITLE>Bookmarks</TITLE>",
		"<H1>Bookmarks</H1>",
		"<DL><p>",
	];
	for (const board of boards) {
		lines.push(`  <DT><H3>${escapeHtml(board.name)}</H3>`, "  <DL><p>");
		for (const group of board.groups) {
			lines.push(`    <DT><H3>${escapeHtml(group.name)}</H3>`, "    <DL><p>");
			for (const bookmark of group.bookmarks) {
				lines.push(
					`      <DT><A HREF="${escapeHtml(bookmark.url)}">${escapeHtml(bookmark.title)}</A>`,
				);
			}
			lines.push("    </DL><p>");
		}
		lines.push("  </DL><p>");
	}
	lines.push("</DL><p>");
	return lines.join("\n");
}

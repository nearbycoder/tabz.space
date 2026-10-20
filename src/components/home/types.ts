import type { Bookmark } from "#/db/schema";
import type { HomeBoard, HomeBookmark, HomeGroup } from "#/server/home";

export type { HomeBoard, HomeBookmark, HomeGroup };

/** Any single link or folder row (top-level items additionally carry `children`). */
export type LinkItem = Bookmark;

export type DialogState =
	| {
			type: "bookmark";
			groupId: string;
			bookmark?: LinkItem;
			parentId?: string | null;
			url?: string;
	  }
	| { type: "folder"; folderId: string }
	| { type: "new-folder"; groupId: string; parentId?: string }
	| {
			type: "group";
			boardId: string;
			group?: HomeGroup;
			kind?: "links" | "smart" | "widget";
	  }
	| { type: "board"; board?: HomeBoard }
	| { type: "settings"; tab?: string }
	| { type: "vault-unlock" }
	| { type: "history"; tab?: "history" | "trash" }
	| { type: "duplicates" }
	| { type: "link-health" }
	| { type: "report"; month?: string }
	| { type: "shortcuts" }
	| { type: "bulk-add"; text?: string; groupId?: string }
	| { type: "ai-command"; text: string }
	| null;

/** Regular groups hold links; smart groups fill themselves. */
export const isLinksGroup = (group: { kind: string }) => group.kind === "links";

/** A link or folder with everything nested inside it (folders nest to any depth). */
export type TreeItem = HomeBookmark;

/** Every item in a tree, depth-first. */
export const flattenTree = (items: TreeItem[]): TreeItem[] =>
	items.flatMap((item) => [item, ...flattenTree(item.children)]);

/** Every link in a tree, at any depth. */
export const linksIn = (items: TreeItem[]) =>
	flattenTree(items).filter((item) => item.kind === "link");

/** Rebuilds a tree with `fn` applied to every item, at any depth. */
export const mapTree = (
	items: TreeItem[],
	fn: (item: TreeItem) => TreeItem,
): TreeItem[] =>
	items.map((item) => {
		const next = fn(item);
		return { ...next, children: mapTree(next.children, fn) };
	});

/** Drops an item (and what's inside it) from a tree, at any depth. */
export const removeFromTree = (items: TreeItem[], id: string): TreeItem[] =>
	items
		.filter((item) => item.id !== id)
		.map((item) => ({ ...item, children: removeFromTree(item.children, id) }));

/** Finds an item by id along with the folders above it (outermost first). */
export function findInTree(
	items: TreeItem[],
	id: string,
	path: TreeItem[] = [],
): { item: TreeItem; path: TreeItem[] } | null {
	for (const item of items) {
		if (item.id === id) return { item, path };
		const found = findInTree(item.children, id, [...path, item]);
		if (found) return found;
	}
	return null;
}

/** The address to open: past any permanent redirects the link checker found. */
export const targetUrl = (item: {
	url: string;
	meta: { go?: string | null };
}) => item.meta.go || item.url;

/** A plain left click that navigates this tab (no new-tab modifiers). */
export const leavesPage = (
	event: {
		button: number;
		metaKey: boolean;
		ctrlKey: boolean;
		shiftKey: boolean;
		altKey: boolean;
	},
	openInNewTab: boolean,
) =>
	!openInNewTab &&
	event.button === 0 &&
	!event.metaKey &&
	!event.ctrlKey &&
	!event.shiftKey &&
	!event.altKey;

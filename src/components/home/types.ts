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
	| { type: "new-folder"; groupId: string }
	| { type: "group"; boardId: string; group?: HomeGroup }
	| { type: "board"; board?: HomeBoard }
	| { type: "settings"; tab?: string }
	| { type: "vault-unlock" }
	| { type: "history"; tab?: "history" | "trash" }
	| { type: "duplicates" }
	| { type: "link-health" }
	| { type: "bulk-add"; text?: string; groupId?: string }
	| null;

/** Regular groups hold links; smart groups fill themselves. */
export const isLinksGroup = (group: { kind: string }) => group.kind === "links";

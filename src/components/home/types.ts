import type { HomeBoard, HomeBookmark, HomeGroup } from "#/server/home";

export type { HomeBoard, HomeBookmark, HomeGroup };

export type DialogState =
	| { type: "bookmark"; groupId: string; bookmark?: HomeBookmark }
	| { type: "group"; boardId: string; group?: HomeGroup }
	| { type: "board"; board?: HomeBoard }
	| { type: "settings" }
	| null;

import { createServerFn } from "@tanstack/react-start";
import * as library from "./library";
import { runAuthed } from "./runtime";

/* RPC surface for the web app. All logic lives in ./library (shared with MCP). */

export const getHome = createServerFn().handler(() =>
	runAuthed((user) => library.loadHome(user.id)),
);

export type HomeData = Awaited<ReturnType<typeof getHome>>;
export type HomeBoard = HomeData["boards"][number];
export type HomeGroup = HomeBoard["groups"][number];
export type HomeBookmark = HomeGroup["bookmarks"][number];

export const saveSettings = createServerFn({ method: "POST" })
	.validator(library.settingsInput)
	.handler(({ data }) =>
		runAuthed((user) => library.saveSettings(user.id, data)),
	);

export const createBoard = createServerFn({ method: "POST" })
	.validator(library.createBoardInput)
	.handler(({ data }) =>
		runAuthed((user) => library.createBoard(user.id, data)),
	);

export const updateBoard = createServerFn({ method: "POST" })
	.validator(library.updateBoardInput)
	.handler(({ data }) =>
		runAuthed((user) => library.updateBoard(user.id, data)),
	);

export const deleteBoard = createServerFn({ method: "POST" })
	.validator(library.idInput)
	.handler(({ data }) =>
		runAuthed((user) => library.deleteBoard(user.id, data)),
	);

export const reorderBoards = createServerFn({ method: "POST" })
	.validator(library.reorderInput)
	.handler(({ data }) =>
		runAuthed((user) => library.reorderBoards(user.id, data)),
	);

export const createGroup = createServerFn({ method: "POST" })
	.validator(library.createGroupInput)
	.handler(({ data }) =>
		runAuthed((user) => library.createGroup(user.id, data)),
	);

export const updateGroup = createServerFn({ method: "POST" })
	.validator(library.updateGroupInput)
	.handler(({ data }) =>
		runAuthed((user) => library.updateGroup(user.id, data)),
	);

export const deleteGroup = createServerFn({ method: "POST" })
	.validator(library.idInput)
	.handler(({ data }) =>
		runAuthed((user) => library.deleteGroup(user.id, data)),
	);

export const reorderGroups = createServerFn({ method: "POST" })
	.validator(library.reorderInput)
	.handler(({ data }) =>
		runAuthed((user) => library.reorderGroups(user.id, data)),
	);

export const lookupUrl = createServerFn({ method: "POST" })
	.validator(library.lookupUrlInput)
	.handler(({ data }) => runAuthed(() => library.lookupUrl(data)));

export const createBookmark = createServerFn({ method: "POST" })
	.validator(library.createBookmarkInput)
	.handler(({ data }) =>
		runAuthed((user) => library.createBookmark(user.id, data)),
	);

export const updateBookmark = createServerFn({ method: "POST" })
	.validator(library.updateBookmarkInput)
	.handler(({ data }) =>
		runAuthed((user) => library.updateBookmark(user.id, data)),
	);

export const deleteBookmark = createServerFn({ method: "POST" })
	.validator(library.idInput)
	.handler(({ data }) =>
		runAuthed((user) => library.deleteBookmark(user.id, data)),
	);

export const arrangeBookmarks = createServerFn({ method: "POST" })
	.validator(library.arrangeBookmarksInput)
	.handler(({ data }) =>
		runAuthed((user) => library.arrangeBookmarks(user.id, data)),
	);

export const recordVisit = createServerFn({ method: "POST" })
	.validator(library.idInput)
	.handler(({ data }) =>
		runAuthed((user) => library.recordVisit(user.id, data)),
	);

export const importBookmarks = createServerFn({ method: "POST" })
	.validator(library.importBookmarksInput)
	.handler(({ data }) =>
		runAuthed((user) => library.importBookmarks(user.id, data)),
	);

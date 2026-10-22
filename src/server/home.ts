import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { z } from "zod";
import { InvalidInput } from "#/lib/effect/errors";
import * as agent from "./agent";
import * as customWidgets from "./custom-widgets";
import * as library from "./library";
import * as marketplace from "./marketplace";
import * as reader from "./reader";
import * as report from "./report";
import { runAuthed, runServer } from "./runtime";
import * as sharing from "./sharing";
import * as themes from "./themes";
import * as widgetMemory from "./widget-memory";
import * as widgets from "./widgets";

/* RPC surface for the web app. All logic lives in ./library (shared with MCP). */

export const getHome = createServerFn().handler(() =>
	runAuthed((user) =>
		library.loadHome(user.id).pipe(Effect.map(library.clientHome)),
	),
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
	.handler(({ data }) => runAuthed((user) => library.lookupUrl(data, user.id)));

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
	.validator(library.deleteBookmarkInput)
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

export const createFolder = createServerFn({ method: "POST" })
	.validator(library.createFolderInput)
	.handler(({ data }) =>
		runAuthed((user) => library.createFolder(user.id, data)),
	);

export const arrangeFolder = createServerFn({ method: "POST" })
	.validator(library.arrangeFolderInput)
	.handler(({ data }) =>
		runAuthed((user) => library.arrangeFolder(user.id, data)),
	);

export const refreshPreview = createServerFn({ method: "POST" })
	.validator(library.idInput)
	.handler(({ data }) =>
		runAuthed((user) => library.refreshPreview(user.id, data)),
	);

export const bulkCreateBookmarks = createServerFn({ method: "POST" })
	.validator(library.bulkCreateInput)
	.handler(({ data }) =>
		runAuthed((user) => library.bulkCreateBookmarks(user.id, data)),
	);

export const listActivity = createServerFn()
	.validator(library.activityInput)
	.handler(({ data }) =>
		runAuthed((user) => library.listActivity(user.id, data)),
	);

export const undo = createServerFn({ method: "POST" })
	.validator(library.undoInput)
	.handler(({ data }) => runAuthed((user) => library.undo(user.id, data)));

export const listTrash = createServerFn().handler(() =>
	runAuthed((user) => library.listTrash(user.id)),
);

export const restoreFromTrash = createServerFn({ method: "POST" })
	.validator(library.trashItemInput)
	.handler(({ data }) =>
		runAuthed((user) => library.restoreFromTrash(user.id, data)),
	);

export const deleteForever = createServerFn({ method: "POST" })
	.validator(library.trashItemInput)
	.handler(({ data }) =>
		runAuthed((user) => library.deleteForever(user.id, data)),
	);

export const emptyTrash = createServerFn({ method: "POST" }).handler(() =>
	runAuthed((user) => library.emptyTrash(user.id)),
);

export const listDuplicates = createServerFn().handler(() =>
	runAuthed((user) => library.listDuplicates(user.id)),
);

export const searchContent = createServerFn()
	.validator(library.searchInput)
	.handler(({ data }) =>
		runAuthed((user) => library.searchContent(user.id, data)),
	);

export const listLinkHealth = createServerFn().handler(() =>
	runAuthed((user) => library.listLinkHealth(user.id)),
);

export const checkLinks = createServerFn({ method: "POST" })
	.validator(library.checkLinksInput)
	.handler(({ data }) =>
		runAuthed((user) => library.checkLinks(user.id, data)),
	);

export const monthlyReport = createServerFn()
	.validator(report.reportInput)
	.handler(({ data }) =>
		runAuthed((user) => report.monthlyReport(user.id, data)),
	);

/* Widgets: data is fetched server-side and cached; signed-in users only. */

export const geocodePlace = createServerFn()
	.validator(widgets.geocodeInput)
	.handler(({ data }) => runAuthed(() => widgets.geocode(data)));

// Each result is also remembered for the next home page render (widget-memory).
const { remembering } = widgetMemory;

export const getWeather = createServerFn()
	.validator(widgets.weatherInput)
	.handler(({ data }) =>
		runAuthed((user) =>
			widgets.weather(data).pipe(remembering(user.id, "weather", data)),
		),
	);

export const getQuotes = createServerFn()
	.validator(widgets.quotesInput)
	.handler(({ data }) =>
		runAuthed((user) =>
			widgets.quotes(data).pipe(remembering(user.id, "quotes", data)),
		),
	);

export const getCalendar = createServerFn()
	.validator(widgets.calendarInput)
	.handler(({ data }) =>
		runAuthed((user) =>
			widgets.calendar(data).pipe(remembering(user.id, "calendar", data)),
		),
	);

export const getFeed = createServerFn()
	.validator(widgets.feedInput)
	.handler(({ data }) =>
		runAuthed((user) =>
			widgets.feed(data).pipe(remembering(user.id, "feed", data)),
		),
	);

export const getJsonData = createServerFn()
	.validator(widgets.jsonInput)
	.handler(({ data }) =>
		runAuthed((user) =>
			widgets.json(user.id, data).pipe(remembering(user.id, "json", data)),
		),
	);

/** The latest widget results, for the home page's server render. */
export const getWidgetSnapshot = createServerFn().handler(() =>
	runAuthed((user) => widgetMemory.recall(user.id)),
);

export const listCustomWidgets = createServerFn().handler(() =>
	runAuthed((user) => customWidgets.listCustomWidgets(user.id)),
);

export const saveCustomWidget = createServerFn({ method: "POST" })
	.validator(customWidgets.saveCustomWidgetInput)
	.handler(({ data }) =>
		runAuthed((user) => customWidgets.saveCustomWidget(user.id, data)),
	);

export const deleteCustomWidget = createServerFn({ method: "POST" })
	.validator(library.idInput)
	.handler(({ data }) =>
		runAuthed((user) => customWidgets.deleteCustomWidget(user.id, data.id)),
	);

export const saveWidget = createServerFn({ method: "POST" })
	.validator(library.saveWidgetInput)
	.handler(({ data }) =>
		runAuthed((user) => library.saveWidget(user.id, data)),
	);

/* Sharing: public links and collaborators. */

export const setBoardPublic = createServerFn({ method: "POST" })
	.validator(sharing.setPublicInput)
	.handler(({ data }) => runAuthed((user) => sharing.setPublic(user.id, data)));

/** Public: anyone with the link can read a shared board. */
export const getPublicBoard = createServerFn()
	.validator(z.object({ slug: z.string().min(4).max(32) }))
	.handler(({ data }) => runServer(sharing.getPublicBoard(data.slug)));

export const copyPublicBoard = createServerFn({ method: "POST" })
	.validator(sharing.copyPublicInput)
	.handler(({ data }) =>
		runAuthed((user) => sharing.copyPublicBoard(user.id, data)),
	);

export const listBoardMembers = createServerFn()
	.validator(z.object({ boardId: library.idSchema }))
	.handler(({ data }) =>
		runAuthed((user) => sharing.listMembers(user.id, data.boardId)),
	);

export const inviteBoardMember = createServerFn({ method: "POST" })
	.validator(sharing.inviteInput)
	.handler(({ data }) =>
		runAuthed((user) => sharing.inviteMember(user.id, data)),
	);

export const updateBoardMember = createServerFn({ method: "POST" })
	.validator(sharing.memberInput)
	.handler(({ data }) =>
		runAuthed((user) => sharing.updateMember(user.id, data)),
	);

export const removeBoardMember = createServerFn({ method: "POST" })
	.validator(sharing.memberInput)
	.handler(({ data }) =>
		runAuthed((user) => sharing.removeMember(user.id, data)),
	);

/* Community themes. */

export const listThemes = createServerFn()
	.validator(themes.listThemesInput)
	.handler(({ data }) => runAuthed((user) => themes.listThemes(user.id, data)));

export const publishTheme = createServerFn({ method: "POST" })
	.validator(themes.publishThemeInput)
	.handler(({ data }) =>
		runAuthed((user) => themes.publishTheme(user.id, data)),
	);

export const applyTheme = createServerFn({ method: "POST" })
	.validator(themes.themeIdInput)
	.handler(({ data }) => runAuthed((user) => themes.applyTheme(user.id, data)));

export const deleteTheme = createServerFn({ method: "POST" })
	.validator(themes.themeIdInput)
	.handler(({ data }) =>
		runAuthed((user) => themes.deleteTheme(user.id, data)),
	);

/* Read later and the reader view. */

export const getArticle = createServerFn()
	.validator(reader.idInput)
	.handler(({ data }) => runAuthed((user) => reader.getArticle(user.id, data)));

export const getReadingList = createServerFn().handler(() =>
	runAuthed((user) =>
		reader.readingList(user.id).pipe(remembering(user.id, "reading-list")),
	),
);

export const saveForLater = createServerFn({ method: "POST" })
	.validator(reader.readLaterInput)
	.handler(({ data }) =>
		runAuthed((user) => reader.saveForLater(user.id, data)),
	);

export const saveReadingProgress = createServerFn({ method: "POST" })
	.validator(reader.progressInput)
	.handler(({ data }) =>
		runAuthed((user) => reader.saveProgress(user.id, data)),
	);

export const markRead = createServerFn({ method: "POST" })
	.validator(reader.markReadInput)
	.handler(({ data }) => runAuthed((user) => reader.markRead(user.id, data)));

export const addHighlight = createServerFn({ method: "POST" })
	.validator(reader.highlightInput)
	.handler(({ data }) =>
		runAuthed((user) => reader.addHighlight(user.id, data)),
	);

export const removeHighlight = createServerFn({ method: "POST" })
	.validator(reader.removeHighlightInput)
	.handler(({ data }) =>
		runAuthed((user) => reader.removeHighlight(user.id, data)),
	);

/* The widget marketplace. */

export const listSharedWidgets = createServerFn()
	.validator(marketplace.listSharedInput)
	.handler(({ data }) =>
		runAuthed((user) => marketplace.listShared(user.id, data)),
	);

export const publishWidget = createServerFn({ method: "POST" })
	.validator(marketplace.publishInput)
	.handler(({ data }) =>
		runAuthed((user) => marketplace.publish(user.id, data)),
	);

export const installSharedWidget = createServerFn({ method: "POST" })
	.validator(marketplace.sharedIdInput)
	.handler(({ data }) =>
		runAuthed((user) => marketplace.install(user.id, data)),
	);

export const unpublishWidget = createServerFn({ method: "POST" })
	.validator(marketplace.sharedIdInput)
	.handler(({ data }) =>
		runAuthed((user) => marketplace.unpublish(user.id, data)),
	);

/* Natural-language commands (⌘K → Ask AI). */

export const runCommand = createServerFn({ method: "POST" })
	.validator(agent.commandInput)
	.handler(({ data }) =>
		runAuthed((user) =>
			Effect.tryPromise({
				try: () => agent.runCommand(user.id, data),
				catch: (error) => {
					console.error("AI command failed", error);
					return new InvalidInput({
						message:
							error instanceof Error && /ANTHROPIC_API_KEY/.test(error.message)
								? error.message
								: "The AI couldn't finish that. Try again in a moment.",
					});
				},
			}),
		),
	);

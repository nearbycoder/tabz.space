import { McpServer } from "@modelcontextprotocol/server";
import { Effect } from "effect";
import { z } from "zod";
import type { Bookmark } from "#/db/schema";
import type { AppError } from "#/lib/effect/errors";
import { NotFound } from "#/lib/effect/errors";
import {
	ACCENTS,
	boardLayoutSchema,
	SEARCH_ENGINES,
	SMART_SORTS,
	smartRulesSchema,
	TILE_STYLES,
} from "#/lib/preferences";
import * as capture from "../capture";
import * as library from "../library";
import { runServer } from "../runtime";

/*
 * MCP tools over the same library programs the web app uses. Each request
 * builds a server bound to the OAuth-authenticated user, so a tool can only
 * ever touch that user's data.
 */

const INSTRUCTIONS = `tabz.space is the user's browser start page: boards (pages) contain groups (sections) that contain bookmarks and folders (one level deep).
Call get_library first to learn board/group/folder ids. add_bookmark can target a group or folder by name and creates it if missing.
Changes show up on the user's start page immediately.`;

type Home = Effect.Success<ReturnType<typeof library.loadHome>>;

const text = (value: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

/** Runs a library program and maps failures to a tool error the model can read. */
async function run<A>(
	program: Effect.Effect<A, AppError>,
	shape: (value: A) => unknown = (v) => v,
) {
	try {
		return text(shape(await runServer(program)));
	} catch (error) {
		return {
			isError: true,
			content: [
				{
					type: "text" as const,
					text: error instanceof Error ? error.message : "Something went wrong",
				},
			],
		};
	}
}

const compactBookmark = (bookmark: Bookmark) => ({
	id: bookmark.id,
	title: bookmark.title,
	url: bookmark.url,
	...(bookmark.description ? { description: bookmark.description } : {}),
	...(bookmark.tags.length ? { tags: bookmark.tags } : {}),
	...(bookmark.visitCount ? { visits: bookmark.visitCount } : {}),
});

const compactLibrary = (home: Home, boardId?: string) => ({
	activeBoardId: home.settings.activeBoardId ?? home.boards[0]?.id ?? null,
	boards: home.boards
		.filter((board) => !boardId || board.id === boardId)
		.map((board) => ({
			id: board.id,
			name: board.name,
			icon: board.icon,
			layout: board.layout,
			groups: board.groups.map((group) => ({
				id: group.id,
				name: group.name,
				color: group.color,
				...(group.kind === "widget" && group.options.widget
					? {
							widget: group.options.widget.type,
							...(group.options.widget.type === "notes"
								? { notes: group.options.widget.text }
								: group.options.widget.type === "todo"
									? { todos: group.options.widget.items }
									: {}),
						}
					: {}),
				...(group.kind === "smart"
					? {
							smart: group.options.smart,
							note: "fills itself; can't add links",
						}
					: {}),
				items: group.bookmarks.map((item) =>
					item.kind === "folder"
						? {
								folderId: item.id,
								folder: item.title,
								icon: item.icon,
								bookmarks: item.children.map(compactBookmark),
							}
						: compactBookmark(item),
				),
			})),
		})),
});

const findBoard = (home: Home, ref?: string) => {
	if (!ref)
		return (
			home.boards.find((b) => b.id === home.settings.activeBoardId) ??
			home.boards[0]
		);
	const lower = ref.toLowerCase();
	return home.boards.find(
		(b) => b.id === ref || b.name.toLowerCase() === lower,
	);
};

const colorInput = z
	.string()
	.regex(/^#[0-9a-fA-F]{6}$/)
	.optional()
	.describe(`Hex color, e.g. ${ACCENTS.slice(0, 3).join(", ")}`);

export function createTabzMcpServer(userId: string) {
	const server = new McpServer(
		{
			name: "tabz.space",
			title: "Tabz",
			version: "0.1.0",
			websiteUrl: "https://tabz.space",
		},
		{ instructions: INSTRUCTIONS },
	);

	server.registerTool(
		"get_library",
		{
			title: "Get bookmark library",
			description:
				"List boards, their groups and bookmarks (with ids). Optionally limit to one board.",
			inputSchema: z.object({
				boardId: z.string().optional().describe("Only return this board"),
			}),
			annotations: { readOnlyHint: true },
		},
		({ boardId }) =>
			run(library.loadHome(userId), (home) => compactLibrary(home, boardId)),
	);

	server.registerTool(
		"search_bookmarks",
		{
			title: "Search bookmarks",
			description:
				"Find bookmarks whose title, URL, description or tags contain all query words, plus bookmarks whose saved page text matches (the passage is in matchedText).",
			inputSchema: library.searchInput,
			annotations: { readOnlyHint: true },
		},
		(input) =>
			run(library.searchBookmarks(userId, input), (results) =>
				results.map(({ bookmark, board, group, folder, snippet }) => ({
					...compactBookmark(bookmark),
					...(snippet ? { matchedText: snippet } : {}),
					board,
					group,
					...(folder ? { folder, folderId: bookmark.parentId } : {}),
					groupId: bookmark.groupId,
				})),
			),
	);

	server.registerTool(
		"add_bookmark",
		{
			title: "Add bookmark",
			description:
				"Save a URL. Target a group by groupId or by group name (created if missing) on a board (id or name; defaults to the active board). Optionally put it in a folder by folderId or folder name (created in that group if missing). Title, description and preview image are fetched from the page when omitted.",
			inputSchema: z.object({
				url: z.string().max(2048),
				title: z.string().max(200).optional(),
				description: z.string().max(500).optional(),
				tags: z.array(z.string().max(32)).max(20).optional(),
				groupId: z.string().optional(),
				group: z
					.string()
					.max(60)
					.optional()
					.describe("Group name, e.g. 'Reading list'"),
				board: z.string().optional().describe("Board id or name"),
				folderId: z.string().optional(),
				folder: z
					.string()
					.max(60)
					.optional()
					.describe("Folder name, e.g. 'Recipes'"),
			}),
			annotations: { openWorldHint: true },
		},
		(input) =>
			run(capture.smartAdd(userId, input), (bookmark) => ({
				...compactBookmark(bookmark),
				groupId: bookmark.groupId,
				folderId: bookmark.parentId,
			})),
	);

	server.registerTool(
		"update_bookmark",
		{
			title: "Update bookmark",
			description:
				"Edit a bookmark or folder: URL, title, description, tags, color, icon, always-incognito, or move it to another group or into/out of a folder.",
			inputSchema: z.object({
				id: z.string(),
				url: z.string().max(2048).optional(),
				title: z.string().max(200).optional(),
				description: z.string().max(500).nullable().optional(),
				tags: z.array(z.string().max(32)).max(20).optional(),
				groupId: z.string().optional().describe("Move to this group"),
				parentId: z
					.string()
					.nullable()
					.optional()
					.describe("Move into this folder; null moves it out of its folder"),
				color: colorInput.nullable(),
				icon: z
					.string()
					.max(2048)
					.nullable()
					.optional()
					.describe("Emoji or image URL"),
				incognito: z
					.boolean()
					.optional()
					.describe(
						"Always open in a private window. On a folder, applies to everything inside it.",
					),
			}),
			annotations: { idempotentHint: true },
		},
		(input) =>
			run(library.updateBookmark(userId, input), (bookmark) => ({
				...compactBookmark(bookmark),
				groupId: bookmark.groupId,
			})),
	);

	server.registerTool(
		"delete_bookmark",
		{
			title: "Delete bookmark or folder",
			description:
				"Permanently delete a bookmark or folder. Deleting a folder keeps its links (moved back into the group) unless withContents is true.",
			inputSchema: library.deleteBookmarkInput,
			annotations: { destructiveHint: true },
		},
		(input) => run(library.deleteBookmark(userId, input)),
	);

	server.registerTool(
		"reorder_bookmarks",
		{
			title: "Reorder bookmarks",
			description:
				"Set the exact order of bookmarks in a group. Ids from other groups are moved into it.",
			inputSchema: z.object({
				groupId: z.string(),
				ids: z.array(z.string()).max(500),
			}),
			annotations: { idempotentHint: true },
		},
		({ groupId, ids }) =>
			run(library.arrangeBookmarks(userId, { groups: [{ groupId, ids }] })),
	);

	server.registerTool(
		"create_folder",
		{
			title: "Create folder",
			description:
				"Create a folder inside a group, optionally moving existing bookmarks into it.",
			inputSchema: library.createFolderInput,
		},
		(input) =>
			run(library.createFolder(userId, input), (folder) => ({
				folderId: folder.id,
				title: folder.title,
				groupId: folder.groupId,
			})),
	);

	server.registerTool(
		"arrange_folder",
		{
			title: "Arrange folder",
			description:
				"Set the exact order of bookmarks inside a folder. Bookmark ids from elsewhere are moved in.",
			inputSchema: library.arrangeFolderInput,
			annotations: { idempotentHint: true },
		},
		(input) => run(library.arrangeFolder(userId, input)),
	);

	server.registerTool(
		"create_group",
		{
			title: "Create group",
			description:
				"Add a group (section) to a board. Defaults to the active board. Pass `smart` to make a smart group that fills itself from every board (most visited, recently opened, newest, not opened in a while, unread feeds or broken links), optionally filtered by tags, text or board.",
			inputSchema: z.object({
				name: z.string().min(1).max(60),
				boardId: z.string().optional(),
				color: colorInput,
				smart: smartRulesSchema
					.partial({ limit: true })
					.optional()
					.describe(
						`Smart group rules. sort: ${Object.keys(SMART_SORTS).join(" | ")}`,
					),
			}),
		},
		({ name, boardId, color, smart }) =>
			run(
				Effect.gen(function* () {
					const home = yield* library.loadHome(userId);
					const board = findBoard(home, boardId);
					if (!board) return yield* new NotFound({ entity: "Board" });
					return yield* library.createGroup(userId, {
						boardId: board.id,
						name,
						color,
						...(smart
							? {
									kind: "smart" as const,
									options: { smart: { limit: 12, ...smart } },
								}
							: {}),
					});
				}),
				(group) => ({ id: group.id, name: group.name, boardId: group.boardId }),
			),
	);

	server.registerTool(
		"update_group",
		{
			title: "Update group",
			description:
				"Rename, recolor, collapse, restyle or move a group to another board.",
			inputSchema: z.object({
				id: z.string(),
				name: z.string().min(1).max(60).optional(),
				color: colorInput.nullable(),
				collapsed: z.boolean().optional(),
				boardId: z.string().optional(),
				tileStyle: z.enum(TILE_STYLES).optional(),
			}),
			annotations: { idempotentHint: true },
		},
		({ tileStyle, ...input }) =>
			run(
				library.updateGroup(userId, {
					...input,
					options: tileStyle ? { tileStyle } : undefined,
				}),
				(group) => ({
					id: group.id,
					name: group.name,
					boardId: group.boardId,
				}),
			),
	);

	server.registerTool(
		"delete_group",
		{
			title: "Delete group",
			description: "Permanently delete a group and every bookmark in it.",
			inputSchema: library.idInput,
			annotations: { destructiveHint: true },
		},
		(input) => run(library.deleteGroup(userId, input)),
	);

	server.registerTool(
		"create_board",
		{
			title: "Create board",
			description:
				"Add a board (a tab on the start page) with an empty 'Bookmarks' group.",
			inputSchema: library.createBoardInput,
		},
		(input) =>
			run(library.createBoard(userId, input), ({ board, group }) => ({
				id: board.id,
				name: board.name,
				groupId: group.id,
			})),
	);

	server.registerTool(
		"update_board",
		{
			title: "Update board",
			description:
				"Rename a board, change its emoji icon, or change its grid layout.",
			inputSchema: z.object({
				id: z.string(),
				name: z.string().min(1).max(60).optional(),
				icon: z.string().max(16).nullable().optional(),
				layout: boardLayoutSchema.partial().optional(),
			}),
			annotations: { idempotentHint: true },
		},
		(input) =>
			run(library.updateBoard(userId, input), (board) => ({
				id: board.id,
				name: board.name,
				icon: board.icon,
				layout: board.layout,
			})),
	);

	server.registerTool(
		"delete_board",
		{
			title: "Delete board",
			description:
				"Permanently delete a board with all its groups and bookmarks. The last board can't be deleted.",
			inputSchema: library.idInput,
			annotations: { destructiveHint: true },
		},
		(input) => run(library.deleteBoard(userId, input)),
	);

	server.registerTool(
		"find_broken_links",
		{
			title: "Find broken links",
			description:
				"List bookmarks whose last health check found them broken (gone or unreachable twice in a row) or moved to another page on the same site (with the new location). Set check=true to re-check the least recently checked links first (slower).",
			inputSchema: z.object({ check: z.boolean().optional() }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		({ check }) =>
			run(
				Effect.gen(function* () {
					if (check) yield* library.checkLinks(userId, {});
					return yield* library.listLinkHealth(userId);
				}),
			),
	);

	server.registerTool(
		"update_settings",
		{
			title: "Update start page settings",
			description:
				"Change theme, accent color, search engine, clock/greeting visibility, or the active board.",
			inputSchema: z.object({
				theme: z.enum(["system", "light", "dark"]).optional(),
				accent: colorInput,
				searchEngine: z
					.enum(Object.keys(SEARCH_ENGINES) as [keyof typeof SEARCH_ENGINES])
					.optional(),
				showSearch: z.boolean().optional(),
				showClock: z.boolean().optional(),
				showGreeting: z.boolean().optional(),
				clockFormat: z.enum(["12h", "24h"]).optional(),
				openInNewTab: z.boolean().optional(),
				activeBoardId: z.string().optional(),
			}),
			annotations: { idempotentHint: true },
		},
		(input) => run(library.saveSettings(userId, input)),
	);

	return server;
}

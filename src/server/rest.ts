import { Effect } from "effect";
import type { z } from "zod";
import { type AppError, InvalidInput, NotFound } from "#/lib/effect/errors";
import { authenticateToken } from "./api-tokens";
import * as capture from "./capture";
import * as library from "./library";
import { corsHeaders, runJson } from "./runtime";

/*
 * REST API v1 (Bearer token). Thin adapter over the same library programs as
 * the web app and MCP. Vault boards are never reachable here.
 */

type Ctx = {
	userId: string;
	body: unknown;
	params: Record<string, string>;
	search: URLSearchParams;
};
type Handler = (ctx: Ctx) => Effect.Effect<unknown, AppError>;
type Route = {
	method: string;
	pattern: RegExp;
	keys: string[];
	handler: Handler;
};

const routes: Route[] = [];
const route = (method: string, path: string, handler: Handler) => {
	const keys: string[] = [];
	const pattern = new RegExp(
		`^${path.replace(/:(\w+)/g, (_, key) => {
			keys.push(key);
			return "([^/]+)";
		})}/?$`,
	);
	routes.push({ method, pattern, keys, handler });
};

const parse = <S extends z.ZodType>(
	schema: S,
	value: unknown,
): Effect.Effect<z.infer<S>, InvalidInput> => {
	const result = schema.safeParse(value);
	return result.success
		? Effect.succeed(result.data as z.infer<S>)
		: Effect.fail(
				new InvalidInput({
					message: result.error.issues
						.map(
							(issue) => `${issue.path.join(".") || "body"}: ${issue.message}`,
						)
						.join("; "),
				}),
			);
};

const compact = (bookmark: {
	id: string;
	title: string;
	url: string;
	kind: string;
	tags: string[];
	description: string | null;
	groupId: string;
	parentId: string | null;
	createdAt: Date;
}) => ({
	id: bookmark.id,
	kind: bookmark.kind,
	title: bookmark.title,
	url: bookmark.url,
	description: bookmark.description,
	tags: bookmark.tags,
	groupId: bookmark.groupId,
	folderId: bookmark.parentId,
	createdAt: bookmark.createdAt,
});

route("GET", "/me", ({ userId }) => Effect.succeed({ userId }));

route("GET", "/library", ({ userId }) =>
	library.loadHome(userId).pipe(
		Effect.map((home) => ({
			boards: home.boards.map((board) => ({
				id: board.id,
				name: board.name,
				icon: board.icon,
				role: board.role,
				groups: board.groups.map((group) => ({
					id: group.id,
					name: group.name,
					kind: group.kind,
					items: group.bookmarks.map(function tree(
						item: library.TreeItem,
					): Record<string, unknown> {
						return { ...compact(item), children: item.children.map(tree) };
					}),
				})),
			})),
		})),
	),
);

route("GET", "/bookmarks", ({ userId, search }) => {
	const q = search.get("q");
	if (!q)
		return Effect.fail(new InvalidInput({ message: "Pass ?q= to search" }));
	return library
		.searchBookmarks(userId, {
			query: q,
			limit: Number(search.get("limit")) || 25,
		})
		.pipe(
			Effect.map((results) =>
				results.map(({ bookmark, board, group, folder }) => ({
					...compact(bookmark),
					board,
					group,
					folder,
				})),
			),
		);
});

route("POST", "/bookmarks", ({ userId, body }) =>
	parse(capture.smartAddInput, body).pipe(
		Effect.flatMap((data) => capture.smartAdd(userId, data)),
		Effect.map(compact),
	),
);

route("POST", "/bookmarks/bulk", ({ userId, body }) =>
	Effect.gen(function* () {
		const data = yield* parse(
			capture.smartAddInput
				.pick({ groupId: true, group: true, board: true })
				.extend({ urls: library.bulkCreateInput.shape.urls }),
			body,
		);
		let groupId = data.groupId;
		if (!groupId) {
			const home = yield* library.loadHome(userId);
			const board = capture.findBoard(home, data.board);
			if (!board) return yield* new NotFound({ entity: "Board" });
			groupId =
				board.groups.find(
					(g) =>
						g.kind === "links" &&
						(!data.group || g.name.toLowerCase() === data.group.toLowerCase()),
				)?.id ??
				(yield* library.createGroup(userId, {
					boardId: board.id,
					name: data.group ?? "Inbox",
				})).id;
		}
		return yield* library.bulkCreateBookmarks(userId, {
			groupId,
			urls: data.urls,
		});
	}),
);

route("PATCH", "/bookmarks/:id", ({ userId, body, params }) =>
	parse(library.updateBookmarkInput.omit({ id: true }), body).pipe(
		Effect.flatMap((data) =>
			library.updateBookmark(userId, { ...data, id: params.id }),
		),
		Effect.map(compact),
	),
);

route("DELETE", "/bookmarks/:id", ({ userId, params }) =>
	library.deleteBookmark(userId, { id: params.id }),
);

route("POST", "/groups", ({ userId, body }) =>
	parse(library.createGroupInput, body).pipe(
		Effect.flatMap((data) => library.createGroup(userId, data)),
	),
);

route("POST", "/tabs", ({ userId, body }) =>
	parse(capture.saveTabsInput, body).pipe(
		Effect.flatMap((data) => capture.saveTabsAsGroup(userId, data)),
	),
);

route("PUT", "/sync/browser", ({ userId, body }) =>
	parse(capture.browserSyncInput, body).pipe(
		Effect.flatMap((data) => capture.syncBrowserBookmarks(userId, data)),
	),
);

route("POST", "/undo", ({ userId }) => library.undo(userId, {}));

route("GET", "/activity", ({ userId }) =>
	library.listActivity(userId, { limit: 50 }),
);

/** Entry point for /api/v1/* requests. */
export async function handleRest(request: Request) {
	if (request.method === "OPTIONS")
		return new Response(null, { status: 204, headers: corsHeaders });
	const path = new URL(request.url).pathname.replace(/^\/api\/v1/, "") || "/";
	const search = new URL(request.url).searchParams;
	for (const candidate of routes) {
		if (candidate.method !== request.method) continue;
		const match = path.match(candidate.pattern);
		if (!match) continue;
		const params = Object.fromEntries(
			candidate.keys.map((key, index) => [
				key,
				decodeURIComponent(match[index + 1]),
			]),
		);
		const body = ["POST", "PATCH", "PUT"].includes(request.method)
			? await request.json().catch(() => ({}))
			: undefined;
		return runJson(
			authenticateToken(request.headers.get("authorization")).pipe(
				Effect.flatMap(({ userId }) =>
					candidate.handler({ userId, body, params, search }),
				),
			),
			{ status: request.method === "POST" ? 201 : 200 },
		);
	}
	return new Response(JSON.stringify({ error: "Not found" }), {
		status: 404,
		headers: { "content-type": "application/json", ...corsHeaders },
	});
}

import Anthropic from "@anthropic-ai/sdk";
import { Effect } from "effect";
import { z } from "zod";
import { type AppError, InvalidInput } from "#/lib/effect/errors";
import { aiEnabled } from "./ai";
import * as library from "./library";
import { runServer } from "./runtime";
import { VaultAccess } from "./vault-access";

/*
 * Natural-language commands from ⌘K ("move my recipe links into a Cooking
 * board"), run by Claude with a small set of tools over the same library
 * programs the app uses. Deliberately no deletes. Every change is recorded in
 * History like any other edit, so ⌘Z undoes them one at a time. Vault boards
 * and private (incognito) links are never shown to the model or touched.
 */

const MODEL = () => process.env.TABZ_AGENT_MODEL ?? "claude-opus-5-5";
const MAX_TURNS = 10;

type Home = Effect.Success<ReturnType<typeof library.loadHome>>;

const SYSTEM = `You organize the user's tabz.space start page: boards (pages) contain groups (sections) that contain links and folders (folders nest to any depth).
Do what the user asks using the tools. Call list_library first to learn ids, and search_links or list_group_links to find links.
You can create boards, groups and folders, move links, tag links, and rename things. You cannot delete anything; if asked to, say so and suggest the closest safe step (e.g. moving links into an "Archive" group).
Prefer reusing existing boards and groups when they clearly match. Keep names short.
When done, reply with one or two plain sentences saying what changed. No markdown.`;

const object = (
	properties: Record<string, unknown>,
	required = Object.keys(properties),
) => ({
	type: "object" as const,
	properties,
	required,
	additionalProperties: false,
});
const str = (description: string) => ({ type: "string", description });
const ids = (description: string) => ({
	type: "array",
	items: { type: "string" },
	description,
});

const TOOLS: Anthropic.Beta.BetaTool[] = [
	{
		name: "list_library",
		description:
			"Boards with their groups and folders (ids, names, link counts). Links themselves aren't listed; use search_links or list_group_links.",
		input_schema: object({}),
	},
	{
		name: "search_links",
		description:
			"Find links by words in their title, URL, description, tags or page text. Returns up to 40.",
		input_schema: object({ query: str("Words to look for") }),
	},
	{
		name: "list_group_links",
		description: "Every link in a group (with folder paths), up to 300.",
		input_schema: object({ group_id: str("Group id") }),
	},
	{
		name: "create_board",
		description: "Create a board (it comes with one empty group).",
		input_schema: object({ name: str("Board name") }),
	},
	{
		name: "create_group",
		description: "Create a links group on a board.",
		input_schema: object({
			board_id: str("Board id"),
			name: str("Group name"),
		}),
	},
	{
		name: "create_folder",
		description:
			"Create a folder in a group, optionally inside another folder.",
		input_schema: object({
			group_id: str("Group id"),
			title: str("Folder name"),
			parent_folder_id: str("Folder to create it in, or empty for top level"),
		}),
	},
	{
		name: "move_links",
		description:
			"Move links (or folders) into a group, optionally into a folder.",
		input_schema: object({
			link_ids: ids("Link or folder ids"),
			group_id: str("Destination group id"),
			folder_id: str("Destination folder id, or empty for the group itself"),
		}),
	},
	{
		name: "tag_links",
		description: "Add and/or remove tags on links.",
		input_schema: object({
			link_ids: ids("Link ids"),
			add: ids("Tags to add (lowercase, short)"),
			remove: ids("Tags to remove"),
		}),
	},
	{
		name: "rename",
		description: "Rename a board, group, folder or link.",
		input_schema: object({
			kind: { type: "string", enum: ["board", "group", "folder", "link"] },
			id: str("Its id"),
			name: str("New name"),
		}),
	},
].map((tool) => ({ ...tool, strict: true }));

/** Everything the agent may see: non-vault boards, minus private links. */
function visible(home: Home) {
	const isPrivate = home.settings.incognitoAll;
	const strip = (items: library.TreeItem[]): library.TreeItem[] =>
		isPrivate
			? []
			: items
					.filter((item) => !item.incognito)
					.map((item) => ({ ...item, children: strip(item.children) }));
	return home.boards
		.filter((board) => !board.vault && board.role !== "viewer")
		.map((board) => ({
			...board,
			groups: board.groups.map((group) => ({
				...group,
				bookmarks: strip(group.bookmarks),
			})),
		}));
}

const links = (items: library.TreeItem[]) =>
	library.walkTree(items).filter(({ item }) => item.kind === "link");

function summarize(home: Home) {
	return visible(home).map((board) => ({
		id: board.id,
		name: board.name,
		groups: board.groups.map((group) => ({
			id: group.id,
			name: group.name,
			kind: group.kind,
			links: links(group.bookmarks).length,
			folders: library
				.walkTree(group.bookmarks)
				.filter(({ item }) => item.kind === "folder")
				.map(({ item, path }) => ({
					id: item.id,
					path: [...path, item.title].join(" / "),
				})),
		})),
	}));
}

const linkInfo = (
	item: { id: string; title: string; url: string; tags: string[] },
	path: string[],
	where: Record<string, string> = {},
) => ({
	id: item.id,
	title: item.title,
	url: item.url,
	...where,
	...(path.length ? { folder: path.join(" / ") } : {}),
	...(item.tags.length ? { tags: item.tags } : {}),
});

type Input = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : "");
const list = (value: unknown) =>
	Array.isArray(value)
		? value.filter((v): v is string => typeof v === "string").slice(0, 200)
		: [];

/** Runs one tool call for the user; returns what to tell the model, plus a note for the UI. */
const runTool = (userId: string, name: string, input: Input) =>
	Effect.gen(function* () {
		const home = yield* library.loadHome(userId);
		const allowed = new Set(
			visible(home).flatMap((board) => [
				board.id,
				...board.groups.flatMap((group) => [
					group.id,
					...library.walkTree(group.bookmarks).map(({ item }) => item.id),
				]),
			]),
		);
		const check = (...values: string[]) => {
			for (const value of values)
				if (value && !allowed.has(value))
					return Effect.fail(
						new InvalidInput({ message: `Unknown or off-limits id: ${value}` }),
					);
			return Effect.void;
		};
		switch (name) {
			case "list_library":
				return { result: summarize(home) };
			case "search_links": {
				const found = yield* library.searchBookmarks(userId, {
					query: text(input.query).slice(0, 100) || " ",
					limit: 40,
				});
				return {
					result: found
						.filter((entry) => allowed.has(entry.bookmark.id) && !entry.private)
						.map((entry) => ({
							...linkInfo(entry.bookmark, [], {
								board: entry.board,
								group: entry.group,
							}),
							...(entry.folder ? { folder: entry.folder } : {}),
						})),
				};
			}
			case "list_group_links": {
				const group = visible(home)
					.flatMap((board) => board.groups)
					.find((g) => g.id === text(input.group_id));
				if (!group)
					return yield* new InvalidInput({ message: "No such group" });
				return {
					result: links(group.bookmarks)
						.slice(0, 300)
						.map(({ item, path }) => linkInfo(item, path)),
				};
			}
			case "create_board": {
				const { board, group } = yield* library.createBoard(userId, {
					name: text(input.name).slice(0, 60) || "New board",
				});
				return {
					result: { board_id: board.id, group_id: group.id },
					note: `Created board “${board.name}”`,
				};
			}
			case "create_group": {
				yield* check(text(input.board_id));
				const group = yield* library.createGroup(userId, {
					boardId: text(input.board_id),
					name: text(input.name).slice(0, 60) || "Links",
				});
				return {
					result: { group_id: group.id },
					note: `Created group “${group.name}”`,
				};
			}
			case "create_folder": {
				const parent = text(input.parent_folder_id);
				yield* check(text(input.group_id), parent);
				const folder = yield* library.createFolder(userId, {
					groupId: text(input.group_id),
					title: text(input.title).slice(0, 60) || "Folder",
					parentId: parent || undefined,
				});
				return {
					result: { folder_id: folder.id },
					note: `Created folder “${folder.title}”`,
				};
			}
			case "move_links": {
				const targets = list(input.link_ids);
				const folder = text(input.folder_id);
				yield* check(text(input.group_id), folder, ...targets);
				let moved = 0;
				for (const id of targets) {
					yield* library.updateBookmark(userId, {
						id,
						groupId: text(input.group_id),
						parentId: folder || null,
					});
					moved++;
				}
				return {
					result: { moved },
					note: `Moved ${moved} item${moved === 1 ? "" : "s"}`,
				};
			}
			case "tag_links": {
				const targets = list(input.link_ids);
				yield* check(...targets);
				const clean = (tags: string[]) =>
					tags
						.map((tag) => tag.trim().toLowerCase().slice(0, 32))
						.filter(Boolean);
				const add = clean(list(input.add));
				const remove = new Set(clean(list(input.remove)));
				const byId = new Map(
					library
						.walkTree(
							home.boards.flatMap((b) => b.groups).flatMap((g) => g.bookmarks),
						)
						.map(({ item }) => [item.id, item]),
				);
				let tagged = 0;
				for (const id of targets) {
					const item = byId.get(id);
					if (!item || item.kind !== "link") continue;
					const tags = [
						...new Set([...item.tags.filter((t) => !remove.has(t)), ...add]),
					].slice(0, 20);
					yield* library.updateBookmark(userId, { id, tags });
					tagged++;
				}
				return {
					result: { tagged },
					note: `Retagged ${tagged} link${tagged === 1 ? "" : "s"}`,
				};
			}
			case "rename": {
				const id = text(input.id);
				const value = text(input.name).trim().slice(0, 60);
				yield* check(id);
				if (!value) return yield* new InvalidInput({ message: "Empty name" });
				if (input.kind === "board")
					yield* library.updateBoard(userId, { id, name: value });
				else if (input.kind === "group")
					yield* library.updateGroup(userId, { id, name: value });
				else yield* library.updateBookmark(userId, { id, title: value });
				return { result: { ok: true }, note: `Renamed to “${value}”` };
			}
			default:
				return yield* new InvalidInput({ message: `Unknown tool ${name}` });
		}
	}).pipe(Effect.provideService(VaultAccess, null));

/** Runs a tool and never throws: failures go back to the model as errors. */
async function execute(userId: string, name: string, input: Input) {
	try {
		const { result, note } = (await runServer(
			runTool(userId, name, input) as Effect.Effect<
				{ result: unknown; note?: string },
				AppError
			>,
		)) as { result: unknown; note?: string };
		return { content: JSON.stringify(result), note, isError: false };
	} catch (error) {
		return {
			content: error instanceof Error ? error.message : "Something went wrong",
			note: undefined,
			isError: true,
		};
	}
}

export const commandInput = z.object({
	text: z.string().trim().min(3).max(1000),
});

/** After a mid-output fallback, blocks before the last switch point aren't echoed back. */
function echoable(content: Anthropic.Beta.BetaContentBlock[]) {
	const boundary = content.map((block) => block.type).lastIndexOf("fallback");
	if (boundary < 0) return content;
	return content.filter(
		(block, index) =>
			index > boundary ||
			!["thinking", "redacted_thinking", "tool_use"].includes(block.type),
	);
}

/** Runs a natural-language command against the user's library. */
export async function runCommand(
	userId: string,
	data: z.infer<typeof commandInput>,
) {
	if (!aiEnabled())
		throw new Error("AI commands need ANTHROPIC_API_KEY on the server");
	const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
	const messages: Anthropic.Beta.BetaMessageParam[] = [
		{ role: "user", content: data.text },
	];
	const actions: string[] = [];
	let reply = "";
	for (let turn = 0; turn < MAX_TURNS; turn++) {
		const response = await client.beta.messages.create({
			model: MODEL(),
			max_tokens: 8000,
			// Opus 5.5 can decline some requests; this re-runs those on
			// Anthropic's recommended fallback model instead.
			betas: ["server-side-fallback-2026-07-01"],
			fallbacks: "default",
			thinking: { type: "adaptive" },
			system: SYSTEM,
			tools: TOOLS,
			messages,
		});
		if (response.stop_reason === "refusal") {
			reply = "Sorry, I can't help with that one.";
			break;
		}
		const content = echoable(response.content);
		reply =
			content
				.filter((block) => block.type === "text")
				.map((block) => (block as Anthropic.Beta.BetaTextBlock).text)
				.join("\n")
				.trim() || reply;
		messages.push({ role: "assistant", content });
		if (response.stop_reason === "pause_turn") continue;
		const calls = content.filter(
			(block): block is Anthropic.Beta.BetaToolUseBlock =>
				block.type === "tool_use",
		);
		if (response.stop_reason !== "tool_use" || calls.length === 0) break;
		const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
		for (const call of calls) {
			const outcome = await execute(userId, call.name, call.input as Input);
			if (outcome.note) actions.push(outcome.note);
			results.push({
				type: "tool_result",
				tool_use_id: call.id,
				content: outcome.content,
				is_error: outcome.isError,
			});
		}
		messages.push({ role: "user", content: results });
		if (turn === MAX_TURNS - 1)
			reply ||= "I stopped partway; ask again to keep going.";
	}
	return { reply: reply || "Done.", actions };
}

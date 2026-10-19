import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { boards, bookmarks, groups, userSettings } from "#/db/schema";
import { InvalidInput, NotFound } from "#/lib/effect/errors";
import {
	boardLayoutSchema,
	DEFAULT_BOARD_LAYOUT,
	groupOptionsSchema,
	resolveLayout,
	resolveSettings,
	userSettingsSchema,
} from "#/lib/preferences";
import { faviconFor, normalizeUrl, titleFromUrl } from "#/lib/url";
import { fetchPageMetadata } from "./metadata";
import { query, runAuthed } from "./runtime";
import { STARTER_BOARD } from "./seed";

const idSchema = z.string().min(1).max(64);
const colorSchema = z
	.string()
	.regex(/^#[0-9a-f]{6}$/i)
	.nullable()
	.optional();

const requireUrl = (input: string) => {
	const url = normalizeUrl(input);
	return url
		? Effect.succeed(url)
		: Effect.fail(
				new InvalidInput({ message: "That doesn't look like a valid URL" }),
			);
};

/** Ensures a row exists and belongs to the user before it is mutated. */
const owned = <T>(entity: string, row: T | undefined) =>
	row ? Effect.succeed(row) : Effect.fail(new NotFound({ entity }));

const nextPosition = (
	table: typeof boards | typeof groups | typeof bookmarks,
	where: ReturnType<typeof eq>,
) =>
	query((db) =>
		db
			.select({ max: sql<number>`coalesce(max(${table.position}), -1)` })
			.from(table)
			.where(where),
	).pipe(Effect.map(([row]) => Number(row?.max ?? -1) + 1));

const seedStarterBoard = (userId: string) =>
	query((db) =>
		db.transaction(async (tx) => {
			const [board] = await tx
				.insert(boards)
				.values({
					userId,
					name: STARTER_BOARD.name,
					icon: STARTER_BOARD.icon,
					layout: STARTER_BOARD.layout,
				})
				.returning();
			for (const [groupIndex, group] of STARTER_BOARD.groups.entries()) {
				const [created] = await tx
					.insert(groups)
					.values({
						userId,
						boardId: board.id,
						name: group.name,
						color: group.color,
						position: groupIndex,
					})
					.returning();
				await tx.insert(bookmarks).values(
					group.bookmarks.map((bookmark, index) => ({
						userId,
						groupId: created.id,
						title: bookmark.title,
						url: bookmark.url,
						position: index,
						meta: { favicon: faviconFor(bookmark.url) },
					})),
				);
			}
		}),
	);

const loadHome = (userId: string) =>
	Effect.gen(function* () {
		const load = query((db) =>
			Promise.all([
				db.query.boards.findMany({
					where: eq(boards.userId, userId),
					orderBy: [asc(boards.position), asc(boards.createdAt)],
				}),
				db.query.groups.findMany({
					where: eq(groups.userId, userId),
					orderBy: [asc(groups.position), asc(groups.createdAt)],
				}),
				db.query.bookmarks.findMany({
					where: eq(bookmarks.userId, userId),
					orderBy: [asc(bookmarks.position), asc(bookmarks.createdAt)],
				}),
				db.query.userSettings.findFirst({
					where: eq(userSettings.userId, userId),
				}),
			]),
		);
		let [boardRows, groupRows, bookmarkRows, settingsRow] = yield* load;
		if (boardRows.length === 0) {
			yield* seedStarterBoard(userId);
			[boardRows, groupRows, bookmarkRows, settingsRow] = yield* load;
		}
		return {
			settings: resolveSettings(settingsRow?.settings),
			boards: boardRows.map((board) => ({
				...board,
				layout: resolveLayout(board.layout),
				groups: groupRows
					.filter((group) => group.boardId === board.id)
					.map((group) => ({
						...group,
						bookmarks: bookmarkRows.filter(
							(bookmark) => bookmark.groupId === group.id,
						),
					})),
			})),
		};
	});

export type HomeData = Awaited<ReturnType<typeof getHome>>;
export type HomeBoard = HomeData["boards"][number];
export type HomeGroup = HomeBoard["groups"][number];
export type HomeBookmark = HomeGroup["bookmarks"][number];

export const getHome = createServerFn().handler(() =>
	runAuthed((user) => loadHome(user.id)),
);

export const saveSettings = createServerFn({ method: "POST" })
	.validator(userSettingsSchema.partial())
	.handler(({ data }) =>
		runAuthed((user) =>
			Effect.gen(function* () {
				const existing = yield* query((db) =>
					db.query.userSettings.findFirst({
						where: eq(userSettings.userId, user.id),
					}),
				);
				const settings = resolveSettings({ ...existing?.settings, ...data });
				yield* query((db) =>
					db
						.insert(userSettings)
						.values({ userId: user.id, settings })
						.onConflictDoUpdate({
							target: userSettings.userId,
							set: { settings, updatedAt: new Date() },
						}),
				);
				return settings;
			}),
		),
	);

/* ---------------------------------- boards --------------------------------- */

export const createBoard = createServerFn({ method: "POST" })
	.validator(
		z.object({
			name: z.string().trim().min(1).max(60),
			icon: z.string().max(16).nullish(),
		}),
	)
	.handler(({ data }) =>
		runAuthed((user) =>
			Effect.gen(function* () {
				const position = yield* nextPosition(
					boards,
					eq(boards.userId, user.id),
				);
				const [board] = yield* query((db) =>
					db
						.insert(boards)
						.values({
							userId: user.id,
							name: data.name,
							icon: data.icon ?? null,
							position,
							layout: DEFAULT_BOARD_LAYOUT,
						})
						.returning(),
				);
				const [group] = yield* query((db) =>
					db
						.insert(groups)
						.values({ userId: user.id, boardId: board.id, name: "Bookmarks" })
						.returning(),
				);
				return { board, group };
			}),
		),
	);

export const updateBoard = createServerFn({ method: "POST" })
	.validator(
		z.object({
			id: idSchema,
			name: z.string().trim().min(1).max(60).optional(),
			icon: z.string().max(16).nullish(),
			layout: boardLayoutSchema.partial().optional(),
		}),
	)
	.handler(({ data }) =>
		runAuthed((user) =>
			Effect.gen(function* () {
				const board = yield* query((db) =>
					db.query.boards.findFirst({
						where: and(eq(boards.id, data.id), eq(boards.userId, user.id)),
					}),
				).pipe(Effect.flatMap((row) => owned("Board", row)));
				const [updated] = yield* query((db) =>
					db
						.update(boards)
						.set({
							name: data.name ?? board.name,
							icon: data.icon === undefined ? board.icon : data.icon,
							layout: data.layout
								? resolveLayout({ ...board.layout, ...data.layout })
								: board.layout,
						})
						.where(eq(boards.id, board.id))
						.returning(),
				);
				return updated;
			}),
		),
	);

export const deleteBoard = createServerFn({ method: "POST" })
	.validator(z.object({ id: idSchema }))
	.handler(({ data }) =>
		runAuthed((user) =>
			Effect.gen(function* () {
				const remaining = yield* query((db) =>
					db.$count(boards, eq(boards.userId, user.id)),
				);
				if (remaining <= 1)
					return yield* new InvalidInput({
						message: "You need at least one board",
					});
				yield* query((db) =>
					db
						.delete(boards)
						.where(and(eq(boards.id, data.id), eq(boards.userId, user.id))),
				);
				return { ok: true };
			}),
		),
	);

/** Persists a full ordering in one transaction (used by drag & drop). */
const reorder = (
	table: typeof boards | typeof groups,
	userId: string,
	ids: string[],
) =>
	query((db) =>
		db.transaction(async (tx) => {
			for (const [position, id] of ids.entries()) {
				await tx
					.update(table)
					.set({ position })
					.where(and(eq(table.id, id), eq(table.userId, userId)));
			}
		}),
	);

export const reorderBoards = createServerFn({ method: "POST" })
	.validator(z.object({ ids: z.array(idSchema).max(200) }))
	.handler(({ data }) =>
		runAuthed((user) =>
			reorder(boards, user.id, data.ids).pipe(Effect.as({ ok: true })),
		),
	);

/* ---------------------------------- groups --------------------------------- */

export const createGroup = createServerFn({ method: "POST" })
	.validator(
		z.object({
			boardId: idSchema,
			name: z.string().trim().min(1).max(60),
			color: colorSchema,
		}),
	)
	.handler(({ data }) =>
		runAuthed((user) =>
			Effect.gen(function* () {
				yield* query((db) =>
					db.query.boards.findFirst({
						where: and(eq(boards.id, data.boardId), eq(boards.userId, user.id)),
					}),
				).pipe(Effect.flatMap((row) => owned("Board", row)));
				const position = yield* nextPosition(
					groups,
					eq(groups.boardId, data.boardId),
				);
				const [group] = yield* query((db) =>
					db
						.insert(groups)
						.values({
							userId: user.id,
							boardId: data.boardId,
							name: data.name,
							color: data.color ?? null,
							position,
						})
						.returning(),
				);
				return group;
			}),
		),
	);

export const updateGroup = createServerFn({ method: "POST" })
	.validator(
		z.object({
			id: idSchema,
			name: z.string().trim().min(1).max(60).optional(),
			color: colorSchema,
			collapsed: z.boolean().optional(),
			boardId: idSchema.optional(),
			options: groupOptionsSchema.optional(),
		}),
	)
	.handler(({ data }) =>
		runAuthed((user) =>
			Effect.gen(function* () {
				const group = yield* query((db) =>
					db.query.groups.findFirst({
						where: and(eq(groups.id, data.id), eq(groups.userId, user.id)),
					}),
				).pipe(Effect.flatMap((row) => owned("Group", row)));
				if (data.boardId && data.boardId !== group.boardId) {
					yield* query((db) =>
						db.query.boards.findFirst({
							where: and(
								eq(boards.id, data.boardId as string),
								eq(boards.userId, user.id),
							),
						}),
					).pipe(Effect.flatMap((row) => owned("Board", row)));
				}
				const [updated] = yield* query((db) =>
					db
						.update(groups)
						.set({
							name: data.name ?? group.name,
							color: data.color === undefined ? group.color : data.color,
							collapsed: data.collapsed ?? group.collapsed,
							boardId: data.boardId ?? group.boardId,
							options: data.options
								? { ...group.options, ...data.options }
								: group.options,
						})
						.where(eq(groups.id, group.id))
						.returning(),
				);
				return updated;
			}),
		),
	);

export const deleteGroup = createServerFn({ method: "POST" })
	.validator(z.object({ id: idSchema }))
	.handler(({ data }) =>
		runAuthed((user) =>
			query((db) =>
				db
					.delete(groups)
					.where(and(eq(groups.id, data.id), eq(groups.userId, user.id))),
			).pipe(Effect.as({ ok: true })),
		),
	);

export const reorderGroups = createServerFn({ method: "POST" })
	.validator(z.object({ ids: z.array(idSchema).max(200) }))
	.handler(({ data }) =>
		runAuthed((user) =>
			reorder(groups, user.id, data.ids).pipe(Effect.as({ ok: true })),
		),
	);

/* -------------------------------- bookmarks -------------------------------- */

const bookmarkFields = {
	title: z.string().trim().max(200).optional(),
	description: z.string().trim().max(500).nullish(),
	icon: z.string().trim().max(2048).nullish(),
	color: colorSchema,
	tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
};

const ownedGroup = (userId: string, groupId: string) =>
	query((db) =>
		db.query.groups.findFirst({
			where: and(eq(groups.id, groupId), eq(groups.userId, userId)),
		}),
	).pipe(Effect.flatMap((row) => owned("Group", row)));

export const lookupUrl = createServerFn({ method: "POST" })
	.validator(z.object({ url: z.string().max(2048) }))
	.handler(({ data }) =>
		runAuthed(() =>
			Effect.gen(function* () {
				const url = yield* requireUrl(data.url);
				const meta = yield* fetchPageMetadata(url);
				return {
					url,
					title: meta.title ?? titleFromUrl(url),
					description: meta.description ?? null,
					favicon: meta.favicon ?? faviconFor(url),
				};
			}),
		),
	);

export const createBookmark = createServerFn({ method: "POST" })
	.validator(
		z.object({
			groupId: idSchema,
			url: z.string().max(2048),
			// Favicon already discovered by a prior `lookupUrl` call.
			favicon: z.url({ protocol: /^https?$/ }).max(2048).optional(),
			...bookmarkFields,
		}),
	)
	.handler(({ data }) =>
		runAuthed((user) =>
			Effect.gen(function* () {
				yield* ownedGroup(user.id, data.groupId);
				const url = yield* requireUrl(data.url);
				// Only hit the network when the caller didn't already supply a title.
				const meta = data.title ? {} : yield* fetchPageMetadata(url);
				const position = yield* nextPosition(
					bookmarks,
					eq(bookmarks.groupId, data.groupId),
				);
				const [bookmark] = yield* query((db) =>
					db
						.insert(bookmarks)
						.values({
							userId: user.id,
							groupId: data.groupId,
							url,
							title: data.title || meta.title || titleFromUrl(url),
							description: data.description ?? meta.description ?? null,
							icon: data.icon ?? null,
							color: data.color ?? null,
							tags: data.tags ?? [],
							position,
							meta: {
								favicon: data.favicon ?? meta.favicon ?? faviconFor(url),
								siteName: meta.siteName,
								image: meta.image,
							},
						})
						.returning(),
				);
				return bookmark;
			}),
		),
	);

export const updateBookmark = createServerFn({ method: "POST" })
	.validator(
		z.object({
			id: idSchema,
			url: z.string().max(2048).optional(),
			groupId: idSchema.optional(),
			...bookmarkFields,
		}),
	)
	.handler(({ data }) =>
		runAuthed((user) =>
			Effect.gen(function* () {
				const bookmark = yield* query((db) =>
					db.query.bookmarks.findFirst({
						where: and(
							eq(bookmarks.id, data.id),
							eq(bookmarks.userId, user.id),
						),
					}),
				).pipe(Effect.flatMap((row) => owned("Bookmark", row)));
				const url = data.url ? yield* requireUrl(data.url) : bookmark.url;
				let groupId = bookmark.groupId;
				let position = bookmark.position;
				if (data.groupId && data.groupId !== bookmark.groupId) {
					yield* ownedGroup(user.id, data.groupId);
					groupId = data.groupId;
					position = yield* nextPosition(
						bookmarks,
						eq(bookmarks.groupId, groupId),
					);
				}
				const [updated] = yield* query((db) =>
					db
						.update(bookmarks)
						.set({
							url,
							groupId,
							position,
							title: data.title || bookmark.title,
							description:
								data.description === undefined
									? bookmark.description
									: data.description,
							icon: data.icon === undefined ? bookmark.icon : data.icon,
							color: data.color === undefined ? bookmark.color : data.color,
							tags: data.tags ?? bookmark.tags,
							meta:
								url === bookmark.url
									? bookmark.meta
									: { favicon: faviconFor(url) },
						})
						.where(eq(bookmarks.id, bookmark.id))
						.returning(),
				);
				return updated;
			}),
		),
	);

export const deleteBookmark = createServerFn({ method: "POST" })
	.validator(z.object({ id: idSchema }))
	.handler(({ data }) =>
		runAuthed((user) =>
			query((db) =>
				db
					.delete(bookmarks)
					.where(and(eq(bookmarks.id, data.id), eq(bookmarks.userId, user.id))),
			).pipe(Effect.as({ ok: true })),
		),
	);

/** Applies the result of a drag: each listed group gets exactly these bookmarks, in order. */
export const arrangeBookmarks = createServerFn({ method: "POST" })
	.validator(
		z.object({
			groups: z
				.array(z.object({ groupId: idSchema, ids: z.array(idSchema).max(500) }))
				.min(1)
				.max(10),
		}),
	)
	.handler(({ data }) =>
		runAuthed((user) =>
			Effect.gen(function* () {
				const groupIds = data.groups.map((group) => group.groupId);
				const found = yield* query((db) =>
					db
						.select({ id: groups.id })
						.from(groups)
						.where(
							and(inArray(groups.id, groupIds), eq(groups.userId, user.id)),
						),
				);
				if (found.length !== new Set(groupIds).size)
					return yield* new NotFound({ entity: "Group" });
				yield* query((db) =>
					db.transaction(async (tx) => {
						for (const group of data.groups) {
							for (const [position, id] of group.ids.entries()) {
								await tx
									.update(bookmarks)
									.set({ groupId: group.groupId, position })
									.where(
										and(eq(bookmarks.id, id), eq(bookmarks.userId, user.id)),
									);
							}
						}
					}),
				);
				return { ok: true };
			}),
		),
	);

export const recordVisit = createServerFn({ method: "POST" })
	.validator(z.object({ id: idSchema }))
	.handler(({ data }) =>
		runAuthed((user) =>
			query((db) =>
				db
					.update(bookmarks)
					.set({
						visitCount: sql`${bookmarks.visitCount} + 1`,
						lastVisitedAt: new Date(),
						updatedAt: sql`${bookmarks.updatedAt}`,
					})
					.where(and(eq(bookmarks.id, data.id), eq(bookmarks.userId, user.id))),
			).pipe(Effect.as({ ok: true })),
		),
	);

/** Imports a parsed browser bookmark export as a new board. */
export const importBookmarks = createServerFn({ method: "POST" })
	.validator(
		z.object({
			boardName: z.string().trim().min(1).max(60),
			groups: z
				.array(
					z.object({
						name: z.string().trim().min(1).max(60),
						bookmarks: z
							.array(
								z.object({
									title: z.string().max(200),
									url: z.string().max(2048),
								}),
							)
							.max(2000),
					}),
				)
				.min(1)
				.max(200),
		}),
	)
	.handler(({ data }) =>
		runAuthed((user) =>
			Effect.gen(function* () {
				const position = yield* nextPosition(
					boards,
					eq(boards.userId, user.id),
				);
				let imported = 0;
				const boardId = yield* query((db) =>
					db.transaction(async (tx) => {
						const [board] = await tx
							.insert(boards)
							.values({
								userId: user.id,
								name: data.boardName,
								icon: "📥",
								position,
								layout: {
									...DEFAULT_BOARD_LAYOUT,
									tileStyle: "list",
									columns: 4,
								},
							})
							.returning();
						for (const [groupIndex, group] of data.groups.entries()) {
							const rows = group.bookmarks.flatMap((bookmark, index) => {
								const url = normalizeUrl(bookmark.url);
								return url
									? [
											{
												userId: user.id,
												groupId: "",
												url,
												title: bookmark.title.trim() || titleFromUrl(url),
												position: index,
												meta: { favicon: faviconFor(url) },
											},
										]
									: [];
							});
							if (rows.length === 0) continue;
							const [created] = await tx
								.insert(groups)
								.values({
									userId: user.id,
									boardId: board.id,
									name: group.name,
									position: groupIndex,
								})
								.returning();
							for (let i = 0; i < rows.length; i += 200) {
								await tx
									.insert(bookmarks)
									.values(
										rows
											.slice(i, i + 200)
											.map((row) => ({ ...row, groupId: created.id })),
									);
							}
							imported += rows.length;
						}
						return board.id;
					}),
				);
				return { boardId, imported };
			}),
		),
	);

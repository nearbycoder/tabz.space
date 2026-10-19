import { sql } from "drizzle-orm";
import {
	type AnySQLiteColumn,
	index,
	integer,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import {
	type BoardLayout,
	type BookmarkMeta,
	DEFAULT_BOARD_LAYOUT,
	DEFAULT_SETTINGS,
	type GroupOptions,
	type UserSettings,
} from "#/lib/preferences";
import { user } from "./auth-schema.ts";

/*
 * Relational skeleton (user → board → group → bookmark) with document-style
 * JSON columns for everything user-customizable, so layouts and preferences
 * can evolve without migrations.
 */

const id = () =>
	text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

const timestamps = {
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.default(now)
		.notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(now)
		.$onUpdate(() => new Date())
		.notNull(),
};

const json = <T>(name: string, fallback: T) =>
	text(name, { mode: "json" })
		.$type<T>()
		.$defaultFn(() => structuredClone(fallback))
		.notNull();

export const userSettings = sqliteTable("user_settings", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	settings: json<UserSettings>("settings", DEFAULT_SETTINGS),
	...timestamps,
});

export const boards = sqliteTable(
	"boards",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		icon: text("icon"),
		position: integer("position").default(0).notNull(),
		layout: json<BoardLayout>("layout", DEFAULT_BOARD_LAYOUT),
		/** Vault boards are only ever returned while the vault is unlocked. */
		vault: integer("vault", { mode: "boolean" }).default(false).notNull(),
		...timestamps,
	},
	(table) => [index("boards_user_idx").on(table.userId, table.position)],
);

/** Per-user vault: a separate password guarding hidden boards. */
export const vaults = sqliteTable("vaults", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	passwordHash: text("password_hash").notNull(),
	autoLockMinutes: integer("auto_lock_minutes").default(15).notNull(),
	...timestamps,
});

export const groups = sqliteTable(
	"groups",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		boardId: text("board_id")
			.notNull()
			.references(() => boards.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		color: text("color"),
		position: integer("position").default(0).notNull(),
		collapsed: integer("collapsed", { mode: "boolean" })
			.default(false)
			.notNull(),
		options: json<GroupOptions>("options", {}),
		...timestamps,
	},
	(table) => [index("groups_board_idx").on(table.boardId, table.position)],
);

export const bookmarks = sqliteTable(
	"bookmarks",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		groupId: text("group_id")
			.notNull()
			.references(() => groups.id, { onDelete: "cascade" }),
		// Folders are bookmark rows of kind "folder" (url is empty); their
		// children point at them via parentId. One level deep.
		kind: text("kind", { enum: ["link", "folder"] })
			.default("link")
			.notNull(),
		parentId: text("parent_id").references(
			(): AnySQLiteColumn => bookmarks.id,
			{ onDelete: "cascade" },
		),
		title: text("title").notNull(),
		url: text("url").notNull(),
		description: text("description"),
		icon: text("icon"),
		color: text("color"),
		position: integer("position").default(0).notNull(),
		tags: json<string[]>("tags", []),
		meta: json<BookmarkMeta>("meta", {}),
		visitCount: integer("visit_count").default(0).notNull(),
		lastVisitedAt: integer("last_visited_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		index("bookmarks_group_idx").on(table.groupId, table.position),
		index("bookmarks_parent_idx").on(table.parentId, table.position),
		index("bookmarks_user_idx").on(table.userId),
	],
);

export type Board = typeof boards.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Bookmark = typeof bookmarks.$inferSelect;

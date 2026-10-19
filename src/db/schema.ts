import { sql } from "drizzle-orm";
import {
	type AnySQLiteColumn,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
	type BoardLayout,
	type BookmarkMeta,
	DEFAULT_BOARD_LAYOUT,
	DEFAULT_SETTINGS,
	type GroupOptions,
	type UserSettings,
	type Widget,
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
		/** Vault boards shown when the decoy password was used. */
		decoy: integer("decoy", { mode: "boolean" }).default(false).notNull(),
		/** Soft delete: rows sit in the trash for 30 days before being purged. */
		deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
		/** Set for boards mirrored from elsewhere (e.g. "browser" bookmarks sync). */
		source: text("source"),
		/** Public read-only link (/b/<slug>); null when not shared publicly. */
		shareSlug: text("share_slug").unique(),
		...timestamps,
	},
	(table) => [index("boards_user_idx").on(table.userId, table.position)],
);

/** Per-user vault: a separate password guarding hidden boards. */
export const vaults = sqliteTable("vaults", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	/**
	 * Hash of the auth key the browser derives from the vault password (or, for
	 * vaults created before end-to-end encryption, of the password itself).
	 */
	passwordHash: text("password_hash").notNull(),
	/** PBKDF2 salt for the browser's key derivation; null = legacy vault. */
	kdfSalt: text("kdf_salt"),
	/** Optional decoy password: opens a separate, harmless set of boards. */
	decoyHash: text("decoy_hash"),
	/** 4 or 6 when the vault opens with a numeric PIN (keypad); null = password. */
	pinLength: integer("pin_length"),
	/** Wrong guesses in a row; stored so restarts don't reset the brake. */
	failedAttempts: integer("failed_attempts").default(0).notNull(),
	/** No unlock attempts are accepted before this time. */
	lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
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
		/** links: bookmarks · smart: saved filter · widget: weather/notes/etc. */
		kind: text("kind", { enum: ["links", "smart", "widget"] })
			.default("links")
			.notNull(),
		color: text("color"),
		position: integer("position").default(0).notNull(),
		collapsed: integer("collapsed", { mode: "boolean" })
			.default(false)
			.notNull(),
		options: json<GroupOptions>("options", {}),
		deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
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
		// children (links or more folders, any depth) point at them via parentId.
		kind: text("kind", { enum: ["link", "folder"] })
			.default("link")
			.notNull(),
		parentId: text("parent_id").references(
			(): AnySQLiteColumn => bookmarks.id,
			{ onDelete: "cascade" },
		),
		title: text("title").notNull(),
		url: text("url").notNull(),
		/** Always open in a private window (on folders: applies to everything inside). */
		incognito: integer("incognito", { mode: "boolean" })
			.default(false)
			.notNull(),
		description: text("description"),
		icon: text("icon"),
		color: text("color"),
		position: integer("position").default(0).notNull(),
		tags: json<string[]>("tags", []),
		meta: json<BookmarkMeta>("meta", {}),
		visitCount: integer("visit_count").default(0).notNull(),
		lastVisitedAt: integer("last_visited_at", { mode: "timestamp_ms" }),
		deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
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

/** A row's values before a change, so the change can be undone. */
export type Snapshot = {
	table: "boards" | "groups" | "bookmarks";
	id: string;
	values: Record<string, unknown>;
};

/** Undoable history of changes, newest first. */
export const activity = sqliteTable(
	"activity",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		action: text("action").notNull(),
		label: text("label").notNull(),
		snapshots: json<Snapshot[]>("snapshots", []),
		/** Set for changes inside a vault, so they stay hidden while it's locked. */
		vaultSlot: text("vault_slot", { enum: ["main", "decoy"] }),
		undoneAt: integer("undone_at", { mode: "timestamp_ms" }),
		createdAt: timestamps.createdAt,
	},
	(table) => [index("activity_user_idx").on(table.userId, table.createdAt)],
);

/** One row per opened link; powers the monthly report. Kept for ~13 months. */
export const visits = sqliteTable(
	"visits",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		bookmarkId: text("bookmark_id")
			.notNull()
			.references(() => bookmarks.id, { onDelete: "cascade" }),
		at: integer("at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => [index("visits_user_at_idx").on(table.userId, table.at)],
);

/** People a board is shared with (the owner is boards.userId). */
export const boardMembers = sqliteTable(
	"board_members",
	{
		boardId: text("board_id")
			.notNull()
			.references(() => boards.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role", { enum: ["editor", "viewer"] })
			.default("editor")
			.notNull(),
		createdAt: timestamps.createdAt,
	},
	(table) => [
		primaryKey({ columns: [table.boardId, table.userId] }),
		index("board_members_user_idx").on(table.userId),
	],
);

export type Activity = typeof activity.$inferSelect;

/** Personal API tokens (REST API and the browser extension). Only hashes are stored. */
export const apiTokens = sqliteTable(
	"api_tokens",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		kind: text("kind", { enum: ["personal", "extension"] })
			.default("personal")
			.notNull(),
		tokenHash: text("token_hash").notNull().unique(),
		/** First characters of the token, for recognising it in the UI. */
		prefix: text("prefix").notNull(),
		lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
		createdAt: timestamps.createdAt,
	},
	(table) => [index("api_tokens_user_idx").on(table.userId)],
);

/** Outbound webhooks fired on library changes. */
export const webhooks = sqliteTable(
	"webhooks",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		url: text("url").notNull(),
		secret: text("secret").notNull(),
		events: json<string[]>("events", ["*"]),
		active: integer("active", { mode: "boolean" }).default(true).notNull(),
		lastStatus: integer("last_status"),
		lastDeliveredAt: integer("last_delivered_at", { mode: "timestamp_ms" }),
		createdAt: timestamps.createdAt,
	},
	(table) => [index("webhooks_user_idx").on(table.userId)],
);

export type ApiToken = typeof apiTokens.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;

/** Community themes: published appearance presets anyone can apply. */
export const themes = sqliteTable(
	"themes",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		/** The appearance subset of UserSettings (see THEME_KEYS). */
		settings: json<Partial<UserSettings>>("settings", {}),
		installs: integer("installs").default(0).notNull(),
		createdAt: timestamps.createdAt,
	},
	(table) => [index("themes_installs_idx").on(table.installs)],
);

export type Theme = typeof themes.$inferSelect;

/** Ways to save links from outside tabz: a Telegram chat or an email address. */
export const integrations = sqliteTable(
	"integrations",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: text("kind", { enum: ["telegram", "email"] }).notNull(),
		/** Telegram chat id, or the secret part of the user's email address. */
		externalId: text("external_id").notNull(),
		label: text("label"),
		createdAt: timestamps.createdAt,
	},
	(table) => [
		uniqueIndex("integrations_kind_external_idx").on(
			table.kind,
			table.externalId,
		),
		index("integrations_user_idx").on(table.userId),
	],
);

/** "My widgets": widgets a user built or configured, ready to add to any board. */
export const customWidgets = sqliteTable(
	"custom_widgets",
	{
		id: id(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		icon: text("icon").notNull(),
		widget: json<Widget>("widget", { type: "notes", text: "" }),
		...timestamps,
	},
	(table) => [index("custom_widgets_user_idx").on(table.userId)],
);

CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`label` text NOT NULL,
	`snapshots` text NOT NULL,
	`undone_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_user_idx` ON `activity` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `board_members` (
	`board_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`board_id`, `user_id`),
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `board_members_user_idx` ON `board_members` (`user_id`);--> statement-breakpoint
ALTER TABLE `boards` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `groups` ADD `kind` text DEFAULT 'links' NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `deleted_at` integer;
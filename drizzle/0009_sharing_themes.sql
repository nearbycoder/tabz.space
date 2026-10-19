CREATE TABLE `themes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`settings` text NOT NULL,
	`installs` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `themes_installs_idx` ON `themes` (`installs`);--> statement-breakpoint
ALTER TABLE `boards` ADD `share_slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `boards_share_slug_unique` ON `boards` (`share_slug`);
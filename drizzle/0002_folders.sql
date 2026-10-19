ALTER TABLE `bookmarks` ADD `kind` text DEFAULT 'link' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `parent_id` text REFERENCES bookmarks(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `bookmarks_parent_idx` ON `bookmarks` (`parent_id`,`position`);
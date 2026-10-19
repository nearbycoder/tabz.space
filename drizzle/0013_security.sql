ALTER TABLE `activity` ADD `vault_slot` text;--> statement-breakpoint
ALTER TABLE `vaults` ADD `failed_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `vaults` ADD `locked_until` integer;
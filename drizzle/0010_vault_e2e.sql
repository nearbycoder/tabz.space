ALTER TABLE `boards` ADD `decoy` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `vaults` ADD `kdf_salt` text;--> statement-breakpoint
ALTER TABLE `vaults` ADD `decoy_hash` text;
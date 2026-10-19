-- Full-text index of bookmark page text (maintained by src/server/content.ts).
CREATE VIRTUAL TABLE `bookmark_text` USING fts5(
	`bookmark_id` UNINDEXED,
	`title`,
	`body`,
	tokenize = 'porter unicode61 remove_diacritics 2'
);

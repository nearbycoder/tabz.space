/** SQLite location: DATABASE_URL (libsql/file URL) or DATABASE_PATH, defaulting to ./data. */
export function databaseUrl() {
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
	const path = process.env.DATABASE_PATH ?? "./data/tabz.db";
	return `file:${path}`;
}

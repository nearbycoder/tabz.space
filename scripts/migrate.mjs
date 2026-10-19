// Applies pending Drizzle migrations before the server boots (used by `npm start`).
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const url =
	process.env.DATABASE_URL ??
	`file:${process.env.DATABASE_PATH ?? "./data/tabz.db"}`;
if (url.startsWith("file:")) {
	mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
}

const client = createClient({ url });
try {
	await client.execute("PRAGMA journal_mode = WAL");
	await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
	console.log(`migrations applied (${url})`);
} finally {
	client.close();
}

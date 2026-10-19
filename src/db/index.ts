import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as authSchema from "./auth-schema.ts";
import * as schema from "./schema.ts";
import { databaseUrl } from "./url.ts";

const url = databaseUrl();
if (url.startsWith("file:")) {
	mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
}

const client = createClient({ url });

// WAL keeps reads fast while writes happen; foreign keys power cascading deletes.
await client.executeMultiple(
	"PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;",
);

export const db = drizzle(client, {
	schema: { ...schema, ...authSchema },
});

export type Database = typeof db;

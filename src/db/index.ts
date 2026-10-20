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

const raw = createClient({ url });

/*
 * A counter that moves on every write, whoever makes it (the app, Better
 * Auth, raw SQL, background jobs). Read-mostly caches compare it to know
 * when they're stale, so no write path can be forgotten.
 */
let version = 0;
export const dataVersion = () => version;

// Only plain reads leave the version alone; anything else counts as a write.
const READ = /^\s*(select|explain)\b/i;
const sqlOf = (statement: unknown) =>
	typeof statement === "string"
		? statement
		: ((statement as { sql?: string } | null)?.sql ?? "");
const write = (statement: unknown) => {
	if (!READ.test(sqlOf(statement))) version++;
};

const client = new Proxy(raw, {
	get(target, key, receiver) {
		const value = Reflect.get(target, key, receiver);
		if (typeof value !== "function") return value;
		if (key === "execute")
			return (statement: unknown, ...rest: unknown[]) => {
				write(statement);
				return value.call(target, statement, ...rest);
			};
		if (key === "batch")
			return (statements: unknown[], ...rest: unknown[]) => {
				for (const statement of statements) write(statement);
				return value.call(target, statements, ...rest);
			};
		if (key === "transaction" || key === "executeMultiple" || key === "migrate")
			// Conservatively a write; also counted again when it finishes.
			return async (...args: unknown[]) => {
				version++;
				const result = await value.apply(target, args);
				if (key !== "transaction") version++;
				return wrapTransaction(result);
			};
		return value.bind(target);
	},
});

/** Writes inside a transaction count too (and again when it commits). */
function wrapTransaction(result: unknown) {
	if (!result || typeof result !== "object" || !("commit" in result))
		return result;
	return new Proxy(result as object, {
		get(target, key, receiver) {
			const value = Reflect.get(target, key, receiver);
			if (typeof value !== "function") return value;
			if (key === "execute" || key === "batch" || key === "commit")
				return async (...args: unknown[]) => {
					version++;
					try {
						return await value.apply(target, args);
					} finally {
						version++;
					}
				};
			return value.bind(target);
		},
	});
}

// WAL keeps reads fast while writes happen; foreign keys power cascading deletes.
await client.executeMultiple(
	"PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;",
);

export const db = drizzle(client, {
	schema: { ...schema, ...authSchema },
});

export type Database = typeof db;

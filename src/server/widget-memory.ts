import { Effect } from "effect";
import { widgetKey } from "#/lib/widget-key";

/*
 * Each account's latest widget results. The home page is rendered with them
 * already in place, so reloading shows your weather, feeds and so on at once
 * instead of spinners; the page then refreshes anything stale in the
 * background. Memory only: after a restart it fills up again as widgets load.
 */

/** Widget results are plain data (dates included), sent to the page as-is. */
type Plain =
	| string
	| number
	| boolean
	| null
	| Date
	| Plain[]
	| { [key: string]: Plain };

type Entry = {
	key: readonly ["widget", string, Plain];
	data: Plain;
	at: number;
};

const MAX_USERS = 500;
const MAX_ENTRIES = 40;
/** Older than this isn't worth showing, even briefly. */
const MAX_AGE = 3 * 86_400_000;
/** Keeps the page small: big answers just load as before. */
const MAX_CHARS = 64_000;

const memory = new Map<string, Map<string, Entry>>();

/** Pipe a widget's result through this to remember it for the next page load. */
export const remembering =
	(userId: string, name: string, input: unknown = null) =>
	<A, E, R>(effect: Effect.Effect<A, E, R>) =>
		Effect.tap(effect, (data) =>
			Effect.sync(() => {
				let size: number;
				try {
					size = JSON.stringify(data)?.length ?? 0;
				} catch {
					return;
				}
				if (size > MAX_CHARS) return;
				const key = widgetKey(name, input) as Entry["key"];
				const id = JSON.stringify(key);
				const entries = memory.get(userId) ?? new Map<string, Entry>();
				// Most recently used last, for both maps.
				memory.delete(userId);
				memory.set(userId, entries);
				entries.delete(id);
				entries.set(id, { key, data: data as Plain, at: Date.now() });
				if (entries.size > MAX_ENTRIES)
					entries.delete(entries.keys().next().value as string);
				if (memory.size > MAX_USERS)
					memory.delete(memory.keys().next().value as string);
			}),
		);

/** What to put in place on the next home page render. */
export const recall = (userId: string) =>
	Effect.sync(() => {
		const now = Date.now();
		return [...(memory.get(userId)?.values() ?? [])].filter(
			(entry) => now - entry.at < MAX_AGE,
		);
	});

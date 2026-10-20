const isPlain = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" &&
	value !== null &&
	Object.getPrototypeOf(value) === Object.prototype;

/**
 * Keeps every unchanged part of the old data (same object identity) when a
 * refetch arrives, like React Query's default, but also:
 *  - treats equal Dates as equal (the default doesn't, so every link looked
 *    changed and every tile re-rendered after each edit);
 *  - matches array items by `id`, so an insert or a move doesn't make
 *    everything after it look new.
 */
export function shareStructure<T>(prev: unknown, next: T): T {
	if (Object.is(prev, next)) return prev as T;
	if (prev instanceof Date && next instanceof Date)
		return (prev.getTime() === next.getTime() ? prev : next) as T;
	if (Array.isArray(prev) && Array.isArray(next)) {
		const byId = new Map<unknown, unknown>();
		for (const item of prev)
			if (isPlain(item) && "id" in item) byId.set(item.id, item);
		let same = prev.length === next.length;
		const out = next.map((item, index) => {
			const old =
				isPlain(item) && "id" in item && byId.has(item.id)
					? byId.get(item.id)
					: prev[index];
			const shared = shareStructure(old, item);
			if (shared !== prev[index]) same = false;
			return shared;
		});
		return (same ? prev : out) as T;
	}
	if (isPlain(prev) && isPlain(next)) {
		const keys = Object.keys(next);
		let same = keys.length === Object.keys(prev).length;
		const out: Record<string, unknown> = {};
		for (const key of keys) {
			const shared = shareStructure(prev[key], next[key]);
			out[key] = shared;
			if (shared !== prev[key] || !(key in prev)) same = false;
		}
		return (same ? prev : out) as T;
	}
	return next;
}

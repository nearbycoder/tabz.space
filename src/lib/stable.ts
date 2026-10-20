import { useMemo } from "react";

/**
 * The same array instance for as long as its ids stay the same. dnd-kit's
 * SortableContext treats a new `items` array as a change and re-renders every
 * sortable inside it, so passing freshly mapped ids made each data update
 * redraw whole groups of tiles.
 */
export function useStableIds(ids: string[]) {
	const key = ids.join("\u0000");
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed by content on purpose
	return useMemo(() => ids, [key]);
}

/*
 * Keyboard navigation between tiles on the current board. Tiles mark their
 * link (or folder button) with data-tile-link; anything inside a dialog is
 * left out, so a folder's contents don't count as board tiles.
 */

export type Direction = "left" | "right" | "up" | "down";

/** The board's tiles in reading order. */
export function boardTiles(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>("[data-tile-link]")].filter(
		(node) => !node.closest("[role=dialog]") && node.offsetParent,
	);
}

export const focusedTile = () => {
	const active = document.activeElement as HTMLElement | null;
	return active?.hasAttribute("data-tile-link") ? active : null;
};

export function focusFirstTile() {
	const first = boardTiles()[0];
	first?.focus();
	return Boolean(first);
}

/**
 * Moves focus to the nearest tile in a direction. Left/right follow reading
 * order (so they wrap across rows and groups); up/down pick the closest tile
 * above or below by geometry, which works across side-by-side groups.
 */
export function moveTileFocus(from: HTMLElement, direction: Direction) {
	const tiles = boardTiles();
	const index = tiles.indexOf(from);
	if (index < 0) return false;
	let next: HTMLElement | undefined;
	if (direction === "left") next = tiles[index - 1];
	else if (direction === "right") next = tiles[index + 1];
	else {
		const here = from.getBoundingClientRect();
		const cx = here.left + here.width / 2;
		const cy = here.top + here.height / 2;
		let best = Number.POSITIVE_INFINITY;
		for (const tile of tiles) {
			if (tile === from) continue;
			const rect = tile.getBoundingClientRect();
			const dy = rect.top + rect.height / 2 - cy;
			if (direction === "down" ? dy <= here.height / 4 : dy >= -here.height / 4)
				continue;
			const dx = rect.left + rect.width / 2 - cx;
			// Prefer staying in the same column: sideways distance weighs more.
			const score = Math.abs(dy) + Math.abs(dx) * 2;
			if (score < best) {
				best = score;
				next = tile;
			}
		}
	}
	if (!next) return false;
	next.focus();
	next.scrollIntoView({ block: "nearest" });
	return true;
}

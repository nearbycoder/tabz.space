import { useEffect, useState } from "react";

export type VisibleArea = { top: number; height: number };

/**
 * The part of the screen not covered by the on-screen keyboard, from the
 * visual viewport, or null while no keyboard is up. iOS Safari doesn't shrink
 * the layout viewport for the keyboard (and scrolls the page under it), so
 * bottom sheets position themselves against this area instead.
 */
export function useVisibleArea(active = true) {
	const [area, setArea] = useState<VisibleArea | null>(null);
	useEffect(() => {
		const viewport = window.visualViewport;
		if (!active || !viewport || !matchMedia("(pointer: coarse)").matches)
			return;
		const update = () => {
			// A keyboard takes well over 100px; smaller changes are browser chrome.
			const keyboard = window.innerHeight - viewport.height > 120;
			const next = keyboard
				? { top: viewport.offsetTop, height: viewport.height }
				: null;
			setArea((prev) =>
				prev?.top === next?.top && prev?.height === next?.height ? prev : next,
			);
		};
		update();
		viewport.addEventListener("resize", update);
		viewport.addEventListener("scroll", update);
		return () => {
			viewport.removeEventListener("resize", update);
			viewport.removeEventListener("scroll", update);
		};
	}, [active]);
	return area;
}

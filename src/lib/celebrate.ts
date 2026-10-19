import confetti from "canvas-confetti";

/** A small burst of accent-colored confetti from an element (or screen center). */
export function celebrate(origin?: Element | null) {
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	const accent =
		getComputedStyle(document.documentElement)
			.getPropertyValue("--accent")
			.trim() || "#6366f1";
	const rect = origin?.getBoundingClientRect();
	confetti({
		particleCount: 70,
		spread: 70,
		startVelocity: 32,
		scalar: 0.9,
		ticks: 160,
		zIndex: 9999,
		colors: [accent, "#ffffff", "#facc15", "#f472b6"],
		origin: rect
			? {
					x: (rect.left + rect.width / 2) / window.innerWidth,
					y: (rect.top + rect.height / 2) / window.innerHeight,
				}
			: { x: 0.5, y: 0.4 },
	});
}

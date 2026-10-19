import { type ComponentType, lazy } from "react";

/**
 * React.lazy for a named export, plus `preload()` to fetch the chunk ahead of
 * time (e.g. when the browser is idle) so opening it later is instant.
 */
export function lazyNamed<M, K extends keyof M>(
	load: () => Promise<M>,
	name: K,
) {
	// biome-ignore lint/suspicious/noExplicitAny: matches React.lazy's own constraint
	type C = M[K] extends ComponentType<any> ? M[K] : never;
	const Component = lazy(() =>
		load().then((module) => ({ default: module[name] as C })),
	);
	return Object.assign(Component, { preload: () => void load() });
}

/** Runs `task` once the browser has nothing better to do. */
export function whenIdle(task: () => void, timeout = 3000) {
	if (typeof window === "undefined") return;
	if ("requestIdleCallback" in window)
		window.requestIdleCallback(task, { timeout });
	else setTimeout(task, 1500);
}

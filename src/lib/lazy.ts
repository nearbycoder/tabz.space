import { type ComponentType, createElement, lazy, useState } from "react";

/**
 * React.lazy for a named export, plus `preload()` to fetch the chunk ahead of
 * time (e.g. when the browser is idle) so opening it later is instant.
 *
 * Once the module has loaded, the component renders it directly instead of
 * through React.lazy: a lazy component suspends on its first render even when
 * its code is already here, and React holds a suspended reveal for ~300ms,
 * which made every dialog's first open feel sluggish.
 */
export function lazyNamed<M, K extends keyof M>(
	load: () => Promise<M>,
	name: K,
) {
	// biome-ignore lint/suspicious/noExplicitAny: matches React.lazy's own constraint
	type C = M[K] extends ComponentType<any> ? M[K] : never;
	let loaded: C | undefined;
	const fetchModule = () =>
		load().then((module) => {
			loaded = module[name] as C;
			return loaded;
		});
	const Lazy = lazy(() =>
		fetchModule().then((component) => ({ default: component })),
	);
	function Component(props: React.ComponentProps<C>) {
		// Decided once per mount, so an open dialog never remounts (and loses
		// its state) when its code arrives.
		const [Ready] = useState(() => loaded);
		return createElement((Ready ?? Lazy) as ComponentType, props);
	}
	return Object.assign(Component, { preload: () => fetchModule() });
}

/**
 * Runs `task` once the page has loaded and the browser has nothing better to
 * do, so background downloads never compete with what's on screen.
 */
export function whenIdle(task: () => void, timeout = 3000) {
	if (typeof window === "undefined") return;
	const idle = () => {
		if ("requestIdleCallback" in window)
			window.requestIdleCallback(task, { timeout });
		else setTimeout(task, 1500);
	};
	if (document.readyState === "complete") idle();
	else window.addEventListener("load", idle, { once: true });
}

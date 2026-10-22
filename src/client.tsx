import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { preloadWidgetCode } from "./components/home/widgets/loaders";

/*
 * Widgets' code loads on demand. Fetch the code for the widgets on screen
 * before React takes over the server-rendered page: a widget whose code is
 * still on its way would be held back, and any update in the meantime makes
 * React throw away its markup and show an empty box until the code arrives
 * (the widget flashes away and back). From the saved copy this takes a few
 * milliseconds; it never waits more than 600 ms.
 */
const types = [
	...new Set(
		[...document.querySelectorAll("[data-widget-type]")].map(
			(element) => element.getAttribute("data-widget-type") ?? "",
		),
	),
].filter(Boolean);

void Promise.race([
	preloadWidgetCode(types),
	new Promise((resolve) => setTimeout(resolve, 600)),
]).then(() =>
	startTransition(() => {
		hydrateRoot(
			document,
			<StrictMode>
				<StartClient />
			</StrictMode>,
		);
	}),
);

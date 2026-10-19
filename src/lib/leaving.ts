/*
 * A slim progress bar from the moment you click a link until the next page
 * arrives. The browser keeps showing this page while it waits for the other
 * site, which otherwise feels like the click was ignored.
 */

let bar: HTMLDivElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function hide() {
	clearTimeout(timer);
	bar?.remove();
	bar = null;
}

export function showLeaving() {
	if (bar || typeof document === "undefined") return;
	bar = document.createElement("div");
	bar.className = "tabz-leaving";
	bar.setAttribute("aria-hidden", "true");
	document.body.appendChild(bar);
	// Downloads and blocked navigations never unload the page.
	timer = setTimeout(hide, 15_000);
}

/** Shows the bar for plain clicks on links to other sites (and hides it on Back). */
export function watchLeaving() {
	document.addEventListener("click", (event) => {
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return;
		const link = (event.target as Element | null)?.closest?.("a[href]");
		if (!(link instanceof HTMLAnchorElement)) return;
		if (
			(link.target && link.target !== "_self") ||
			link.hasAttribute("download")
		)
			return;
		const url = new URL(link.href, window.location.href);
		if (
			!/^https?:$/.test(url.protocol) ||
			url.origin === window.location.origin
		)
			return;
		showLeaving();
	});
	// Coming back from the back/forward cache: the old bar is still there.
	window.addEventListener("pageshow", (event) => {
		if (event.persisted) hide();
	});
}

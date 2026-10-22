import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { call, run } from "#/lib/api";
import { widgetKey } from "#/lib/widget-key";
import { getJsonData } from "#/server/home";
import type { JsonValue } from "./kit";

/*
 * Runs a custom widget's HTML/CSS/JS in a sandboxed iframe. Without
 * allow-same-origin the frame gets an opaque origin: no cookies, no storage,
 * no access to the page. It talks to tabz only through postMessage:
 *
 *   tabz.state                → what the widget last saved (or null)
 *   tabz.save(value)          → keep JSON for next time (up to 50 KB)
 *   tabz.fetch(url, { pick }) → any public JSON API, via the tabz server
 *   tabz.open(url)            → open a link in a new tab
 *   tabz.theme                → { dark, accent, ink, muted }
 *
 * The frame resizes itself to its content, starting at its last known height.
 * Fetches answer from what this page already has (including the server's
 * copy of your latest widget data) when it's under half an hour old, so a
 * reload shows the widget at once; older answers refresh in the background.
 */

const MAX_STATE = 50_000;
const FETCHES_PER_MINUTE = 30;
const REFRESH_AFTER = 60_000;
const SHOW_UP_TO = 30 * 60_000;

type Message = {
	source: "tabz-widget";
	id?: number;
	type: "height" | "fetch" | "save" | "open";
	payload?: {
		height?: number;
		url?: string;
		pick?: string[];
		state?: JsonValue;
	};
};

/** JSON that's safe to drop inside a <script> tag. */
const scriptJson = (value: unknown) =>
	JSON.stringify(value ?? null)
		.replace(/</g, "\\u003c")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");

function themeOf() {
	const styles = getComputedStyle(document.documentElement);
	const read = (name: string) => styles.getPropertyValue(name).trim();
	return {
		dark: document.documentElement.classList.contains("dark"),
		accent: read("--accent") || "#6366f1",
		ink: read("--ink") || "#0f172a",
		muted: read("--muted") || "#64748b",
	};
}

function documentFor(html: string, state: JsonValue | undefined) {
	const theme = themeOf();
	return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:${theme.dark ? "dark" : "light"};--accent:${theme.accent};--ink:${theme.ink};--muted:${theme.muted}}
html,body{margin:0;background:transparent;color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--accent)}button,input,select,textarea{font:inherit;color:inherit}
</style>
<script>(()=>{const pending=new Map();let seq=0;
const send=(type,payload)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});parent.postMessage({source:"tabz-widget",id,type,payload},"*")});
addEventListener("message",(event)=>{if(event.source!==parent)return;const m=event.data;if(!m||m.source!=="tabz-host")return;const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve(m.value)});
window.tabz={state:${scriptJson(state)},theme:${scriptJson(theme)},
fetch:(url,options)=>send("fetch",{url:String(url),pick:options&&options.pick}),
save:(state)=>{window.tabz.state=state;return send("save",{state})},
open:(url)=>send("open",{url:String(url)})};
const report=()=>parent.postMessage({source:"tabz-widget",type:"height",payload:{height:document.documentElement.scrollHeight}},"*");
addEventListener("load",report);new ResizeObserver(report).observe(document.documentElement);})();</script>
</head><body>${html}</body></html>`;
}

export function SandboxFrame({
	html,
	state,
	onState,
	maxHeight = 800,
	sizeKey,
}: {
	html: string;
	state?: JsonValue;
	/** Omit for read-only (tabz.save will fail). */
	onState?: (state: JsonValue) => void;
	maxHeight?: number;
	/** Remembers the frame's height under this key, so it opens at full size. */
	sizeKey?: string;
}) {
	const frame = useRef<HTMLIFrameElement>(null);
	const queryClient = useQueryClient();
	const [height, setHeight] = useState(80);
	const sizeStore = sizeKey ? `tabz-frame-height:${sizeKey}` : null;
	useLayoutEffect(() => {
		const known = sizeStore && Number(localStorage.getItem(sizeStore));
		if (known) setHeight(Math.min(maxHeight, known));
	}, [sizeStore, maxHeight]);
	const latest = useRef({ state, onState });
	latest.current = { state, onState };
	const fetches = useRef<number[]>([]);

	// Built once the page is up (it reads the page's theme), before it paints,
	// and only when the code changes, not on every save.
	const [srcDoc, setSrcDoc] = useState<string | null>(null);
	const startedAt = useRef(0);
	useLayoutEffect(() => {
		startedAt.current = Date.now();
		setSrcDoc(documentFor(html, latest.current.state));
	}, [html]);

	useEffect(() => {
		const reply = (
			id: number | undefined,
			result: { value?: unknown; error?: string },
		) =>
			frame.current?.contentWindow?.postMessage(
				{ source: "tabz-host", id, ...result },
				"*",
			);
		const onMessage = async (event: MessageEvent<Message>) => {
			if (event.source !== frame.current?.contentWindow) return;
			const message = event.data;
			if (message?.source !== "tabz-widget") return;
			const payload = message.payload ?? {};
			if (message.type === "height") {
				const next = Math.min(
					maxHeight,
					Math.max(24, Math.ceil(payload.height ?? 0)),
				);
				// While it starts up (showing "Loading…" and the like), only grow:
				// shrinking first and growing back once its data is in is a jump.
				setHeight((current) =>
					next < current && Date.now() - startedAt.current < 1500
						? current
						: next,
				);
				if (sizeStore) localStorage.setItem(sizeStore, String(next));
				return;
			}
			if (message.type === "open") {
				if (/^https?:\/\//i.test(payload.url ?? ""))
					window.open(payload.url, "_blank", "noopener");
				return reply(message.id, { value: true });
			}
			if (message.type === "save") {
				const save = latest.current.onState;
				if (!save)
					return reply(message.id, { error: "This board is read-only" });
				const size = JSON.stringify(payload.state ?? null).length;
				if (size > MAX_STATE)
					return reply(message.id, {
						error: `State is too big (${size} of ${MAX_STATE} bytes)`,
					});
				save(payload.state ?? null);
				return reply(message.id, { value: true });
			}
			if (message.type === "fetch") {
				const now = Date.now();
				fetches.current = fetches.current.filter((at) => now - at < 60_000);
				if (fetches.current.length >= FETCHES_PER_MINUTE)
					return reply(message.id, { error: "Too many requests; slow down" });
				fetches.current.push(now);
				if (!/^https?:\/\//i.test(payload.url ?? ""))
					return reply(message.id, {
						error: "Only http(s) addresses can be fetched",
					});
				try {
					const input = {
						url: payload.url as string,
						pick: Array.isArray(payload.pick)
							? payload.pick.slice(0, 30).map(String)
							: undefined,
					};
					const load = () =>
						queryClient.fetchQuery({
							queryKey: widgetKey("json", input),
							queryFn: () => run(call(getJsonData, input)),
							staleTime: REFRESH_AFTER,
						});
					const known = queryClient.getQueryState<{ value: unknown }>(
						widgetKey("json", input),
					);
					const age = Date.now() - (known?.dataUpdatedAt ?? 0);
					let result: { value: unknown };
					if (known?.data && age < SHOW_UP_TO) {
						result = known.data;
						if (age > REFRESH_AFTER) void load().catch(() => {});
					} else result = await load();
					reply(message.id, { value: result.value });
				} catch (error) {
					reply(message.id, {
						error: error instanceof Error ? error.message : "Request failed",
					});
				}
			}
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [maxHeight, queryClient, sizeStore]);

	return (
		<iframe
			ref={frame}
			title="Custom widget"
			srcDoc={srcDoc ?? ""}
			// No allow-same-origin: the code can't read cookies or reach the page.
			sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
			className="block w-full border-0"
			style={{ height }}
		/>
	);
}

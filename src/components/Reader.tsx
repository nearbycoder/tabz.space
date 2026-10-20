import { useMutation } from "@tanstack/react-query";
import {
	ArrowLeft,
	Check,
	ExternalLink,
	Highlighter,
	RotateCcw,
	Trash2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { call, run } from "#/lib/api";
import type { getArticle } from "#/server/home";
import {
	addHighlight,
	markRead,
	removeHighlight,
	saveReadingProgress,
} from "#/server/home";

export type Article = Awaited<ReturnType<typeof getArticle>>;
type Highlight = Article["highlights"][number];

/** Wraps the first occurrence of `text` in the container with <mark>, across nodes. */
function markText(root: HTMLElement, text: string, id: string) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	let joined = "";
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		nodes.push(node as Text);
		joined += (node as Text).data;
	}
	// Whitespace differs between the selection and the DOM: match loosely.
	const normalize = (value: string) => value.replace(/\s+/g, " ");
	const needle = normalize(text);
	const map: number[] = [];
	let flat = "";
	for (let i = 0; i < joined.length; i++) {
		const char = /\s/.test(joined[i]) ? " " : joined[i];
		if (char === " " && flat.endsWith(" ")) continue;
		flat += char;
		map.push(i);
	}
	const at = flat.indexOf(needle);
	if (at < 0) return;
	const start = map[at];
	const end = map[at + needle.length - 1] + 1;
	let offset = 0;
	for (const node of nodes) {
		const from = offset;
		const to = offset + node.data.length;
		offset = to;
		if (to <= start || from >= end) continue;
		const range = document.createRange();
		range.setStart(node, Math.max(0, start - from));
		range.setEnd(node, Math.min(node.data.length, end - from));
		const mark = document.createElement("mark");
		mark.className = "tabz-highlight";
		mark.dataset.highlight = id;
		range.surroundContents(mark);
	}
}

export function Reader({ article }: { article: Article }) {
	const body = useRef<HTMLDivElement>(null);
	const [highlights, setHighlights] = useState<Highlight[]>(article.highlights);
	const [unread, setUnread] = useState(article.unread);
	const [selection, setSelection] = useState<{
		text: string;
		x: number;
		y: number;
	} | null>(null);
	const [progress, setProgress] = useState(article.progress);

	// Render the (server-sanitized) article, then paint saved highlights.
	useLayoutEffect(() => {
		const root = body.current;
		if (!root) return;
		root.innerHTML = article.html;
		for (const item of highlights) markText(root, item.text, item.id);
	}, [article.html, highlights]);

	// Pick up where you left off.
	useEffect(() => {
		if (article.progress > 0.02 && article.progress < 0.98) {
			const max = document.documentElement.scrollHeight - window.innerHeight;
			window.scrollTo({ top: article.progress * max });
		}
	}, [article.progress]);

	// Track progress as you scroll; save it every few seconds and on leave.
	const latest = useRef(article.progress);
	useEffect(() => {
		const onScroll = () => {
			const max = document.documentElement.scrollHeight - window.innerHeight;
			const value = max > 0 ? Math.min(1, window.scrollY / max) : 1;
			latest.current = value;
			setProgress(value);
		};
		let saved = article.progress;
		const save = () => {
			if (Math.abs(latest.current - saved) < 0.01) return;
			saved = latest.current;
			run(call(saveReadingProgress, { id: article.id, progress: saved })).catch(
				() => {},
			);
		};
		const timer = setInterval(save, 5000);
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("pagehide", save);
		return () => {
			clearInterval(timer);
			save();
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("pagehide", save);
		};
	}, [article.id, article.progress]);

	// Selecting text in the article offers "Highlight".
	useEffect(() => {
		const onSelect = () => {
			const picked = window.getSelection();
			const text = picked?.toString().trim() ?? "";
			if (
				!picked ||
				!text ||
				picked.rangeCount === 0 ||
				!body.current?.contains(picked.anchorNode)
			) {
				setSelection(null);
				return;
			}
			const rect = picked.getRangeAt(0).getBoundingClientRect();
			setSelection({
				text: text.slice(0, 2000),
				x: rect.left + rect.width / 2,
				y: rect.top + window.scrollY,
			});
		};
		document.addEventListener("selectionchange", onSelect);
		return () => document.removeEventListener("selectionchange", onSelect);
	}, []);

	const highlight = useMutation({
		mutationFn: (text: string) =>
			run(call(addHighlight, { id: article.id, text })),
		onSuccess: (next) => {
			window.getSelection()?.removeAllRanges();
			setSelection(null);
			setHighlights(next);
		},
		onError: (error) => toast.error(error.message),
	});
	const unhighlight = useMutation({
		mutationFn: (highlightId: string) =>
			run(call(removeHighlight, { id: article.id, highlightId })),
		onSuccess: setHighlights,
	});
	const toggleRead = useMutation({
		mutationFn: (read: boolean) =>
			run(call(markRead, { id: article.id, read })),
		onSuccess: (result) => {
			setUnread(result.unread);
			toast.success(result.unread ? "Back on your list" : "Marked as read");
		},
		onError: (error) => toast.error(error.message),
	});

	const minutesLeft = Math.max(
		0,
		Math.ceil(article.minutes * (1 - Math.min(progress, 1))),
	);

	return (
		<div className="min-h-dvh bg-canvas text-ink">
			<div
				className="fixed inset-x-0 top-0 z-30 h-0.5 origin-left bg-accent transition-transform"
				style={{ transform: `scaleX(${progress})` }}
			/>
			<header className="sticky top-0 z-20 border-b border-line bg-[color-mix(in_srgb,var(--canvas)_85%,transparent)] backdrop-blur">
				<div className="mx-auto flex h-12 max-w-3xl items-center gap-2 px-4">
					<a href="/read" className="icon-btn size-8" aria-label="Reading list">
						<ArrowLeft className="size-4" />
					</a>
					<span className="truncate text-sm text-muted">
						{article.siteName}
					</span>
					<span className="ml-auto shrink-0 text-xs text-muted tabular-nums">
						{progress >= 0.98 ? "Done" : `${minutesLeft} min left`}
					</span>
					<button
						type="button"
						className="btn-outline shrink-0 px-2.5 py-1 text-xs"
						onClick={() => toggleRead.mutate(unread)}
						disabled={toggleRead.isPending}
					>
						{unread ? (
							<>
								<Check className="size-3.5" /> Mark as read
							</>
						) : (
							<>
								<RotateCcw className="size-3.5" /> Read later
							</>
						)}
					</button>
					<a
						href={article.url}
						target="_blank"
						rel="noopener noreferrer"
						className="icon-btn size-8"
						aria-label="Open the original page"
						title="Open the original"
					>
						<ExternalLink className="size-4" />
					</a>
				</div>
			</header>
			<main className="mx-auto max-w-[68ch] px-5 pt-10 pb-24">
				<h1 className="text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
					{article.title}
				</h1>
				<p className="mt-3 text-sm text-muted">
					{[article.byline, `${article.minutes} min read`]
						.filter(Boolean)
						.join(" · ")}
				</p>
				<article
					ref={body}
					className="reader-prose mt-8"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized on the server (src/server/reader.ts allowlist)
					dangerouslySetInnerHTML={{ __html: article.html }}
				/>
				{highlights.length > 0 && (
					<section className="mt-16 border-t border-line pt-6">
						<h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
							<Highlighter className="size-4 text-accent" /> Your highlights
						</h2>
						<ul className="space-y-3">
							{highlights.map((item) => (
								<li
									key={item.id}
									className="group/hl flex items-start gap-2 rounded-xl border border-line p-3 text-sm"
								>
									<button
										type="button"
										className="flex-1 text-left"
										onClick={() =>
											document
												.querySelector(`[data-highlight="${item.id}"]`)
												?.scrollIntoView({
													behavior: "smooth",
													block: "center",
												})
										}
									>
										“{item.text}”
									</button>
									<button
										type="button"
										className="icon-btn size-7 opacity-0 group-hover/hl:opacity-100 pointer-coarse:opacity-100"
										aria-label="Remove highlight"
										onClick={() => unhighlight.mutate(item.id)}
									>
										<Trash2 className="size-3.5" />
									</button>
								</li>
							))}
						</ul>
					</section>
				)}
			</main>
			{selection && (
				<button
					type="button"
					className="btn-primary absolute z-40 -translate-x-1/2 -translate-y-full px-3 py-1.5 text-xs shadow-lg"
					style={{ left: selection.x, top: selection.y - 8 }}
					onPointerDown={(event) => event.preventDefault()}
					onClick={() => highlight.mutate(selection.text)}
				>
					<Highlighter className="size-3.5" /> Highlight
				</button>
			)}
		</div>
	);
}

export type ReadingItem = {
	id: string;
	title: string;
	url: string;
	favicon: string | null;
	minutes: number | null;
	progress: number;
	savedAt: Date | string;
};

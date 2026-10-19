import { ArrowUpRight, Globe, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Favicon } from "#/components/ui/Favicon";
import { cn } from "#/lib/cn";
import { SEARCH_ENGINES, type SearchEngine } from "#/lib/preferences";
import { hostnameOf, normalizeUrl } from "#/lib/url";
import type { LinkItem } from "./types";

type Result =
	| { kind: "bookmark"; bookmark: LinkItem; group: string }
	| { kind: "url"; url: string }
	| { kind: "search"; query: string };

type Props = {
	bookmarks: { bookmark: LinkItem; group: string }[];
	engine: SearchEngine;
	openInNewTab: boolean;
	onVisit: (bookmark: LinkItem) => void;
};

const score = (bookmark: LinkItem, terms: string[]) => {
	const title = bookmark.title.toLowerCase();
	const haystack = `${title} ${bookmark.url.toLowerCase()} ${bookmark.tags.join(" ").toLowerCase()}`;
	if (!terms.every((term) => haystack.includes(term))) return 0;
	return (
		(title.startsWith(terms[0]) ? 3 : 1) +
		Math.min(bookmark.visitCount, 50) / 50
	);
};

export function SearchBar({ bookmarks, engine, openInNewTab, onVisit }: Props) {
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const [focused, setFocused] = useState(false);
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			const typing =
				target.isContentEditable ||
				["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
			if (event.key === "/" && !typing) {
				event.preventDefault();
				input.current?.focus();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const results = useMemo<Result[]>(() => {
		const trimmed = query.trim();
		if (!trimmed) return [];
		const terms = trimmed.toLowerCase().split(/\s+/);
		const matches = bookmarks
			.map((entry) => ({ entry, score: score(entry.bookmark, terms) }))
			.filter((match) => match.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, 6)
			.map(({ entry }): Result => ({ kind: "bookmark", ...entry }));
		const url =
			!/\s/.test(trimmed) && trimmed.includes(".")
				? normalizeUrl(trimmed)
				: null;
		return [
			...matches,
			...(url ? [{ kind: "url", url } as Result] : []),
			{ kind: "search", query: trimmed },
		];
	}, [query, bookmarks]);

	// Reset the highlighted row whenever the result set changes.
	useEffect(() => {
		if (results) setActive(0);
	}, [results]);

	const open = (href: string, newTab: boolean) => {
		if (newTab) window.open(href, "_blank", "noopener");
		else window.location.assign(href);
	};

	const choose = (result: Result | undefined) => {
		if (!result) return;
		if (result.kind === "bookmark") {
			onVisit(result.bookmark);
			open(result.bookmark.url, openInNewTab);
		} else if (result.kind === "url") {
			open(result.url, openInNewTab);
		} else {
			open(
				SEARCH_ENGINES[engine].url + encodeURIComponent(result.query),
				false,
			);
		}
		setQuery("");
	};

	const showResults = focused && results.length > 0;

	return (
		<div className="relative mx-auto w-full max-w-2xl">
			<div
				className={cn(
					"glass flex items-center gap-3 rounded-2xl px-4 shadow-lg shadow-black/5 transition",
					showResults && "rounded-b-none",
					focused &&
						"ring-2 ring-[color-mix(in_srgb,var(--accent)_45%,transparent)]",
				)}
			>
				<Search className="size-5 shrink-0 text-muted" />
				<input
					ref={input}
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					onFocus={() => setFocused(true)}
					onBlur={() => setTimeout(() => setFocused(false), 120)}
					onKeyDown={(event) => {
						if (event.key === "ArrowDown") {
							event.preventDefault();
							setActive((index) => Math.min(index + 1, results.length - 1));
						} else if (event.key === "ArrowUp") {
							event.preventDefault();
							setActive((index) => Math.max(index - 1, 0));
						} else if (event.key === "Enter") {
							choose(results[active]);
						} else if (event.key === "Escape") {
							setQuery("");
							input.current?.blur();
						}
					}}
					placeholder={`Search ${SEARCH_ENGINES[engine].label} or your tabz…`}
					className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted"
					aria-label="Search"
					autoComplete="off"
					spellCheck={false}
				/>
				<kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-xs text-muted sm:block">
					/
				</kbd>
			</div>
			{showResults && (
				<ul className="glass absolute inset-x-0 top-full z-40 overflow-hidden rounded-b-2xl border-t-0 bg-surface-2 py-1.5 shadow-xl">
					{results.map((result, index) => (
						<li
							key={
								result.kind === "bookmark" ? result.bookmark.id : result.kind
							}
						>
							<button
								type="button"
								onMouseDown={(event) => event.preventDefault()}
								onMouseEnter={() => setActive(index)}
								onClick={() => choose(result)}
								className={cn(
									"flex w-full items-center gap-3 px-4 py-2 text-left text-sm",
									index === active &&
										"bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]",
								)}
							>
								{result.kind === "bookmark" ? (
									<>
										<Favicon
											url={result.bookmark.url}
											icon={result.bookmark.icon}
											favicon={result.bookmark.meta.favicon}
											title={result.bookmark.title}
											className="size-5 rounded text-base"
										/>
										<span className="truncate font-medium">
											{result.bookmark.title}
										</span>
										<span className="ml-auto truncate text-xs text-muted">
											{result.group} · {hostnameOf(result.bookmark.url)}
										</span>
									</>
								) : result.kind === "url" ? (
									<>
										<Globe className="size-5 text-muted" />
										<span className="truncate">
											Go to {hostnameOf(result.url)}
										</span>
										<ArrowUpRight className="ml-auto size-4 text-muted" />
									</>
								) : (
									<>
										<Search className="size-5 text-muted" />
										<span className="truncate">
											Search {SEARCH_ENGINES[engine].label} for “{result.query}”
										</span>
									</>
								)}
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

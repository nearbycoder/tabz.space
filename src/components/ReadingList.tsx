import { ArrowLeft, BookOpen } from "lucide-react";
import { Favicon } from "#/components/ui/Favicon";
import { hostnameOf } from "#/lib/url";
import type { ReadingItem } from "./Reader";

export function ReadingList({ items }: { items: ReadingItem[] }) {
	const total = items.reduce((sum, item) => sum + (item.minutes ?? 0), 0);
	return (
		<div className="min-h-dvh bg-canvas text-ink">
			<main className="mx-auto max-w-2xl px-5 py-10">
				<a
					href="/"
					className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
				>
					<ArrowLeft className="size-4" /> tabz
				</a>
				<h1 className="mt-4 flex items-center gap-2 text-2xl font-bold tracking-tight">
					<BookOpen className="size-6 text-accent" /> Read later
				</h1>
				<p className="mt-1 text-sm text-muted">
					{items.length === 0
						? "Nothing saved yet. Use “Read later” in the extension, the ⌘K menu, or a link's edit dialog."
						: `${items.length} article${items.length === 1 ? "" : "s"}${total ? ` · about ${total} min` : ""}. Opened articles stay readable offline.`}
				</p>
				<ul className="mt-6 space-y-2">
					{items.map((item) => (
						<li key={item.id}>
							<a
								href={`/read/${item.id}`}
								className="focus-ring flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3 transition hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))]"
							>
								<Favicon
									url={item.url}
									favicon={item.favicon ?? undefined}
									title={item.title}
									className="size-6 shrink-0 rounded-md"
								/>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm font-medium">
										{item.title}
									</span>
									<span className="block truncate text-xs text-muted">
										{hostnameOf(item.url)}
										{item.minutes ? ` · ${item.minutes} min` : ""}
										{item.progress > 0.02 && item.progress < 0.98
											? ` · ${Math.round(item.progress * 100)}% read`
											: ""}
									</span>
								</span>
								{item.progress > 0.02 && (
									<span className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-line">
										<span
											className="block h-full bg-accent"
											style={{ width: `${Math.round(item.progress * 100)}%` }}
										/>
									</span>
								)}
							</a>
						</li>
					))}
				</ul>
			</main>
		</div>
	);
}

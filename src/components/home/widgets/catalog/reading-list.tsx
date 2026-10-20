import { useQuery } from "@tanstack/react-query";
import { Favicon } from "#/components/ui/Favicon";
import { call, run } from "#/lib/api";
import { getReadingList } from "#/server/home";
import { Hint, type WidgetProps } from "../kit";

type Data = { count: number };

/** Read later: saved articles with read times; opens them in the reader. */
export default function ReadingList({ data }: WidgetProps<Data>) {
	const list = useQuery({
		queryKey: ["reading-list"],
		queryFn: () => run(call(getReadingList)),
		staleTime: 60_000,
	});
	const items = (list.data ?? []).slice(
		0,
		Math.min(20, Math.max(1, data.count || 6)),
	);
	if (list.isPending) return <Hint>Loading…</Hint>;
	if (!items.length)
		return (
			<Hint>Nothing to read. Use “Read later” in ⌘K or the extension.</Hint>
		);
	return (
		<div className="space-y-0.5">
			{items.map((item) => (
				<a
					key={item.id}
					href={`/read/${item.id}`}
					className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]"
				>
					<Favicon
						url={item.url}
						favicon={item.favicon ?? undefined}
						title={item.title}
						className="size-5 shrink-0 rounded"
					/>
					<span className="min-w-0 flex-1 truncate">{item.title}</span>
					<span className="shrink-0 text-xs text-muted tabular-nums">
						{item.progress > 0.02 && item.progress < 0.98
							? `${Math.round(item.progress * 100)}%`
							: item.minutes
								? `${item.minutes} min`
								: ""}
					</span>
				</a>
			))}
			{(list.data?.length ?? 0) > items.length && (
				<a
					href="/read"
					className="block px-1.5 pt-1 text-xs font-medium text-accent hover:underline"
				>
					All {list.data?.length} →
				</a>
			)}
		</div>
	);
}

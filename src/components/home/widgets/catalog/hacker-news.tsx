import { MessageSquare } from "lucide-react";
import { Status, useJson, type WidgetProps } from "../kit";

type Data = { list: string; count: number };
type Hit = {
	title: string;
	url?: string;
	points: number;
	num_comments: number;
	objectID: string;
};

export default function HackerNews({ data }: WidgetProps<Data>) {
	const count = Math.min(20, Math.max(1, data.count || 8));
	const query = useJson<{ hits: Hit[] }>(
		`https://hn.algolia.com/api/v1/search?tags=${encodeURIComponent(data.list || "front_page")}&hitsPerPage=${count}`,
		{
			pick: [
				"hits[].title",
				"hits[].url",
				"hits[].points",
				"hits[].num_comments",
				"hits[].objectID",
			],
			ttl: 300,
			refresh: 10,
		},
	);
	return (
		<Status query={query}>
			<ol className="space-y-0.5">
				{query.data?.hits.map((hit) => {
					const discussion = `https://news.ycombinator.com/item?id=${hit.objectID}`;
					return (
						<li
							key={hit.objectID}
							className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]"
						>
							<span className="w-8 shrink-0 text-right text-xs text-[#ff6600] tabular-nums">
								{hit.points}
							</span>
							<a
								href={hit.url || discussion}
								target="_blank"
								rel="noreferrer"
								className="min-w-0 flex-1 truncate"
							>
								{hit.title}
							</a>
							<a
								href={discussion}
								target="_blank"
								rel="noreferrer"
								className="flex shrink-0 items-center gap-0.5 text-xs text-muted hover:text-ink"
								aria-label={`${hit.num_comments} comments`}
							>
								<MessageSquare className="size-3" />
								{hit.num_comments}
							</a>
						</li>
					);
				})}
			</ol>
		</Status>
	);
}

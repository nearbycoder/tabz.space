import { useQuery } from "@tanstack/react-query";
import { call, run } from "#/lib/api";
import { getFeed } from "#/server/home";
import { ago, Hint, Row, Status, type WidgetProps } from "../kit";

type Data = { subreddit: string; sort: "top" | "hot" | "new"; count: number };

export default function Reddit({ data }: WidgetProps<Data>) {
	const subreddit = data.subreddit
		.replace(/^\/?r\//i, "")
		.replace(/[^\w]/g, "");
	const url = `https://www.reddit.com/r/${subreddit}/${data.sort === "top" ? "top/.rss?t=day" : `${data.sort}/.rss`}`;
	const count = Math.min(20, Math.max(1, data.count || 6));
	const query = useQuery({
		queryKey: ["feed", url, count],
		queryFn: () => run(call(getFeed, { url, count })),
		enabled: Boolean(subreddit),
		staleTime: 10 * 60_000,
		refetchInterval: 15 * 60_000,
	});
	if (!subreddit) return <Hint>Pick a subreddit in the widget's settings</Hint>;
	return (
		<Status query={query}>
			<p className="mb-1 px-1.5 text-xs text-muted">r/{subreddit}</p>
			{query.data?.map((item) => (
				<Row
					key={`${item.at}${item.title}`}
					href={item.url}
					aside={ago(item.at)}
				>
					{item.title}
				</Row>
			))}
		</Status>
	);
}

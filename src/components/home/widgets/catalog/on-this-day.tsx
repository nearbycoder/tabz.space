import { Hint, pad, Status, useJson, type WidgetProps } from "../kit";

type Data = { count: number };
type Event = {
	text: string;
	year: number;
	pages?: { content_urls?: { desktop?: { page?: string } } }[];
};

export default function OnThisDay({ data }: WidgetProps<Data>) {
	const today = new Date();
	const count = Math.min(10, Math.max(1, data.count || 5));
	const query = useJson<{ selected?: Event[] }>(
		`https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/${pad(today.getMonth() + 1)}/${pad(today.getDate())}`,
		{
			pick: [
				`selected[${count}].text`,
				`selected[${count}].year`,
				`selected[${count}].pages[1].content_urls.desktop.page`,
			],
			ttl: 21_600,
			refresh: 360,
		},
	);
	const events = (query.data?.selected ?? []).sort((a, b) => b.year - a.year);
	return (
		<Status query={query}>
			{events.length === 0 ? (
				<Hint>Nothing found for today</Hint>
			) : (
				<ul className="space-y-2">
					{events.map((event) => (
						<li
							key={`${event.year}-${event.text.slice(0, 20)}`}
							className="flex gap-2 text-sm"
						>
							<span className="w-10 shrink-0 font-medium text-accent tabular-nums">
								{event.year}
							</span>
							<a
								href={event.pages?.[0]?.content_urls?.desktop?.page}
								target="_blank"
								rel="noreferrer"
								className="line-clamp-3 hover:underline"
							>
								{event.text}
							</a>
						</li>
					))}
				</ul>
			)}
		</Status>
	);
}

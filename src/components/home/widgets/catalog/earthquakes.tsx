import { ago, Hint, Status, useJson, type WidgetProps } from "../kit";

type Data = { feed: string; count: number };
type Quake = {
	properties: { mag: number; place: string; time: number; url: string };
};

const FEEDS = new Set(["significant_week", "4.5_day", "2.5_day", "4.5_week"]);

export default function Earthquakes({ data }: WidgetProps<Data>) {
	const feed = FEEDS.has(data.feed) ? data.feed : "significant_week";
	const count = Math.min(20, Math.max(1, data.count || 6));
	const query = useJson<{ features?: Quake[] }>(
		`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`,
		{
			pick: [
				`features[${count}].properties.mag`,
				`features[${count}].properties.place`,
				`features[${count}].properties.time`,
				`features[${count}].properties.url`,
			],
			ttl: 600,
			refresh: 15,
		},
	);
	const quakes = query.data?.features ?? [];
	return (
		<Status query={query}>
			{quakes.length === 0 ? (
				<Hint>No earthquakes in this list right now</Hint>
			) : (
				<ul className="space-y-0.5">
					{quakes.map(({ properties: quake }) => (
						<li key={quake.url}>
							<a
								href={quake.url}
								target="_blank"
								rel="noreferrer"
								className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]"
							>
								<span
									className="grid h-6 w-9 shrink-0 place-items-center rounded-md text-xs font-semibold text-white tabular-nums"
									style={{
										background:
											quake.mag >= 6
												? "#dc2626"
												: quake.mag >= 5
													? "#f97316"
													: "#eab308",
									}}
								>
									{quake.mag.toFixed(1)}
								</span>
								<span className="min-w-0 flex-1 truncate">{quake.place}</span>
								<span className="shrink-0 text-xs text-muted">
									{ago(quake.time)}
								</span>
							</a>
						</li>
					))}
				</ul>
			)}
		</Status>
	);
}

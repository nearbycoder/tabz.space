import { Hint, Status, useJson, type WidgetProps } from "../kit";

type Data = { place: string; lat: number; lon: number };
type Air = {
	current?: { us_aqi?: number; pm2_5?: number; pm10?: number; ozone?: number };
};

const LEVELS: [number, string, string][] = [
	[50, "Good", "#22c55e"],
	[100, "Moderate", "#eab308"],
	[150, "Unhealthy for sensitive groups", "#f97316"],
	[200, "Unhealthy", "#ef4444"],
	[300, "Very unhealthy", "#a855f7"],
	[Number.POSITIVE_INFINITY, "Hazardous", "#7f1d1d"],
];

export default function AirQuality({ data }: WidgetProps<Data>) {
	const query = useJson<Air>(
		data.place
			? `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${data.lat}&longitude=${data.lon}&current=us_aqi,pm2_5,pm10,ozone`
			: null,
		{ ttl: 1800, refresh: 30 },
	);
	if (!data.place) return <Hint>Pick a city in the widget's settings</Hint>;
	const current = query.data?.current;
	const aqi = current?.us_aqi;
	const [, label, color] =
		LEVELS.find(([limit]) => (aqi ?? 0) <= limit) ?? LEVELS[0];
	return (
		<Status query={query}>
			<div className="space-y-2">
				<div className="flex items-center gap-3">
					<div
						className="grid size-16 shrink-0 place-items-center rounded-2xl text-2xl font-semibold text-white"
						style={{ background: color }}
					>
						{aqi ?? "–"}
					</div>
					<div>
						<p className="font-medium">{label}</p>
						<p className="text-sm text-muted">US AQI · {data.place}</p>
					</div>
				</div>
				<div className="grid grid-cols-3 gap-1.5 text-center text-xs">
					{(
						[
							["PM2.5", current?.pm2_5],
							["PM10", current?.pm10],
							["Ozone", current?.ozone],
						] as const
					).map(([name, value]) => (
						<div
							key={name}
							className="rounded-lg bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] py-1.5"
						>
							<p className="font-medium tabular-nums">{value ?? "–"}</p>
							<p className="text-muted">{name} µg/m³</p>
						</div>
					))}
				</div>
			</div>
		</Status>
	);
}

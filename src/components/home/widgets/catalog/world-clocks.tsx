import { Hint, pad, useNow, type WidgetProps } from "../kit";
import { cityOf, timeIn } from "../time";

type Data = { zones: string[]; hour12: boolean };

export default function WorldClocks({ data }: WidgetProps<Data>) {
	const now = useNow(15_000);
	if (!data.zones.length)
		return <Hint>Add cities in the widget's settings</Hint>;
	const here = now ? timeIn(now, "") : null;
	return (
		<ul className="divide-y divide-line">
			{data.zones.map((zone) => {
				const time = now ? timeIn(now, zone) : null;
				const dayShift = time && here ? time.day - here.day : 0;
				const offset =
					time && here
						? Math.round(
								((time.day - here.day) * 24 +
									time.hour -
									here.hour +
									(time.minute - here.minute) / 60) *
									2,
							) / 2
						: 0;
				const display = time
					? data.hour12
						? `${time.hour % 12 || 12}:${pad(time.minute)} ${time.hour < 12 ? "AM" : "PM"}`
						: `${pad(time.hour)}:${pad(time.minute)}`
					: "--:--";
				return (
					<li key={zone} className="flex items-center gap-2 py-1.5">
						<span className="text-base">
							{time && time.hour >= 7 && time.hour < 19 ? "☀️" : "🌙"}
						</span>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-sm">{cityOf(zone)}</span>
							<span className="block text-xs text-muted">
								{dayShift > 0
									? "Tomorrow"
									: dayShift < 0
										? "Yesterday"
										: "Today"}
								{offset !== 0 && `, ${offset > 0 ? "+" : ""}${offset}h`}
							</span>
						</span>
						<span className="text-xl font-medium tabular-nums">{display}</span>
					</li>
				);
			})}
		</ul>
	);
}

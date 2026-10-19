import { Bar, useNow, type WidgetProps } from "../kit";

const span = (start: Date, end: Date, now: Date) =>
	(now.getTime() - start.getTime()) / (end.getTime() - start.getTime());

export default function YearProgress(_: WidgetProps<object>) {
	const now = useNow(60_000);
	if (!now) return <div className="h-40" />;
	const y = now.getFullYear();
	const m = now.getMonth();
	const d = now.getDate();
	const monday = new Date(y, m, d - ((now.getDay() + 6) % 7));
	const rows: [string, number][] = [
		["Today", span(new Date(y, m, d), new Date(y, m, d + 1), now)],
		[
			"This week",
			span(
				monday,
				new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7),
				now,
			),
		],
		[
			now.toLocaleDateString(undefined, { month: "long" }),
			span(new Date(y, m, 1), new Date(y, m + 1, 1), now),
		],
		[String(y), span(new Date(y, 0, 1), new Date(y + 1, 0, 1), now)],
	];
	return (
		<div className="space-y-2.5">
			{rows.map(([label, value]) => (
				<div key={label} className="space-y-1">
					<div className="flex justify-between text-sm">
						<span>{label}</span>
						<span className="text-muted tabular-nums">
							{(value * 100).toFixed(value < 0.1 ? 1 : 0)}%
						</span>
					</div>
					<Bar value={value} />
				</div>
			))}
		</div>
	);
}

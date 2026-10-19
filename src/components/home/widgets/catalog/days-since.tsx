import { dayKey, Hint, useNow, type WidgetProps } from "../kit";

type Data = { label: string; since: string };

export default function DaysSince({ data, save, readOnly }: WidgetProps<Data>) {
	const now = useNow(60_000);
	if (!data.since) return <Hint>Pick a date in the widget's settings</Hint>;
	const start = new Date(`${data.since}T00:00`);
	const days = now
		? Math.floor(
				(new Date(`${dayKey(now)}T00:00`).getTime() - start.getTime()) /
					86_400_000,
			)
		: null;
	return (
		<div className="flex flex-col items-center gap-1 py-2">
			<p className="text-5xl font-semibold tabular-nums">{days ?? "–"}</p>
			<p className="text-sm text-muted">
				{days === 1 ? "day" : "days"} since{" "}
				{data.label || start.toLocaleDateString()}
			</p>
			{!readOnly && (
				<button
					type="button"
					className="btn-ghost mt-1 text-xs"
					onClick={() => save({ ...data, since: dayKey() }, { now: true })}
				>
					Reset to today
				</button>
			)}
		</div>
	);
}

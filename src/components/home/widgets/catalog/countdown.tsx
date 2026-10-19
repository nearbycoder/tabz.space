import { Hint, useNow, type WidgetProps } from "../kit";

type Data = { label: string; target: string };

export default function Countdown({ data }: WidgetProps<Data>) {
	const now = useNow(1000);
	const target = new Date(data.target);
	if (!data.target || Number.isNaN(target.getTime()))
		return <Hint>Pick a date in the widget's settings</Hint>;
	const left = now ? target.getTime() - now.getTime() : 0;
	const units = [
		[Math.floor(left / 86_400_000), "days"],
		[Math.floor((left / 3_600_000) % 24), "hours"],
		[Math.floor((left / 60_000) % 60), "min"],
		[Math.floor((left / 1000) % 60), "sec"],
	] as const;
	return (
		<div className="space-y-2 py-1 text-center">
			{data.label && <p className="text-sm text-muted">{data.label}</p>}
			{now && left <= 0 ? (
				<p className="text-2xl font-semibold">🎉 It's here!</p>
			) : (
				<div className="grid grid-cols-4 gap-1.5">
					{units.map(([value, unit]) => (
						<div
							key={unit}
							className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] py-2"
						>
							<p className="text-2xl font-semibold tabular-nums">
								{now ? value : "–"}
							</p>
							<p className="text-[11px] text-muted">{unit}</p>
						</div>
					))}
				</div>
			)}
			<p className="text-xs text-muted">
				{target.toLocaleString(undefined, {
					dateStyle: "medium",
					timeStyle: "short",
				})}
			</p>
		</div>
	);
}

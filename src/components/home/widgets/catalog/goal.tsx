import { Minus, Plus } from "lucide-react";
import { Bar, RoundButton, type WidgetProps } from "../kit";

type Data = {
	label: string;
	current: number;
	target: number;
	unit: string;
	step: number;
};

const round = (value: number) => Math.round(value * 100) / 100;

export default function Goal({ data, save, readOnly }: WidgetProps<Data>) {
	const progress = data.target > 0 ? data.current / data.target : 0;
	const change = (delta: number) =>
		save({ ...data, current: Math.max(0, round(data.current + delta)) });
	return (
		<div className="space-y-3">
			<div className="flex items-end justify-between gap-2">
				<div className="min-w-0">
					<p className="truncate text-sm text-muted">{data.label}</p>
					<p className="text-2xl font-semibold tabular-nums">
						{data.current}
						<span className="text-base font-normal text-muted">
							{" "}
							/ {data.target} {data.unit}
						</span>
					</p>
				</div>
				<span className="text-sm font-medium text-accent tabular-nums">
					{Math.round(progress * 100)}%
				</span>
			</div>
			<Bar value={progress} />
			{!readOnly && (
				<div className="flex justify-center gap-3">
					<RoundButton label="Less" onClick={() => change(-(data.step || 1))}>
						<Minus className="size-4" />
					</RoundButton>
					<RoundButton
						primary
						label="More"
						onClick={() => change(data.step || 1)}
					>
						<Plus className="size-4" />
					</RoundButton>
				</div>
			)}
			{progress >= 1 && <p className="text-center text-sm">🎉 Goal reached!</p>}
		</div>
	);
}

import { Minus, Plus, RotateCcw } from "lucide-react";
import { dayKey, RoundButton, type WidgetProps } from "../kit";

type Data = {
	label: string;
	value: number;
	step: number;
	daily: boolean;
	day: string;
};

export default function Counter({ data, save, readOnly }: WidgetProps<Data>) {
	const today = dayKey();
	const value = data.daily && data.day !== today ? 0 : data.value;
	const set = (next: number) =>
		save({ ...data, value: Math.max(0, next), day: today });
	return (
		<div className="flex flex-col items-center gap-3 py-2">
			{data.label && <p className="text-sm text-muted">{data.label}</p>}
			<p className="text-5xl font-semibold tabular-nums">{value}</p>
			{data.daily && <p className="text-xs text-muted">today</p>}
			{!readOnly && (
				<div className="flex items-center gap-3">
					<RoundButton
						label="Minus"
						onClick={() => set(value - (data.step || 1))}
					>
						<Minus className="size-4" />
					</RoundButton>
					<RoundButton
						primary
						label="Plus"
						onClick={() => set(value + (data.step || 1))}
					>
						<Plus className="size-4" />
					</RoundButton>
					<RoundButton label="Reset" onClick={() => set(0)}>
						<RotateCcw className="size-4" />
					</RoundButton>
				</div>
			)}
		</div>
	);
}

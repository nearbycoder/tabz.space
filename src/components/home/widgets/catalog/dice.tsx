import { useState } from "react";
import { Segmented } from "#/components/ui/controls";
import { randomInt, type WidgetProps } from "../kit";

type Data = { count: number; sides: number };

const FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export default function Dice({ data, save, readOnly }: WidgetProps<Data>) {
	const count = Math.min(8, Math.max(1, data.count || 2));
	const sides = data.sides || 6;
	const [rolls, setRolls] = useState<number[]>([]);
	const [rolling, setRolling] = useState(false);
	const roll = () => {
		setRolling(true);
		setTimeout(() => {
			setRolls(Array.from({ length: count }, () => randomInt(sides) + 1));
			setRolling(false);
		}, 300);
	};
	const update = (patch: Partial<Data>) => {
		if (!readOnly) save({ ...data, ...patch }, { now: true });
		setRolls([]);
	};
	return (
		<div className="space-y-2.5">
			<div className="flex min-h-16 flex-wrap items-center justify-center gap-2">
				{rolls.length === 0 && (
					<span className="text-sm text-muted">Tap roll</span>
				)}
				{rolls.map((value, index) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: dice positions
						key={index}
						className={`${rolling ? "animate-spin" : "animate-pop"} grid size-12 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] font-semibold ${sides === 6 ? "text-4xl" : "text-lg"}`}
					>
						{sides === 6 ? FACES[value - 1] : value}
					</span>
				))}
			</div>
			{rolls.length > 1 && (
				<p className="text-center text-sm text-muted">
					Total {rolls.reduce((sum, value) => sum + value, 0)}
				</p>
			)}
			<Segmented
				value={sides}
				onChange={(value) => update({ sides: value })}
				options={[4, 6, 8, 10, 12, 20].map((value) => ({
					value,
					label: `d${value}`,
				}))}
			/>
			<div className="flex gap-1.5">
				<select
					className="field w-20"
					value={count}
					onChange={(event) => update({ count: Number(event.target.value) })}
					aria-label="Number of dice"
				>
					{[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
						<option key={value} value={value}>
							{value}×
						</option>
					))}
				</select>
				<button type="button" className="btn-primary flex-1" onClick={roll}>
					Roll
				</button>
			</div>
		</div>
	);
}

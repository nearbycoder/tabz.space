import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Segmented } from "#/components/ui/controls";
import { RoundButton, type WidgetProps } from "../kit";

type Data = { tip: number; people: number };

export default function TipSplit({ data, save, readOnly }: WidgetProps<Data>) {
	const [bill, setBill] = useState("");
	const amount = Number.parseFloat(bill.replace(",", ".")) || 0;
	const people = Math.max(1, data.people || 1);
	const tip = (amount * data.tip) / 100;
	const money = (value: number) =>
		value.toLocaleString(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		});
	const update = (patch: Partial<Data>) =>
		!readOnly && save({ ...data, ...patch });
	return (
		<div className="space-y-2.5">
			<input
				className="field text-lg tabular-nums"
				value={bill}
				onChange={(event) => setBill(event.target.value)}
				placeholder="Bill amount"
				inputMode="decimal"
				aria-label="Bill"
			/>
			<Segmented
				value={data.tip}
				onChange={(value) => update({ tip: value })}
				options={[10, 15, 18, 20, 25].map((value) => ({
					value,
					label: `${value}%`,
				}))}
			/>
			<div className="flex items-center justify-between">
				<span className="text-sm text-muted">People</span>
				<div className="flex items-center gap-2">
					<RoundButton
						label="Fewer people"
						onClick={() => update({ people: Math.max(1, people - 1) })}
					>
						<Minus className="size-4" />
					</RoundButton>
					<span className="w-6 text-center font-medium tabular-nums">
						{people}
					</span>
					<RoundButton
						label="More people"
						onClick={() => update({ people: Math.min(50, people + 1) })}
					>
						<Plus className="size-4" />
					</RoundButton>
				</div>
			</div>
			<div className="grid grid-cols-3 gap-1.5 text-center">
				{(
					[
						["Tip", tip],
						["Total", amount + tip],
						["Each", (amount + tip) / people],
					] as const
				).map(([label, value]) => (
					<div
						key={label}
						className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] py-2"
					>
						<p className="font-semibold tabular-nums">{money(value)}</p>
						<p className="text-[11px] text-muted">{label}</p>
					</div>
				))}
			</div>
		</div>
	);
}

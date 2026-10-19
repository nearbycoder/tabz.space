import { X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Bar, dayKey, randomId, type WidgetProps } from "../kit";

type Item = { id: string; day: string; amount: number; note: string };
type Data = { currency: string; budget: number; items: Item[] };

export default function Expenses({ data, save, readOnly }: WidgetProps<Data>) {
	const [amount, setAmount] = useState("");
	const [note, setNote] = useState("");
	const month = dayKey().slice(0, 7);
	const thisMonth = data.items.filter((item) => item.day.startsWith(month));
	const total = thisMonth.reduce((sum, item) => sum + item.amount, 0);
	const money = (value: number) =>
		`${data.currency}${value.toLocaleString(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		})}`;
	const add = (event: FormEvent) => {
		event.preventDefault();
		const value = Number.parseFloat(amount.replace(",", "."));
		if (!Number.isFinite(value) || value <= 0) return;
		save(
			{
				...data,
				items: [
					{ id: randomId(), day: dayKey(), amount: value, note: note.trim() },
					...data.items,
				].slice(0, 500),
			},
			{ now: true },
		);
		setAmount("");
		setNote("");
	};
	return (
		<div className="space-y-2.5">
			<div className="flex items-baseline justify-between">
				<span className="text-sm text-muted">
					{new Date().toLocaleDateString(undefined, { month: "long" })}
				</span>
				<span className="text-2xl font-semibold tabular-nums">
					{money(total)}
				</span>
			</div>
			{data.budget > 0 && (
				<div className="space-y-1">
					<Bar value={total / data.budget} />
					<p className="text-right text-xs text-muted">
						{total <= data.budget
							? `${money(data.budget - total)} left of ${money(data.budget)}`
							: `${money(total - data.budget)} over budget`}
					</p>
				</div>
			)}
			{!readOnly && (
				<form onSubmit={add} className="flex gap-1.5">
					<input
						className="field w-24 shrink-0"
						value={amount}
						onChange={(event) => setAmount(event.target.value)}
						placeholder="0.00"
						inputMode="decimal"
						aria-label="Amount"
					/>
					<input
						className="field"
						value={note}
						onChange={(event) => setNote(event.target.value)}
						placeholder="What for?"
						maxLength={60}
						aria-label="Note"
					/>
					<button type="submit" className="btn-primary shrink-0">
						Add
					</button>
				</form>
			)}
			<ul className="space-y-0.5">
				{thisMonth.slice(0, 5).map((item) => (
					<li
						key={item.id}
						className="group/row flex items-center gap-2 rounded-lg px-1 py-1 text-sm"
					>
						<span className="w-12 shrink-0 text-xs text-muted">
							{new Date(`${item.day}T12:00`).toLocaleDateString(undefined, {
								month: "short",
								day: "numeric",
							})}
						</span>
						<span className="min-w-0 flex-1 truncate">{item.note || "—"}</span>
						<span className="tabular-nums">{money(item.amount)}</span>
						{!readOnly && (
							<button
								type="button"
								aria-label="Remove"
								onClick={() =>
									save(
										{
											...data,
											items: data.items.filter((other) => other.id !== item.id),
										},
										{ now: true },
									)
								}
								className="icon-btn size-6 opacity-0 group-hover/row:opacity-100 pointer-coarse:opacity-100"
							>
								<X className="size-3.5" />
							</button>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}

import { Check, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { cn } from "#/lib/cn";
import { dayKey, type WidgetProps } from "../kit";

type Item = { text: string; done: boolean };
type Data = { day: string; items: Item[] };

const MEDALS = ["🥇", "🥈", "🥉"];

/** Three priorities for today; yesterday's list clears itself. */
export default function TopThree({ data, save, readOnly }: WidgetProps<Data>) {
	const today = dayKey();
	const items = data.day === today ? data.items : [];
	const [draft, setDraft] = useState("");
	const update = (next: Item[]) =>
		save({ day: today, items: next }, { now: true });
	const add = (event: FormEvent) => {
		event.preventDefault();
		if (!draft.trim()) return;
		update([...items, { text: draft.trim(), done: false }]);
		setDraft("");
	};
	const finished = items.length > 0 && items.every((item) => item.done);
	return (
		<div className="space-y-1.5">
			{items.map((item, index) => (
				<div
					key={item.text}
					className="group/item flex items-center gap-2 rounded-lg px-1 py-1"
				>
					<span className="text-lg leading-none">{MEDALS[index]}</span>
					<button
						type="button"
						disabled={readOnly}
						onClick={() =>
							update(
								items.map((other, i) =>
									i === index ? { ...other, done: !other.done } : other,
								),
							)
						}
						className={cn(
							"min-w-0 flex-1 truncate text-left text-sm",
							item.done && "text-muted line-through",
						)}
					>
						{item.text}
					</button>
					{item.done && <Check className="size-4 text-accent" />}
					{!readOnly && (
						<button
							type="button"
							aria-label={`Remove ${item.text}`}
							onClick={() => update(items.filter((_, i) => i !== index))}
							className="icon-btn size-6 opacity-0 group-hover/item:opacity-100 pointer-coarse:opacity-100"
						>
							<X className="size-3.5" />
						</button>
					)}
				</div>
			))}
			{finished && (
				<p className="text-center text-sm text-muted">All done today. Nice!</p>
			)}
			{!readOnly && items.length < 3 && (
				<form onSubmit={add}>
					<input
						className="field"
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						placeholder={
							items.length === 0 ? "What matters most today?" : "Next priority…"
						}
						maxLength={120}
					/>
				</form>
			)}
		</div>
	);
}

import { Check } from "lucide-react";
import { cn } from "#/lib/cn";
import { dayKey, Hint, lastDays, type WidgetProps } from "../kit";

type Data = { habits: string[]; done: Record<string, string[]> };

/** Days in a row, counting back from today (or yesterday, if today isn't done yet). */
const streak = (done: Data["done"], habit: string) => {
	const date = new Date();
	if (!done[dayKey(date)]?.includes(habit)) date.setDate(date.getDate() - 1);
	let count = 0;
	while (done[dayKey(date)]?.includes(habit)) {
		count++;
		date.setDate(date.getDate() - 1);
	}
	return count;
};

const weekday = (day: string) =>
	new Date(`${day}T12:00`).toLocaleDateString(undefined, { weekday: "narrow" });

export default function Habits({ data, save, readOnly }: WidgetProps<Data>) {
	const days = lastDays(7);
	if (!data.habits.length)
		return <Hint>Add habits in the widget's settings</Hint>;
	const toggle = (habit: string, day: string) => {
		const list = data.done[day] ?? [];
		const next = list.includes(habit)
			? list.filter((item) => item !== habit)
			: [...list, habit];
		const oldest = lastDays(400)[0];
		const done = Object.fromEntries(
			Object.entries({ ...data.done, [day]: next }).filter(
				([key, value]) => value.length > 0 && key >= oldest,
			),
		);
		save({ ...data, done }, { now: true });
	};
	const columns =
		"grid grid-cols-[minmax(0,1fr)_repeat(7,1.3rem)_1.4rem] items-center gap-px";
	return (
		<div className="space-y-1 text-sm">
			<div className={cn(columns, "text-center text-[10px] text-muted")}>
				<span />
				{days.map((day) => (
					<span key={day}>{weekday(day)}</span>
				))}
				<span title="Current streak">🔥</span>
			</div>
			{data.habits.map((habit) => (
				<div key={habit} className={columns}>
					<span className="truncate pr-1">{habit}</span>
					{days.map((day, index) => {
						const on = Boolean(data.done[day]?.includes(habit));
						return (
							<button
								key={day}
								type="button"
								disabled={readOnly}
								aria-pressed={on}
								aria-label={`${habit}, ${day}`}
								onClick={() => toggle(habit, day)}
								className={cn(
									"focus-ring mx-auto grid size-5 place-items-center rounded-md border transition active:scale-90",
									on
										? "border-accent bg-accent text-white"
										: "border-line hover:border-accent",
									index === 6 && !on && "border-accent/50",
								)}
							>
								{on && <Check className="size-3" />}
							</button>
						);
					})}
					<span className="text-center text-xs text-muted tabular-nums">
						{streak(data.done, habit)}
					</span>
				</div>
			))}
		</div>
	);
}

import { cn } from "#/lib/cn";
import { dayKey, lastDays, type WidgetProps } from "../kit";

type Data = { log: Record<string, string> };

const MOODS = ["😞", "😕", "😐", "🙂", "😄"];

export default function Mood({ data, save, readOnly }: WidgetProps<Data>) {
	const today = dayKey();
	const days = lastDays(14);
	const set = (mood: string) => {
		const oldest = lastDays(400)[0];
		const log = Object.fromEntries(
			Object.entries({ ...data.log, [today]: mood }).filter(
				([day]) => day >= oldest,
			),
		);
		save({ log }, { now: true });
	};
	return (
		<div className="space-y-3">
			<p className="text-center text-sm text-muted">How are you feeling?</p>
			<div className="flex justify-center gap-1.5">
				{MOODS.map((mood) => (
					<button
						key={mood}
						type="button"
						disabled={readOnly}
						aria-pressed={data.log[today] === mood}
						onClick={() => set(mood)}
						className={cn(
							"focus-ring grid size-10 place-items-center rounded-full text-2xl transition hover:scale-110",
							data.log[today] === mood
								? "bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] ring-2 ring-accent"
								: "opacity-70",
						)}
					>
						{mood}
					</button>
				))}
			</div>
			<div className="grid grid-cols-14 gap-0.5" title="Last two weeks">
				{days.map((day) => (
					<span
						key={day}
						title={day}
						className="grid aspect-square place-items-center rounded bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] text-xs"
					>
						{data.log[day] ?? ""}
					</span>
				))}
			</div>
		</div>
	);
}

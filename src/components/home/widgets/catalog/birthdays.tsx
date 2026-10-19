import { Hint, useNow, type WidgetProps } from "../kit";

type Data = { people: string[] };

export default function Birthdays({ data }: WidgetProps<Data>) {
	const now = useNow(3_600_000);
	if (!data.people.length)
		return <Hint>Add people in the widget's settings</Hint>;
	if (!now) return <div className="h-24" />;
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const upcoming = data.people
		.map((line) => {
			const [name, when = ""] = line.split("|").map((part) => part.trim());
			const match = when.match(/^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/);
			if (!name || !match) return null;
			const [, year, month, day] = match.map(Number);
			let next = new Date(today.getFullYear(), month - 1, day);
			if (next < today)
				next = new Date(today.getFullYear() + 1, month - 1, day);
			return {
				name,
				next,
				days: Math.round((next.getTime() - today.getTime()) / 86_400_000),
				age: year ? next.getFullYear() - year : null,
			};
		})
		.filter((entry) => entry !== null)
		.sort((a, b) => a.days - b.days)
		.slice(0, 6);
	if (!upcoming.length) return <Hint>Use “Name | MM-DD”, one per line</Hint>;
	return (
		<ul className="space-y-1">
			{upcoming.map((person) => (
				<li key={person.name} className="flex items-center gap-2 text-sm">
					<span className="text-lg">{person.days === 0 ? "🎉" : "🎂"}</span>
					<span className="min-w-0 flex-1 truncate">
						{person.name}
						{person.age !== null && (
							<span className="text-muted"> turns {person.age}</span>
						)}
					</span>
					<span className="text-xs text-muted tabular-nums">
						{person.days === 0
							? "Today!"
							: person.days === 1
								? "Tomorrow"
								: `${person.next.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${person.days}d`}
					</span>
				</li>
			))}
		</ul>
	);
}

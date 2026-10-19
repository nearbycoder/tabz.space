import { useState } from "react";
import { dayKey, type WidgetProps } from "../kit";

type Data = { entries: Record<string, string> };

const pretty = (day: string) =>
	new Date(`${day}T12:00`).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});

/** A line a day; keeps the last year. */
export default function Journal({ data, save, readOnly }: WidgetProps<Data>) {
	const today = dayKey();
	const [text, setText] = useState(data.entries[today] ?? "");
	const past = Object.entries(data.entries)
		.filter(([day, entry]) => day < today && entry)
		.sort(([a], [b]) => b.localeCompare(a));
	const write = (value: string) => {
		setText(value);
		const entries = Object.fromEntries(
			[...past, [today, value] as [string, string]]
				.filter(([, entry]) => entry.trim())
				.slice(-365),
		);
		save({ entries });
	};
	return (
		<div className="space-y-2">
			<textarea
				value={text}
				onChange={(event) => write(event.target.value)}
				readOnly={readOnly}
				rows={3}
				maxLength={1000}
				placeholder="How was today?"
				aria-label="Today's entry"
				className="field resize-none"
			/>
			{past.slice(0, 4).map(([day, entry]) => (
				<div key={day} className="text-sm">
					<p className="text-xs text-muted">{pretty(day)}</p>
					<p className="line-clamp-2 break-words">{entry}</p>
				</div>
			))}
		</div>
	);
}

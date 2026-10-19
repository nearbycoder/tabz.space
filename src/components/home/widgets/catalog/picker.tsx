import { useRef, useState } from "react";
import { cn } from "#/lib/cn";
import { Hint, randomInt, type WidgetProps } from "../kit";

type Data = { options: string[] };

export default function Picker({ data }: WidgetProps<Data>) {
	const options = data.options.filter((option) => option.trim());
	const [shown, setShown] = useState<string | null>(null);
	const [spinning, setSpinning] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	if (options.length < 2)
		return <Hint>Add at least two choices in the widget's settings</Hint>;
	const spin = () => {
		clearTimeout(timer.current);
		setSpinning(true);
		const winner = randomInt(options.length);
		let step = 0;
		const steps = 14 + randomInt(6);
		const tick = () => {
			step++;
			setShown(
				options[step >= steps ? winner : (winner + step) % options.length],
			);
			if (step < steps)
				timer.current = setTimeout(tick, 40 + step * step * 1.5);
			else setSpinning(false);
		};
		tick();
	};
	return (
		<div className="flex flex-col items-center gap-3 py-1">
			<p
				className={cn(
					"min-h-9 text-center text-2xl font-semibold transition",
					spinning ? "text-muted" : "text-accent",
				)}
			>
				{shown ?? "?"}
			</p>
			<button
				type="button"
				className="btn-primary"
				onClick={spin}
				disabled={spinning}
			>
				{shown ? "Pick again" : "Pick for me"}
			</button>
			<p className="text-center text-xs text-muted">{options.join(" · ")}</p>
		</div>
	);
}

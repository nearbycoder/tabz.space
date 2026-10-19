import { useState } from "react";
import { randomInt, type WidgetProps } from "../kit";

type Data = { heads: number; tails: number };

export default function Coin({ data, save, readOnly }: WidgetProps<Data>) {
	const [side, setSide] = useState<"heads" | "tails" | null>(null);
	const [flipping, setFlipping] = useState(false);
	const flip = () => {
		setFlipping(true);
		setTimeout(() => {
			const result = randomInt(2) ? "heads" : "tails";
			setSide(result);
			setFlipping(false);
			if (!readOnly) save({ ...data, [result]: (data[result] ?? 0) + 1 });
		}, 600);
	};
	return (
		<div className="flex flex-col items-center gap-2 py-1">
			<button
				type="button"
				onClick={flip}
				aria-label="Flip the coin"
				className={`grid size-20 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-3xl font-bold text-amber-900 shadow-lg transition ${flipping ? "animate-spin" : "hover:scale-105"}`}
			>
				{flipping ? "" : side === "heads" ? "H" : side === "tails" ? "T" : "?"}
			</button>
			<p className="h-5 font-medium">
				{flipping
					? "…"
					: side === "heads"
						? "Heads"
						: side === "tails"
							? "Tails"
							: "Tap to flip"}
			</p>
			<p className="text-xs text-muted tabular-nums">
				Heads {data.heads} · Tails {data.tails}
				{!readOnly && data.heads + data.tails > 0 && (
					<button
						type="button"
						className="ml-2 underline"
						onClick={() => save({ heads: 0, tails: 0 }, { now: true })}
					>
						reset
					</button>
				)}
			</p>
		</div>
	);
}

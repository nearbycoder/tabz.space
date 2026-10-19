import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { useMemo, useState } from "react";
import { Hint, randomInt, type WidgetProps } from "../kit";

type Data = { cards: string };

export default function Flashcards({ data }: WidgetProps<Data>) {
	const cards = useMemo(
		() =>
			data.cards
				.split("\n")
				.map((line) => line.split("|").map((part) => part.trim()))
				.filter(([front]) => front),
		[data.cards],
	);
	const [order, setOrder] = useState<number[] | null>(null);
	const [index, setIndex] = useState(0);
	const [flipped, setFlipped] = useState(false);
	if (!cards.length) return <Hint>Add cards in the widget's settings</Hint>;
	const sequence = order ?? cards.map((_, i) => i);
	const position = index % sequence.length;
	const [front, back = ""] = cards[sequence[position]] ?? cards[0];
	const go = (delta: number) => {
		setFlipped(false);
		setIndex((position + delta + sequence.length) % sequence.length);
	};
	const shuffle = () => {
		const next = cards.map((_, i) => i);
		for (let i = next.length - 1; i > 0; i--) {
			const j = randomInt(i + 1);
			[next[i], next[j]] = [next[j], next[i]];
		}
		setOrder(next);
		setIndex(0);
		setFlipped(false);
	};
	return (
		<div className="space-y-2">
			<button
				type="button"
				onClick={() => setFlipped((value) => !value)}
				className="focus-ring grid min-h-28 w-full place-items-center rounded-xl border border-line bg-[color-mix(in_srgb,var(--ink)_3%,transparent)] p-4 text-center transition hover:border-accent"
				aria-label={flipped ? "Show front" : "Show back"}
			>
				<span
					className={flipped ? "text-lg text-accent" : "text-lg font-medium"}
				>
					{flipped ? back || "—" : front}
				</span>
			</button>
			<div className="flex items-center justify-between">
				<button
					type="button"
					className="icon-btn"
					aria-label="Previous"
					onClick={() => go(-1)}
				>
					<ChevronLeft className="size-4" />
				</button>
				<span className="text-xs text-muted tabular-nums">
					{position + 1} / {sequence.length} · tap to flip
				</span>
				<div className="flex">
					<button
						type="button"
						className="icon-btn"
						aria-label="Shuffle"
						onClick={shuffle}
					>
						<Shuffle className="size-4" />
					</button>
					<button
						type="button"
						className="icon-btn"
						aria-label="Next"
						onClick={() => go(1)}
					>
						<ChevronRight className="size-4" />
					</button>
				</div>
			</div>
		</div>
	);
}

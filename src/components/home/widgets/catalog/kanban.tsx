import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { randomId, type WidgetProps } from "../kit";

type Card = { id: string; text: string };
type Column = "todo" | "doing" | "done";
type Data = Record<Column, Card[]>;

const COLUMNS: [Column, string][] = [
	["todo", "To do"],
	["doing", "Doing"],
	["done", "Done"],
];

export default function Kanban({ data, save, readOnly }: WidgetProps<Data>) {
	const [draft, setDraft] = useState("");
	const board: Data = {
		todo: data.todo ?? [],
		doing: data.doing ?? [],
		done: data.done ?? [],
	};
	const move = (card: Card, from: number, to: number) => {
		const next = { ...board };
		next[COLUMNS[from][0]] = next[COLUMNS[from][0]].filter(
			(item) => item.id !== card.id,
		);
		if (to >= 0 && to < COLUMNS.length)
			next[COLUMNS[to][0]] = [...next[COLUMNS[to][0]], card];
		save(next, { now: true });
	};
	const add = (event: FormEvent) => {
		event.preventDefault();
		if (!draft.trim()) return;
		save(
			{
				...board,
				todo: [...board.todo, { id: randomId(), text: draft.trim() }],
			},
			{ now: true },
		);
		setDraft("");
	};
	return (
		<div className="space-y-2">
			{!readOnly && (
				<form onSubmit={add}>
					<input
						className="field"
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						placeholder="Add a card…"
						maxLength={140}
					/>
				</form>
			)}
			<div className="grid grid-cols-3 gap-1.5">
				{COLUMNS.map(([column, label], index) => (
					<div
						key={column}
						className="min-h-20 rounded-xl bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] p-1.5"
					>
						<p className="mb-1 px-0.5 text-[11px] font-medium text-muted">
							{label} {board[column].length > 0 && `· ${board[column].length}`}
						</p>
						<div className="space-y-1">
							{board[column].map((card) => (
								<div
									key={card.id}
									className="group/card rounded-lg bg-surface-2 p-1.5 text-xs shadow-sm"
								>
									<p className="break-words">{card.text}</p>
									{!readOnly && (
										<div className="mt-1 flex justify-between opacity-0 transition group-hover/card:opacity-100 pointer-coarse:opacity-100">
											<button
												type="button"
												aria-label="Move left"
												disabled={index === 0}
												onClick={() => move(card, index, index - 1)}
												className="icon-btn size-5 disabled:invisible"
											>
												<ChevronLeft className="size-3" />
											</button>
											<button
												type="button"
												aria-label="Delete card"
												onClick={() => move(card, index, -1)}
												className="icon-btn size-5"
											>
												<X className="size-3" />
											</button>
											<button
												type="button"
												aria-label="Move right"
												disabled={index === COLUMNS.length - 1}
												onClick={() => move(card, index, index + 1)}
												className="icon-btn size-5 disabled:invisible"
											>
												<ChevronRight className="size-3" />
											</button>
										</div>
									)}
								</div>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

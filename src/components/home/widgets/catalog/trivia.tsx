import { useMemo, useState } from "react";
import { cn } from "#/lib/cn";
import { freshKey, randomInt, Status, useJson, type WidgetProps } from "../kit";

type Question = {
	category: string;
	difficulty: string;
	question: string;
	correct_answer: string;
	incorrect_answers: string[];
};

const decode = (text: string) => {
	try {
		return decodeURIComponent(text);
	} catch {
		return text;
	}
};

export default function Trivia(_: WidgetProps<object>) {
	const [nonce, setNonce] = useState(freshKey);
	const [chosen, setChosen] = useState<string | null>(null);
	const [score, setScore] = useState({ right: 0, total: 0 });
	const query = useJson<{ results?: Question[] }>(
		`https://opentdb.com/api.php?amount=1&type=multiple&encode=url3986&n=${nonce}`,
		{ ttl: 30, refresh: 0 },
	);
	const question = query.data?.results?.[0];
	const answers = useMemo(() => {
		if (!question) return [];
		const list = [...question.incorrect_answers];
		list.splice(randomInt(list.length + 1), 0, question.correct_answer);
		return list;
	}, [question]);
	const answer = (choice: string) => {
		if (chosen || !question) return;
		setChosen(choice);
		setScore((value) => ({
			right: value.right + Number(choice === question.correct_answer),
			total: value.total + 1,
		}));
	};
	return (
		<Status query={query}>
			{question ? (
				<div className="space-y-2">
					<p className="text-xs text-muted">
						{decode(question.category)} · {question.difficulty}
						{score.total > 0 && ` · ${score.right}/${score.total}`}
					</p>
					<p className="font-medium">{decode(question.question)}</p>
					<div className="grid gap-1">
						{answers.map((choice) => (
							<button
								key={choice}
								type="button"
								onClick={() => answer(choice)}
								className={cn(
									"focus-ring rounded-lg border px-2.5 py-1.5 text-left text-sm transition",
									!chosen && "border-line hover:border-accent",
									chosen &&
										choice === question.correct_answer &&
										"border-emerald-500 bg-emerald-500/15",
									chosen &&
										choice === chosen &&
										choice !== question.correct_answer &&
										"border-rose-500 bg-rose-500/15",
									chosen &&
										choice !== chosen &&
										choice !== question.correct_answer &&
										"border-line opacity-60",
								)}
							>
								{decode(choice)}
							</button>
						))}
					</div>
					{chosen && (
						<button
							type="button"
							className="btn-outline w-full"
							onClick={() => {
								setChosen(null);
								setNonce(freshKey());
							}}
						>
							Next question
						</button>
					)}
				</div>
			) : (
				<p className="py-3 text-center text-sm text-muted">
					The trivia service is busy. Try again in a few seconds.
				</p>
			)}
		</Status>
	);
}

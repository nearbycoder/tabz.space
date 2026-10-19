import { Minus } from "lucide-react";
import { cn } from "#/lib/cn";
import { dayKey, type WidgetProps } from "../kit";

type Data = { goal: number; glasses: number; day: string };

export default function Water({ data, save, readOnly }: WidgetProps<Data>) {
	const today = dayKey();
	const glasses = data.day === today ? data.glasses : 0;
	const goal = Math.min(30, Math.max(1, data.goal || 8));
	const set = (value: number) =>
		save({ ...data, glasses: Math.max(0, value), day: today }, { now: true });
	return (
		<div className="space-y-2">
			<div className="flex flex-wrap justify-center gap-1">
				{Array.from({ length: Math.max(goal, glasses) }, (_, index) => (
					<button
						// biome-ignore lint/suspicious/noArrayIndexKey: glass positions
						key={index}
						type="button"
						disabled={readOnly}
						aria-label={`${index + 1} glasses`}
						onClick={() => set(index + 1 === glasses ? index : index + 1)}
						className={cn(
							"text-2xl transition hover:scale-110",
							index < glasses ? "" : "opacity-25 grayscale",
						)}
					>
						💧
					</button>
				))}
			</div>
			<div className="flex items-center justify-center gap-2 text-sm">
				<span className="tabular-nums">
					{glasses} / {goal} glasses
				</span>
				{glasses >= goal && <span>🎉</span>}
				{!readOnly && glasses > 0 && (
					<button
						type="button"
						className="icon-btn size-6"
						aria-label="One less"
						onClick={() => set(glasses - 1)}
					>
						<Minus className="size-3.5" />
					</button>
				)}
			</div>
		</div>
	);
}

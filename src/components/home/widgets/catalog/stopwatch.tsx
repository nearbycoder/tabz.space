import { Flag, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDuration, RoundButton, type WidgetProps } from "../kit";

type Data = { startedAt: number | null; elapsed: number; laps: number[] };

/** Keeps running across reloads: the start time is saved, not a ticking count. */
export default function Stopwatch({ data, save, readOnly }: WidgetProps<Data>) {
	const running = data.startedAt !== null;
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!running) return;
		const id = setInterval(() => setNow(Date.now()), 100);
		return () => clearInterval(id);
	}, [running]);
	const total = data.elapsed + (running ? now - (data.startedAt as number) : 0);
	const toggle = () =>
		save(
			running
				? { ...data, startedAt: null, elapsed: total }
				: { ...data, startedAt: Date.now() },
			{ now: true },
		);
	return (
		<div className="flex flex-col items-center gap-3 py-1">
			<p className="font-mono text-4xl tabular-nums">
				{formatDuration(total, { tenths: true })}
			</p>
			{!readOnly && (
				<div className="flex gap-3">
					<RoundButton
						label="Reset"
						onClick={() =>
							save({ startedAt: null, elapsed: 0, laps: [] }, { now: true })
						}
					>
						<RotateCcw className="size-4" />
					</RoundButton>
					<RoundButton
						primary
						label={running ? "Pause" : "Start"}
						onClick={toggle}
					>
						{running ? (
							<Pause className="size-4" />
						) : (
							<Play className="size-4" />
						)}
					</RoundButton>
					<RoundButton
						label="Lap"
						disabled={!running}
						onClick={() =>
							save(
								{ ...data, laps: [total, ...data.laps].slice(0, 50) },
								{ now: true },
							)
						}
					>
						<Flag className="size-4" />
					</RoundButton>
				</div>
			)}
			{data.laps.length > 0 && (
				<ol className="w-full space-y-0.5 text-sm">
					{data.laps.slice(0, 5).map((lap, index) => (
						<li key={lap} className="flex justify-between px-1 text-muted">
							<span>Lap {data.laps.length - index}</span>
							<span className="font-mono tabular-nums">
								{formatDuration(lap - (data.laps[index + 1] ?? 0), {
									tenths: true,
								})}
							</span>
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

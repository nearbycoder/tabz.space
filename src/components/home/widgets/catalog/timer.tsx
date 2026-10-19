import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "#/lib/cn";
import {
	chime,
	formatDuration,
	notify,
	RoundButton,
	type WidgetProps,
} from "../kit";

type Data = {
	minutes: number;
	endsAt: number | null;
	/** Milliseconds left while paused. */
	paused?: number | null;
	presets: number[];
};

export default function Timer({ data, save, readOnly }: WidgetProps<Data>) {
	const [now, setNow] = useState(() => Date.now());
	const running = data.endsAt !== null;
	useEffect(() => {
		if (!running) return;
		const id = setInterval(() => setNow(Date.now()), 250);
		return () => clearInterval(id);
	}, [running]);
	const left = running
		? Math.max(0, (data.endsAt as number) - now)
		: (data.paused ?? data.minutes * 60_000);
	const rang = useRef(false);
	useEffect(() => {
		if (running && left === 0 && !rang.current) {
			rang.current = true;
			chime();
			notify("Time's up", `Your ${data.minutes}-minute timer finished`);
		}
		if (left > 0) rang.current = false;
	}, [running, left, data.minutes]);
	const start = (minutes = data.minutes) =>
		save(
			{
				...data,
				minutes,
				paused: null,
				endsAt:
					Date.now() +
					(data.paused && minutes === data.minutes
						? data.paused
						: minutes * 60_000),
			},
			{ now: true },
		);
	const done = running && left === 0;
	return (
		<div className="flex flex-col items-center gap-3 py-1">
			<p
				className={cn(
					"font-mono text-4xl tabular-nums",
					done && "animate-pulse text-accent",
				)}
			>
				{done ? "Done!" : formatDuration(left)}
			</p>
			{!readOnly && (
				<>
					<div className="flex gap-3">
						<RoundButton
							label="Reset"
							onClick={() =>
								save({ ...data, endsAt: null, paused: null }, { now: true })
							}
						>
							<RotateCcw className="size-4" />
						</RoundButton>
						<RoundButton
							primary
							label={running && !done ? "Pause" : "Start"}
							onClick={() =>
								running && !done
									? save({ ...data, endsAt: null, paused: left }, { now: true })
									: start()
							}
						>
							{running && !done ? (
								<Pause className="size-4" />
							) : (
								<Play className="size-4" />
							)}
						</RoundButton>
					</div>
					<div className="flex flex-wrap justify-center gap-1">
						{data.presets.map((minutes) => (
							<button
								key={minutes}
								type="button"
								onClick={() => start(minutes)}
								className={cn(
									"focus-ring rounded-full border px-2.5 py-1 text-xs transition",
									minutes === data.minutes
										? "border-accent text-accent"
										: "border-line hover:border-accent",
								)}
							>
								{minutes}m
							</button>
						))}
					</div>
				</>
			)}
		</div>
	);
}

import { useEffect, useState } from "react";
import { Segmented } from "#/components/ui/controls";
import type { WidgetProps } from "../kit";

type Data = { pattern: "box" | "478" | "calm" };

/** Phases: [label, seconds, circle scale]. */
const PATTERNS: Record<Data["pattern"], [string, number, number][]> = {
	box: [
		["Breathe in", 4, 1],
		["Hold", 4, 1],
		["Breathe out", 4, 0.55],
		["Hold", 4, 0.55],
	],
	"478": [
		["Breathe in", 4, 1],
		["Hold", 7, 1],
		["Breathe out", 8, 0.55],
	],
	calm: [
		["Breathe in", 5, 1],
		["Breathe out", 5, 0.55],
	],
};

export default function Breathing({ data, save, readOnly }: WidgetProps<Data>) {
	const pattern = data.pattern in PATTERNS ? data.pattern : "box";
	const phases = PATTERNS[pattern];
	const [running, setRunning] = useState(false);
	const [phase, setPhase] = useState(0);
	const [left, setLeft] = useState(phases[0][1]);
	useEffect(() => {
		if (!running) return;
		let current = 0;
		let remaining = phases[0][1];
		setPhase(0);
		setLeft(remaining);
		const id = setInterval(() => {
			remaining--;
			if (remaining <= 0) {
				current = (current + 1) % phases.length;
				remaining = phases[current][1];
				setPhase(current);
			}
			setLeft(remaining);
		}, 1000);
		return () => clearInterval(id);
	}, [running, phases]);
	const [label, seconds, scale] = phases[phase] ?? phases[0];
	return (
		<div className="flex flex-col items-center gap-3 py-1">
			<button
				type="button"
				onClick={() => setRunning((value) => !value)}
				aria-label={running ? "Stop" : "Start breathing"}
				className="relative grid size-36 place-items-center"
			>
				<span
					className="absolute inset-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] ease-in-out"
					style={{
						transform: `scale(${running ? scale : 0.7})`,
						transitionProperty: "transform",
						transitionDuration: `${running ? seconds : 0.6}s`,
					}}
				/>
				<span className="relative text-center">
					<span className="block font-medium">{running ? label : "Start"}</span>
					{running && <span className="text-2xl tabular-nums">{left}</span>}
				</span>
			</button>
			<div className="w-full">
				<Segmented
					value={pattern}
					onChange={(value) => {
						setRunning(false);
						if (!readOnly) save({ pattern: value }, { now: true });
					}}
					options={[
						{ value: "box", label: "Box" },
						{ value: "478", label: "4-7-8" },
						{ value: "calm", label: "Calm" },
					]}
				/>
			</div>
		</div>
	);
}

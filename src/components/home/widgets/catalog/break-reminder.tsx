import { useEffect, useRef, useState } from "react";
import { chime, formatDuration, notify, type WidgetProps } from "../kit";

type Data = { every: number };

const TIPS = [
	"👀 Look at something 20 feet away for 20 seconds.",
	"🧘 Roll your shoulders and stretch your neck.",
	"🚶 Stand up and walk around for a minute.",
	"💧 Have a glass of water.",
	"🤲 Stretch your wrists and fingers.",
	"😮‍💨 Take three slow, deep breaths.",
];

export default function BreakReminder({ data }: WidgetProps<Data>) {
	const every = Math.min(180, Math.max(5, data.every || 20)) * 60_000;
	const [active, setActive] = useState(false);
	const [due, setDue] = useState(0);
	const [now, setNow] = useState(() => Date.now());
	const [tip, setTip] = useState(0);
	const fired = useRef(false);
	useEffect(() => {
		if (!active) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [active]);
	const left = due - now;
	useEffect(() => {
		if (active && left <= 0 && !fired.current) {
			fired.current = true;
			chime(2);
			notify("Time for a break", TIPS[tip]);
		}
	}, [active, left, tip]);
	const start = () => {
		fired.current = false;
		setTip((value) => (value + 1) % TIPS.length);
		setDue(Date.now() + every);
		setNow(Date.now());
		setActive(true);
		notify("Break reminders are on");
	};
	if (!active)
		return (
			<div className="flex flex-col items-center gap-2 py-2 text-center">
				<p className="text-sm text-muted">
					A gentle nudge every {every / 60_000} minutes while this tab is open.
				</p>
				<button type="button" className="btn-primary" onClick={start}>
					Start reminders
				</button>
			</div>
		);
	return (
		<div className="flex flex-col items-center gap-2 py-1 text-center">
			{left > 0 ? (
				<>
					<p className="text-sm text-muted">Next break in</p>
					<p className="font-mono text-3xl tabular-nums">
						{formatDuration(left)}
					</p>
				</>
			) : (
				<p className="animate-pulse text-base font-medium">{TIPS[tip]}</p>
			)}
			<div className="flex gap-2">
				<button type="button" className="btn-outline" onClick={start}>
					{left > 0 ? "Restart" : "Done, next one"}
				</button>
				<button
					type="button"
					className="btn-ghost"
					onClick={() => setActive(false)}
				>
					Stop
				</button>
			</div>
		</div>
	);
}

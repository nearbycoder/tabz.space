import { Check, Pause, Play, RotateCcw, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { celebrate } from "#/lib/celebrate";
import { cn } from "#/lib/cn";
import type { Widget } from "#/lib/preferences";
import { useHomeContext } from "../context";
import { useWidgetSaver } from "./save";

type Of<T extends Widget["type"]> = Extract<Widget, { type: T }>;

/** Grows a textarea with its content. */
const fit = (node: HTMLTextAreaElement | null) => {
	if (!node) return;
	node.style.height = "auto";
	node.style.height = `${Math.max(96, node.scrollHeight)}px`;
};

/** A sticky note: plain text that saves as you type. */
export function NotesWidget({
	groupId,
	widget,
}: {
	groupId: string;
	widget: Of<"notes">;
}) {
	const save = useWidgetSaver(groupId);
	const [text, setText] = useState(widget.text);
	const ref = useRef<HTMLTextAreaElement>(null);
	useEffect(() => fit(ref.current), []);
	return (
		<textarea
			ref={ref}
			value={text}
			onChange={(event) => {
				setText(event.target.value);
				fit(event.target);
				save({ ...widget, text: event.target.value });
			}}
			placeholder="Write anything…"
			maxLength={20_000}
			aria-label="Notes"
			className="w-full resize-none rounded-xl bg-transparent p-1 text-sm leading-relaxed outline-none placeholder:text-muted focus:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]"
		/>
	);
}

/** A checklist; finished items sink to the bottom. */
export function TodoWidget({
	groupId,
	widget,
}: {
	groupId: string;
	widget: Of<"todo">;
}) {
	const { settings } = useHomeContext();
	const save = useWidgetSaver(groupId, 300);
	const [draft, setDraft] = useState("");
	const items = [...widget.items].sort(
		(a, b) => Number(a.done) - Number(b.done),
	);
	const done = widget.items.filter((item) => item.done).length;
	const update = (next: Of<"todo">["items"]) =>
		save({ ...widget, items: next }, { now: true });

	const add = (event: FormEvent) => {
		event.preventDefault();
		const text = draft.trim();
		if (!text) return;
		update([
			...widget.items,
			{ id: crypto.randomUUID().slice(0, 8), text, done: false },
		]);
		setDraft("");
	};

	return (
		<div className="space-y-1">
			<ul className="space-y-0.5">
				{items.map((item) => (
					<li
						key={item.id}
						className="group/todo flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]"
					>
						<button
							type="button"
							aria-pressed={item.done}
							aria-label={
								item.done
									? `Mark ${item.text} not done`
									: `Mark ${item.text} done`
							}
							onClick={(event) => {
								const next = widget.items.map((i) =>
									i.id === item.id ? { ...i, done: !i.done } : i,
								);
								update(next);
								if (
									!item.done &&
									settings.celebrate &&
									next.every((i) => i.done)
								)
									celebrate(event.currentTarget);
							}}
							className={cn(
								"focus-ring grid size-5 shrink-0 place-items-center rounded-md border transition",
								item.done
									? "border-accent bg-accent text-white"
									: "border-line hover:border-accent",
							)}
						>
							{item.done && <Check className="size-3.5" />}
						</button>
						<span
							className={cn(
								"min-w-0 flex-1 text-sm break-words",
								item.done && "text-muted line-through",
							)}
						>
							{item.text}
						</span>
						<button
							type="button"
							aria-label={`Remove ${item.text}`}
							onClick={() =>
								update(widget.items.filter((i) => i.id !== item.id))
							}
							className="icon-btn size-6 opacity-0 group-hover/todo:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-60"
						>
							<X className="size-3.5" />
						</button>
					</li>
				))}
			</ul>
			<form onSubmit={add}>
				<input
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder="Add a task…"
					maxLength={300}
					aria-label="New task"
					className="w-full rounded-lg bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted focus:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]"
				/>
			</form>
			{done > 0 && (
				<button
					type="button"
					onClick={() => update(widget.items.filter((item) => !item.done))}
					className="flex items-center gap-1 px-1 text-xs text-muted hover:text-ink"
				>
					<Trash2 className="size-3" /> Clear {done} done
				</button>
			)}
		</div>
	);
}

type TimerState = {
	mode: "work" | "rest";
	endsAt: number | null;
	remaining: number;
	rounds: number;
};

const chime = () => {
	try {
		const audio = new AudioContext();
		for (const [index, frequency] of [660, 880, 990].entries()) {
			const osc = audio.createOscillator();
			const gain = audio.createGain();
			osc.frequency.value = frequency;
			gain.gain.setValueAtTime(0.0001, audio.currentTime + index * 0.18);
			gain.gain.exponentialRampToValueAtTime(
				0.2,
				audio.currentTime + index * 0.18 + 0.02,
			);
			gain.gain.exponentialRampToValueAtTime(
				0.0001,
				audio.currentTime + index * 0.18 + 0.5,
			);
			osc.connect(gain).connect(audio.destination);
			osc.start(audio.currentTime + index * 0.18);
			osc.stop(audio.currentTime + index * 0.18 + 0.55);
		}
	} catch {
		// Audio unavailable; the notification still shows.
	}
};

/** A Pomodoro timer that survives reloads (state lives in localStorage). */
export function PomodoroWidget({
	groupId,
	widget,
}: {
	groupId: string;
	widget: Of<"pomodoro">;
}) {
	const { settings } = useHomeContext();
	const key = `tabz:pomodoro:${groupId}`;
	const length = (mode: TimerState["mode"]) =>
		(mode === "work" ? widget.work : widget.rest) * 60_000;
	const [state, setState] = useState<TimerState>({
		mode: "work",
		endsAt: null,
		remaining: length("work"),
		rounds: 0,
	});
	const [now, setNow] = useState(Date.now());
	const ring = useRef<HTMLDivElement>(null);

	useEffect(() => {
		try {
			const saved = JSON.parse(
				localStorage.getItem(key) ?? "null",
			) as TimerState | null;
			if (saved) setState(saved);
		} catch {}
	}, [key]);
	useEffect(
		() => localStorage.setItem(key, JSON.stringify(state)),
		[key, state],
	);
	useEffect(() => {
		if (!state.endsAt) return;
		const tick = setInterval(() => setNow(Date.now()), 250);
		return () => clearInterval(tick);
	}, [state.endsAt]);

	const left = state.endsAt ? Math.max(0, state.endsAt - now) : state.remaining;

	// Phase finished: switch modes, chime and notify.
	useEffect(() => {
		if (!state.endsAt || left > 0) return;
		const finished = state.mode;
		const mode = finished === "work" ? "rest" : "work";
		setState({
			mode,
			endsAt: null,
			remaining: length(mode),
			rounds: state.rounds + (finished === "work" ? 1 : 0),
		});
		chime();
		if (finished === "work" && settings.celebrate) celebrate(ring.current);
		if ("Notification" in window && Notification.permission === "granted")
			new Notification(
				finished === "work" ? "Focus session done 🍅" : "Break's over",
				{
					body:
						finished === "work"
							? `Take ${widget.rest} minutes.`
							: "Back to it!",
				},
			);
	});

	const start = () => {
		if ("Notification" in window && Notification.permission === "default")
			void Notification.requestPermission();
		setState({ ...state, endsAt: Date.now() + state.remaining });
		setNow(Date.now());
	};
	const pause = () => setState({ ...state, endsAt: null, remaining: left });
	const reset = () =>
		setState({
			mode: "work",
			endsAt: null,
			remaining: length("work"),
			rounds: state.rounds,
		});

	const total = length(state.mode);
	const progress = 1 - left / total;
	const minutes = Math.floor(left / 60_000);
	const seconds = Math.floor((left % 60_000) / 1000);

	return (
		<div className="flex items-center gap-4">
			<div
				ref={ring}
				className="relative grid size-24 shrink-0 place-items-center"
			>
				<div
					className="absolute inset-0 rounded-full transition-[background]"
					style={{
						background: `conic-gradient(var(--accent) ${progress * 360}deg, color-mix(in srgb, var(--ink) 10%, transparent) 0deg)`,
						mask: "radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 5px))",
					}}
				/>
				<span className="relative font-mono text-xl font-semibold tabular-nums">
					{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
				</span>
			</div>
			<div className="min-w-0 space-y-2">
				<p className="text-sm font-medium">
					{state.mode === "work" ? "🍅 Focus" : "☕ Break"}
				</p>
				<p className="text-xs text-muted">
					{state.rounds} session{state.rounds === 1 ? "" : "s"} · {widget.work}/
					{widget.rest} min
				</p>
				<div className="flex gap-1">
					{state.endsAt ? (
						<button
							type="button"
							className="btn-outline px-3 py-1 text-xs"
							onClick={pause}
						>
							<Pause className="size-3.5" /> Pause
						</button>
					) : (
						<button
							type="button"
							className="btn-primary px-3 py-1 text-xs"
							onClick={start}
						>
							<Play className="size-3.5" /> {left < total ? "Resume" : "Start"}
						</button>
					)}
					<button
						type="button"
						className="icon-btn size-7"
						aria-label="Reset timer"
						onClick={reset}
					>
						<RotateCcw className="size-3.5" />
					</button>
				</div>
			</div>
		</div>
	);
}

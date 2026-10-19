import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "#/lib/cn";
import { RoundButton, type WidgetProps } from "../kit";

type Data = { bpm: number; beats: number };

export default function Metronome({ data, save, readOnly }: WidgetProps<Data>) {
	const bpm = Math.min(240, Math.max(30, data.bpm || 100));
	const beats = data.beats || 4;
	const [playing, setPlaying] = useState(false);
	const [beat, setBeat] = useState(-1);
	const context = useRef<AudioContext | null>(null);

	useEffect(() => {
		if (!playing) return;
		context.current ??= new AudioContext();
		const audio = context.current;
		void audio.resume();
		let next = audio.currentTime + 0.05;
		let count = 0;
		// Schedule clicks slightly ahead on the audio clock so timing stays steady.
		const schedule = () => {
			while (next < audio.currentTime + 0.12) {
				const accent = count % beats === 0;
				const oscillator = audio.createOscillator();
				const gain = audio.createGain();
				oscillator.frequency.value = accent ? 1500 : 1000;
				gain.gain.setValueAtTime(0.3, next);
				gain.gain.exponentialRampToValueAtTime(0.0001, next + 0.05);
				oscillator.connect(gain).connect(audio.destination);
				oscillator.start(next);
				oscillator.stop(next + 0.06);
				const index = count % beats;
				setTimeout(
					() => setBeat(index),
					Math.max(0, (next - audio.currentTime) * 1000),
				);
				next += 60 / bpm;
				count++;
			}
		};
		const id = setInterval(schedule, 25);
		schedule();
		return () => {
			clearInterval(id);
			setBeat(-1);
		};
	}, [playing, bpm, beats]);

	const update = (patch: Partial<Data>) =>
		!readOnly && save({ ...data, ...patch });
	return (
		<div className="flex flex-col items-center gap-3 py-1">
			<div className="flex gap-2">
				{Array.from({ length: beats }, (_, index) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: beat positions
						key={index}
						className={cn(
							"size-3 rounded-full transition",
							index === beat
								? index === 0
									? "scale-125 bg-accent"
									: "bg-ink"
								: "bg-[color-mix(in_srgb,var(--ink)_15%,transparent)]",
						)}
					/>
				))}
			</div>
			<p className="text-3xl font-semibold tabular-nums">
				{bpm} <span className="text-sm font-normal text-muted">BPM</span>
			</p>
			<input
				type="range"
				min={30}
				max={240}
				value={bpm}
				onChange={(event) => update({ bpm: Number(event.target.value) })}
				className="w-full accent-[var(--accent)]"
				aria-label="Tempo"
			/>
			<div className="flex items-center gap-3">
				<select
					className="field w-20"
					value={beats}
					onChange={(event) => update({ beats: Number(event.target.value) })}
					aria-label="Beats per bar"
				>
					{[2, 3, 4, 5, 6, 7].map((value) => (
						<option key={value} value={value}>
							{value}/4
						</option>
					))}
				</select>
				<RoundButton
					primary
					label={playing ? "Stop" : "Start"}
					onClick={() => setPlaying((value) => !value)}
				>
					{playing ? <Pause className="size-4" /> : <Play className="size-4" />}
				</RoundButton>
			</div>
		</div>
	);
}

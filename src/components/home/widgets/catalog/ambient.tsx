import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Segmented } from "#/components/ui/controls";
import { RoundButton, type WidgetProps } from "../kit";

type Color = "white" | "pink" | "brown";
type Data = { color: Color; volume: number };

/** Two seconds of looping noise, generated in the browser (no audio files). */
function noiseBuffer(context: AudioContext, color: Color) {
	const length = context.sampleRate * 2;
	const buffer = context.createBuffer(1, length, context.sampleRate);
	const output = buffer.getChannelData(0);
	let last = 0;
	const b = [0, 0, 0, 0, 0, 0, 0];
	for (let i = 0; i < length; i++) {
		const white = Math.random() * 2 - 1;
		if (color === "white") output[i] = white * 0.5;
		else if (color === "brown") {
			last = (last + 0.02 * white) / 1.02;
			output[i] = last * 3.5;
		} else {
			// Paul Kellet's pink noise filter.
			b[0] = 0.99886 * b[0] + white * 0.0555179;
			b[1] = 0.99332 * b[1] + white * 0.0750759;
			b[2] = 0.969 * b[2] + white * 0.153852;
			b[3] = 0.8665 * b[3] + white * 0.3104856;
			b[4] = 0.55 * b[4] + white * 0.5329522;
			b[5] = -0.7616 * b[5] - white * 0.016898;
			output[i] =
				(b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + white * 0.5362) *
				0.11;
			b[6] = white * 0.115926;
		}
	}
	return buffer;
}

export default function Ambient({ data, save, readOnly }: WidgetProps<Data>) {
	const [playing, setPlaying] = useState(false);
	const context = useRef<AudioContext | null>(null);
	const gain = useRef<GainNode | null>(null);
	const volume = Math.min(1, Math.max(0, data.volume ?? 0.4));
	// Read at start; later changes go straight to the running gain (no restart).
	const startVolume = useRef(volume);
	startVolume.current = volume;

	useEffect(() => {
		if (!playing) return;
		context.current ??= new AudioContext();
		const audio = context.current;
		void audio.resume();
		const source = audio.createBufferSource();
		source.buffer = noiseBuffer(audio, data.color);
		source.loop = true;
		const node = audio.createGain();
		node.gain.value = startVolume.current;
		gain.current = node;
		source.connect(node).connect(audio.destination);
		source.start();
		return () => {
			source.stop();
			source.disconnect();
		};
	}, [playing, data.color]);

	useEffect(() => {
		if (gain.current) gain.current.gain.value = volume;
	}, [volume]);

	const update = (patch: Partial<Data>) =>
		!readOnly && save({ ...data, ...patch });
	return (
		<div className="flex flex-col items-center gap-3 py-1">
			<RoundButton
				primary
				label={playing ? "Stop" : "Play"}
				onClick={() => setPlaying((value) => !value)}
			>
				{playing ? <Pause className="size-4" /> : <Play className="size-4" />}
			</RoundButton>
			<Segmented
				value={data.color}
				onChange={(color) => update({ color })}
				options={[
					{ value: "white", label: "White" },
					{ value: "pink", label: "Pink" },
					{ value: "brown", label: "Brown" },
				]}
			/>
			<input
				type="range"
				min={0}
				max={1}
				step={0.05}
				value={volume}
				onChange={(event) => update({ volume: Number(event.target.value) })}
				className="w-full accent-[var(--accent)]"
				aria-label="Volume"
			/>
		</div>
	);
}

import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { copyText, randomInt, type WidgetProps } from "../kit";

type Data = { colors: string[] };

const hex = (h: number, s: number, l: number) => {
	const light = l / 100;
	const a = (s / 100) * Math.min(light, 1 - light);
	const channel = (n: number) => {
		const k = (n + h / 30) % 12;
		return Math.round(
			255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))),
		)
			.toString(16)
			.padStart(2, "0");
	};
	return `#${channel(0)}${channel(8)}${channel(4)}`;
};

/** Five colors around a random hue, using a random harmony rule. */
const generate = () => {
	const hue = randomInt(360);
	const schemes = [
		[0, 20, 40, 60, 80],
		[0, 0, 180, 180, 30],
		[0, 120, 240, 0, 120],
		[0, 0, 0, 0, 0],
		[0, 150, 210, 30, 180],
	];
	const offsets = schemes[randomInt(schemes.length)];
	return offsets.map((offset, index) =>
		hex(
			(hue + offset) % 360,
			55 + randomInt(35),
			25 + index * 12 + randomInt(8),
		),
	);
};

export default function Palette({ data, save, readOnly }: WidgetProps<Data>) {
	const colors = data.colors.length === 5 ? data.colors : null;
	useEffect(() => {
		if (!colors && !readOnly) save({ colors: generate() }, { now: true });
	}, [colors, readOnly, save]);
	return (
		<div className="space-y-2">
			<div className="flex h-24 overflow-hidden rounded-xl">
				{(colors ?? []).map((color) => (
					<button
						key={color}
						type="button"
						title={`Copy ${color}`}
						onClick={() => copyText(color, `Copied ${color}`)}
						className="group/swatch flex flex-1 items-end justify-center pb-1.5 transition-[flex] hover:flex-[1.6]"
						style={{ background: color }}
					>
						<span className="rounded bg-black/40 px-1 font-mono text-[10px] text-white opacity-0 group-hover/swatch:opacity-100">
							{color}
						</span>
					</button>
				))}
			</div>
			{!readOnly && (
				<button
					type="button"
					className="btn-ghost w-full text-xs"
					onClick={() => save({ colors: generate() }, { now: true })}
				>
					<RefreshCw className="size-3.5" /> New palette
				</button>
			)}
		</div>
	);
}

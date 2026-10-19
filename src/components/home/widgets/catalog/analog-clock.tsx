import { useNow, type WidgetProps } from "../kit";
import { cityOf, timeIn } from "../time";

type Data = { zone: string; label: string; seconds: boolean };

function Hand({
	angle,
	length,
	width,
	accent,
}: {
	angle: number;
	length: number;
	width: number;
	accent?: boolean;
}) {
	return (
		<line
			x1="50"
			y1="50"
			x2="50"
			y2={50 - length}
			strokeWidth={width}
			strokeLinecap="round"
			className={accent ? "stroke-accent" : "stroke-[var(--ink)]"}
			transform={`rotate(${angle} 50 50)`}
		/>
	);
}

export default function AnalogClock({ data }: WidgetProps<Data>) {
	const now = useNow(1000);
	const time = now ? timeIn(now, data.zone) : null;
	const label = data.label || (data.zone ? cityOf(data.zone) : "");
	return (
		<div className="flex flex-col items-center gap-1 py-1">
			<svg
				viewBox="0 0 100 100"
				className="size-36"
				role="img"
				aria-label={label || "Clock"}
			>
				<circle
					cx="50"
					cy="50"
					r="47"
					className="fill-[color-mix(in_srgb,var(--ink)_4%,transparent)] stroke-[var(--line)]"
					strokeWidth="1.5"
				/>
				{Array.from({ length: 12 }, (_, index) => (
					<line
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed tick marks
						key={index}
						x1="50"
						y1="7"
						x2="50"
						y2={index % 3 === 0 ? "13" : "10"}
						strokeWidth={index % 3 === 0 ? 2 : 1}
						className="stroke-[var(--muted)]"
						transform={`rotate(${index * 30} 50 50)`}
					/>
				))}
				{time && (
					<>
						<Hand
							angle={(time.hour % 12) * 30 + time.minute / 2}
							length={24}
							width={3.5}
						/>
						<Hand
							angle={time.minute * 6 + time.second / 10}
							length={34}
							width={2.5}
						/>
						{data.seconds && (
							<Hand angle={time.second * 6} length={38} width={1} accent />
						)}
					</>
				)}
				<circle cx="50" cy="50" r="2.5" className="fill-accent" />
			</svg>
			{label && <p className="text-sm text-muted">{label}</p>}
		</div>
	);
}

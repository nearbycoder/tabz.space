import { useEffect, useRef } from "react";
import { Hint, type WidgetProps } from "../kit";

type Data = { birthdate: string; years: number };

/** Every week of a life as a dot, drawn on a canvas (thousands of cells). */
export default function LifeCalendar({ data }: WidgetProps<Data>) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const birth = new Date(`${data.birthdate}T00:00`);
	const valid = Boolean(data.birthdate) && !Number.isNaN(birth.getTime());
	const years = Math.min(120, Math.max(10, data.years || 90));
	const lived = valid
		? Math.max(0, Math.floor((Date.now() - birth.getTime()) / (7 * 86_400_000)))
		: 0;
	const total = years * 52;

	useEffect(() => {
		const node = canvas.current;
		if (!node || !valid) return;
		const draw = () => {
			const width = node.clientWidth;
			const cell = width / 52;
			const height = cell * years;
			const ratio = window.devicePixelRatio || 1;
			node.width = width * ratio;
			node.height = height * ratio;
			node.style.height = `${height}px`;
			const context = node.getContext("2d");
			if (!context) return;
			const styles = getComputedStyle(node);
			const accent = styles.getPropertyValue("--accent").trim() || "#6366f1";
			const ink = styles.getPropertyValue("--ink").trim() || "#0f172a";
			context.scale(ratio, ratio);
			for (let week = 0; week < total; week++) {
				context.globalAlpha = week < lived ? 0.9 : 0.12;
				context.fillStyle = week < lived ? accent : ink;
				context.fillRect(
					(week % 52) * cell + 0.5,
					Math.floor(week / 52) * cell + 0.5,
					cell - 1,
					cell - 1,
				);
			}
		};
		draw();
		const observer = new ResizeObserver(draw);
		observer.observe(node);
		return () => observer.disconnect();
	}, [valid, years, lived, total]);

	if (!valid) return <Hint>Add your birthday in the widget's settings</Hint>;
	return (
		<div className="space-y-2">
			<canvas
				ref={canvas}
				className="w-full"
				aria-label={`${lived} of ${total} weeks`}
			/>
			<p className="text-center text-xs text-muted">
				Week {lived.toLocaleString()} of {total.toLocaleString()} ·{" "}
				{Math.min(100, Math.round((lived / total) * 100))}%
			</p>
		</div>
	);
}

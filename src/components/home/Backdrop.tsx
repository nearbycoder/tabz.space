import { cn } from "#/lib/cn";
import {
	BACKGROUNDS,
	type GradientKey,
	type UserSettings,
} from "#/lib/preferences";

/** Full-page background layer: gradient, pattern, solid color or photo, plus dim. */
export function Backdrop({
	background,
}: {
	background: UserSettings["background"];
}) {
	const { type, value, dim, blur, animate } = background;
	return (
		<div
			aria-hidden
			className="pointer-events-none fixed inset-0 overflow-hidden"
		>
			{type === "preset" && (
				<div
					className={cn("absolute inset-0", animate && "bg-drift")}
					style={{
						backgroundImage:
							value in BACKGROUNDS
								? BACKGROUNDS[value as GradientKey]
								: BACKGROUNDS.aurora,
					}}
				/>
			)}
			{type === "pattern" && (
				<>
					<div
						className="absolute inset-0"
						style={{
							background:
								"radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 65%)",
						}}
					/>
					<div className={cn("absolute inset-0", `pattern-${value}`)} />
				</>
			)}
			{type === "color" && (
				<div className="absolute inset-0" style={{ background: value }} />
			)}
			{type === "image" && (
				<div
					className="absolute -inset-8 bg-cover bg-center"
					style={{
						backgroundImage: `url("${value.replace(/["\\]/g, "")}")`,
						filter: blur ? `blur(${blur}px)` : undefined,
					}}
				/>
			)}
			{dim > 0 && (
				<div
					className="absolute inset-0 bg-[var(--canvas)]"
					style={{ opacity: dim / 100 }}
				/>
			)}
		</div>
	);
}

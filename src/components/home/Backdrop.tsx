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
				<img
					alt=""
					src={value}
					srcSet={wallpaperSrcSet(value)}
					sizes="100vw"
					decoding="async"
					fetchPriority="high"
					className="absolute -inset-8 size-[calc(100%+4rem)] max-w-none object-cover"
					style={{ filter: blur ? `blur(${blur}px)` : undefined }}
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

const WIDTHS = [640, 1080, 1600, 2400];

/** Unsplash photos can be resized on the fly, so phones get a phone-sized file. */
function wallpaperSrcSet(url: string) {
	if (!url.startsWith("https://images.unsplash.com/")) return undefined;
	try {
		return WIDTHS.map((width) => {
			const sized = new URL(url);
			sized.searchParams.set("w", String(width));
			return `${sized} ${width}w`;
		}).join(", ");
	} catch {
		return undefined;
	}
}

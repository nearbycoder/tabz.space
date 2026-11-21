import { memo } from "react";
import { cn } from "#/lib/cn";
import {
	BACKGROUNDS,
	type GradientKey,
	type UserSettings,
} from "#/lib/preferences";

/** Full-page background layer: gradient, pattern, solid color or photo, plus dim. */
export const Backdrop = memo(function Backdrop({
	background,
	preview = false,
}: {
	background: UserSettings["background"];
	preview?: boolean;
}) {
	const { type, value, dim, blur, animate } = background;
	const safeImage =
		type === "image" && /^https:\/\//i.test(value) ? value : null;
	const imageSrc =
		safeImage && preview ? unsplashSized(safeImage, 400) : safeImage;
	return (
		<div
			aria-hidden
			className={cn(
				"pointer-events-none inset-0 overflow-hidden",
				preview ? "absolute" : "fixed",
			)}
		>
			{type === "preset" && (
				<div
					className={cn(
						"absolute",
						animate && !preview ? "bg-drift" : "inset-0",
					)}
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
			{imageSrc && (
				<img
					alt=""
					src={imageSrc}
					srcSet={preview ? undefined : wallpaperSrcSet(imageSrc)}
					sizes={preview ? "200px" : "100vw"}
					loading={preview ? "lazy" : undefined}
					decoding="async"
					fetchPriority={preview ? "low" : "high"}
					referrerPolicy="no-referrer"
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
});

const WIDTHS = [640, 1080, 1600, 2400];

function unsplashSized(url: string, width: number) {
	if (!url.startsWith("https://images.unsplash.com/")) return url;
	try {
		const sized = new URL(url);
		sized.searchParams.set("w", String(width));
		sized.searchParams.set("q", "65");
		return sized.toString();
	} catch {
		return url;
	}
}

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

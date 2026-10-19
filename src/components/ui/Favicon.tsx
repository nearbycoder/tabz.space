import { useState } from "react";
import { cn } from "#/lib/cn";
import { faviconFor, hostnameOf } from "#/lib/url";

type Props = {
	url: string;
	icon?: string | null;
	favicon?: string;
	title: string;
	color?: string | null;
	className?: string;
};

const isEmoji = (value: string) =>
	!/^https?:\/\//.test(value) && value.length <= 8;

/** Custom emoji/image icon → page favicon → Google favicon → letter avatar. */
export function Favicon({
	url,
	icon,
	favicon,
	title,
	color,
	className,
}: Props) {
	const sources = [
		icon && !isEmoji(icon) ? icon : null,
		favicon,
		faviconFor(url, 128),
	].filter((source): source is string => Boolean(source));
	const [index, setIndex] = useState(0);

	if (icon && isEmoji(icon)) {
		return (
			<span className={cn("grid place-items-center leading-none", className)}>
				{icon}
			</span>
		);
	}

	const source = sources[index];
	if (!source) {
		const letter = (title || hostnameOf(url)).charAt(0).toUpperCase();
		return (
			<span
				className={cn(
					"grid place-items-center rounded-lg font-semibold text-white",
					className,
				)}
				style={{ background: color ?? "var(--accent)" }}
			>
				{letter}
			</span>
		);
	}

	return (
		<img
			src={source}
			alt=""
			loading="lazy"
			referrerPolicy="no-referrer"
			draggable={false}
			onError={() => setIndex((current) => current + 1)}
			className={cn("object-contain", className)}
		/>
	);
}

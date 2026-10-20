import { useState } from "react";
import { cn } from "#/lib/cn";
import { faviconFor, hostnameOf, iconScope } from "#/lib/url";

type Props = {
	url: string;
	icon?: string | null;
	favicon?: string;
	title: string;
	color?: string | null;
	className?: string;
	/**
	 * An end-to-end encrypted vault link: never ask the tabz server about it
	 * (it must not learn which sites are in the vault).
	 */
	sealed?: boolean;
};

const iconUrls = new Map<string, string | null>();

/** iconUrl, remembered: a board of hundreds of tiles asks for the same few. */
function iconUrl(url: string, hint?: string) {
	const key = `${url}\u0000${hint ?? ""}`;
	let found = iconUrls.get(key);
	if (found === undefined) {
		if (iconUrls.size > 5000) iconUrls.clear();
		found = buildIconUrl(url, hint);
		iconUrls.set(key, found);
	}
	return found;
}

/** tabz's own icon lookup (src/routes/api/icon.ts), by site (see iconScope). */
function buildIconUrl(url: string, hint?: string) {
	try {
		const scope = iconScope(url);
		if (!scope) return null;
		// Bump v when the lookup improves, so browsers drop week-old answers.
		const params = new URLSearchParams({ url: scope, v: "3" });
		if (
			hint &&
			/^https?:\/\//.test(hint) &&
			!/google\.com\/s2\/|gstatic\.com/.test(hint)
		)
			params.set("hint", hint);
		return `/api/icon?${params}`;
	} catch {
		return null;
	}
}

const isEmoji = (value: string) =>
	!/^https?:\/\//.test(value) && value.length <= 8;

/** Custom emoji/image icon → the site's icon (found by tabz) → letter avatar. */
export function Favicon({
	url,
	icon,
	favicon,
	title,
	color,
	className,
	sealed,
}: Props) {
	const custom = icon && !isEmoji(icon) ? icon : null;
	const sources = (
		sealed
			? [custom, favicon, faviconFor(url, 128)]
			: [custom, iconUrl(url, favicon)]
	).filter((source): source is string => Boolean(source));
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

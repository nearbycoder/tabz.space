import { ExternalLink, Rss, TriangleAlert } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Favicon } from "#/components/ui/Favicon";
import { screenshotFor } from "#/lib/appearance";
import { cn } from "#/lib/cn";
import { useHomeAction } from "#/lib/home-query";
import { hostnameOf } from "#/lib/url";
import { refreshPreview } from "#/server/home";
import type { LinkItem } from "./types";

const WIDTH = 300;

/** Hover card with the page's preview image (or a live screenshot), title and description. */
export function LinkPreview({
	bookmark,
	enabled,
	children,
}: {
	bookmark: LinkItem;
	enabled: boolean;
	children: ReactNode;
}) {
	const anchor = useRef<HTMLDivElement>(null);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const [position, setPosition] = useState<{
		left: number;
		top: number;
		above: boolean;
	} | null>(null);
	const [imageFailed, setImageFailed] = useState(false);
	const refresh = useHomeAction(refreshPreview);

	const show = () => {
		const rect = anchor.current?.getBoundingClientRect();
		if (!rect) return;
		const above = rect.top > 300;
		setPosition({
			left: Math.min(
				Math.max(8, rect.left + rect.width / 2 - WIDTH / 2),
				window.innerWidth - WIDTH - 8,
			),
			top: above ? rect.top - 10 : rect.bottom + 10,
			above,
		});
		// Lazily backfill preview data the first time someone looks.
		if (!bookmark.meta.fetchedAt && !refresh.isPending)
			refresh.mutate({ id: bookmark.id });
	};

	const onEnter = () => {
		// Touch screens fire mouseenter on tap; previews are for real hover only.
		if (!enabled || !matchMedia("(hover: hover) and (pointer: fine)").matches)
			return;
		clearTimeout(timer.current);
		timer.current = setTimeout(show, 550);
	};
	const onLeave = () => {
		clearTimeout(timer.current);
		setPosition(null);
	};

	const image =
		!imageFailed && bookmark.meta.image
			? bookmark.meta.image
			: screenshotFor(bookmark.url);

	const health = bookmark.meta.health;
	const feed = bookmark.meta.feed?.items ?? [];
	const since = new Date(
		bookmark.lastVisitedAt ?? bookmark.createdAt,
	).getTime();

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: hover only shows a decorative preview; the link inside stays the interactive element
		<div
			ref={anchor}
			onMouseEnter={onEnter}
			onMouseLeave={onLeave}
			onPointerDown={onLeave}
		>
			{children}
			{position &&
				createPortal(
					<div
						className="animate-pop pointer-events-none fixed z-[60] overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-2xl backdrop-blur-xl"
						style={{
							left: position.left,
							top: position.top,
							width: WIDTH,
							transform: position.above ? "translateY(-100%)" : undefined,
						}}
					>
						<div className="relative aspect-[16/9] bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]">
							<img
								src={image}
								alt=""
								className="size-full object-cover"
								referrerPolicy="no-referrer"
								onError={() => setImageFailed(true)}
							/>
						</div>
						<div className="space-y-1 p-3">
							<div className="flex items-center gap-2">
								<Favicon
									url={bookmark.url}
									icon={bookmark.icon}
									favicon={bookmark.meta.favicon}
									title={bookmark.title}
									className="size-4 rounded text-sm"
								/>
								<span className="truncate text-sm font-medium">
									{bookmark.title}
								</span>
							</div>
							{bookmark.description && (
								<p className="line-clamp-2 text-xs text-muted">
									{bookmark.description}
								</p>
							)}
							{health && health.status !== "ok" && (
								<p className="flex items-center gap-1 text-[11px] text-amber-500">
									<TriangleAlert className="size-3 shrink-0" />
									<span className="truncate">
										{health.status === "broken"
											? `Looks broken${health.code ? ` (${health.code})` : ""}`
											: `Moved to ${health.location?.replace(/^https?:\/\//, "")}`}
									</span>
								</p>
							)}
							{feed.length > 0 && (
								<ul className="space-y-0.5 border-t border-line pt-1.5">
									{feed.slice(0, 3).map((item) => (
										<li
											key={`${item.at}${item.title}`}
											className="flex items-center gap-1.5 text-[11px]"
										>
											{item.at > since ? (
												<span className="size-1.5 shrink-0 rounded-full bg-accent" />
											) : (
												<Rss className="size-2.5 shrink-0 text-muted" />
											)}
											<span
												className={cn(
													"truncate",
													item.at > since ? "text-ink" : "text-muted",
												)}
											>
												{item.title}
											</span>
										</li>
									))}
								</ul>
							)}
							<p className="flex items-center gap-1 text-[11px] text-muted">
								<ExternalLink className="size-3" />{" "}
								{bookmark.meta.siteName || hostnameOf(bookmark.url)}
								{bookmark.visitCount > 0 && (
									<span className="ml-auto">{bookmark.visitCount} visits</span>
								)}
							</p>
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
}

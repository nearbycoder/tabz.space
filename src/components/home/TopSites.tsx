import { memo, useMemo } from "react";
import { Favicon } from "#/components/ui/Favicon";
import { useTileContext } from "./context";
import { type LinkItem, leavesPage, targetUrl } from "./types";

/** Your most-visited links, learned automatically from clicks. */
export const TopSites = memo(function TopSites({
	links,
}: {
	links: LinkItem[];
}) {
	const { settings, onVisit, isIncognito } = useTileContext();
	// One pass for the top eight (no sorting the whole library on each render).
	const top = useMemo(() => {
		const best: LinkItem[] = [];
		for (const link of links) {
			if (link.visitCount <= 0 || isIncognito(link)) continue;
			if (best.length === 8 && link.visitCount <= best[7].visitCount) continue;
			best.push(link);
			best.sort((a, b) => b.visitCount - a.visitCount);
			if (best.length > 8) best.pop();
		}
		return best;
	}, [links, isIncognito]);
	if (!settings.showTopSites || top.length < 3) return null;

	return (
		<nav
			aria-label="Most visited"
			className="animate-pop flex flex-wrap justify-center gap-2"
		>
			{top.map((link) => (
				<a
					key={link.id}
					href={targetUrl(link)}
					target={settings.openInNewTab ? "_blank" : undefined}
					rel="noopener noreferrer"
					onClick={(event) =>
						onVisit(link, {
							leaving: leavesPage(event, settings.openInNewTab),
						})
					}
					title={link.title}
					className="glass focus-ring group flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-xs transition hover:-translate-y-0.5 hover:shadow-md"
				>
					<span className="grid size-6 place-items-center rounded-full bg-surface-2">
						<Favicon
							url={link.url}
							icon={link.icon}
							favicon={link.meta.favicon}
							sealed={Boolean(link.meta.sealed)}
							title={link.title}
							className="size-4 rounded-sm text-sm"
						/>
					</span>
					<span className="max-w-[9rem] truncate text-muted group-hover:text-ink">
						{link.title}
					</span>
				</a>
			))}
		</nav>
	);
});

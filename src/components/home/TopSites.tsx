import { Favicon } from "#/components/ui/Favicon";
import { useHomeContext } from "./context";
import type { LinkItem } from "./types";

/** Your most-visited links, learned automatically from clicks. */
export function TopSites({ links }: { links: LinkItem[] }) {
	const { settings, onVisit } = useHomeContext();
	const top = links
		.filter((link) => link.visitCount > 0)
		.sort((a, b) => b.visitCount - a.visitCount)
		.slice(0, 8);
	if (!settings.showTopSites || top.length < 3) return null;

	return (
		<nav
			aria-label="Most visited"
			className="animate-pop flex flex-wrap justify-center gap-2"
		>
			{top.map((link) => (
				<a
					key={link.id}
					href={link.url}
					target={settings.openInNewTab ? "_blank" : undefined}
					rel="noopener noreferrer"
					onClick={() => onVisit(link)}
					title={link.title}
					className="glass focus-ring group flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-xs transition hover:-translate-y-0.5 hover:shadow-md"
				>
					<span className="grid size-6 place-items-center rounded-full bg-surface-2">
						<Favicon
							url={link.url}
							icon={link.icon}
							favicon={link.meta.favicon}
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
}

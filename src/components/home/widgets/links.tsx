import type { ReactNode } from "react";
import { Favicon } from "#/components/ui/Favicon";
import { useHomeContext } from "../context";
import { type LinkItem, linksIn } from "../types";

/**
 * Your saved links for the "Your links" widgets. Vault boards and incognito
 * links are left out, so they never surface on a regular board.
 */
export function useLibraryLinks() {
	const { boards } = useHomeContext();
	return boards
		.filter((board) => !board.vault)
		.flatMap((board) =>
			board.groups.flatMap((group) =>
				linksIn(group.bookmarks)
					.filter((link) => !link.incognito && !link.meta.sealed)
					.map((link) => ({ link, board: board.name })),
			),
		);
}

export function LinkRow({
	link,
	aside,
}: {
	link: LinkItem;
	aside?: ReactNode;
}) {
	const { openLink } = useHomeContext();
	return (
		<a
			href={link.url}
			onClick={(event) => {
				event.preventDefault();
				openLink(link, { newTab: event.metaKey || event.ctrlKey });
			}}
			className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]"
		>
			<Favicon
				url={link.url}
				icon={link.icon}
				favicon={link.meta.favicon}
				title={link.title}
				color={link.color}
				className="size-5 shrink-0 rounded"
			/>
			<span className="min-w-0 flex-1 truncate">{link.title}</span>
			{aside !== undefined && (
				<span className="shrink-0 text-xs text-muted tabular-nums">
					{aside}
				</span>
			)}
		</a>
	);
}

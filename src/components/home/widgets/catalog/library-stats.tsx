import { hostnameOf } from "#/lib/url";
import { useHomeContext } from "../../context";
import { flattenTree } from "../../types";
import type { WidgetProps } from "../kit";
import { useLibraryLinks } from "../links";

export default function LibraryStats(_: WidgetProps<object>) {
	const { boards } = useHomeContext();
	const links = useLibraryLinks();
	const folders = boards
		.filter((board) => !board.vault)
		.flatMap((board) =>
			board.groups.flatMap((group) => flattenTree(group.bookmarks)),
		)
		.filter((item) => item.kind === "folder").length;
	const visits = links.reduce((sum, { link }) => sum + link.visitCount, 0);
	const sites = new Map<string, number>();
	for (const { link } of links) {
		const host = hostnameOf(link.url);
		sites.set(host, (sites.get(host) ?? 0) + 1);
	}
	const top = [...sites].sort((a, b) => b[1] - a[1]).slice(0, 4);
	const stats: [string, number][] = [
		["Links", links.length],
		["Folders", folders],
		["Boards", boards.filter((board) => !board.vault).length],
		["Visits", visits],
	];
	return (
		<div className="space-y-3">
			<div className="grid grid-cols-4 gap-1.5 text-center">
				{stats.map(([label, value]) => (
					<div
						key={label}
						className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] py-2"
					>
						<p className="font-semibold tabular-nums">
							{value.toLocaleString()}
						</p>
						<p className="text-[11px] text-muted">{label}</p>
					</div>
				))}
			</div>
			{top.length > 0 && (
				<div className="space-y-1">
					<p className="text-xs text-muted">Most saved sites</p>
					{top.map(([host, count]) => (
						<div key={host} className="flex items-center gap-2 text-sm">
							<span className="min-w-0 flex-1 truncate">{host}</span>
							<span className="text-xs text-muted tabular-nums">{count}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowRight,
	CheckCircle2,
	Loader2,
	RefreshCw,
	Trash2,
	TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Favicon } from "#/components/ui/Favicon";
import { Modal } from "#/components/ui/Modal";
import { call, run } from "#/lib/api";
import { homeKey } from "#/lib/home-query";
import {
	checkLinks,
	deleteBookmark,
	listLinkHealth,
	updateBookmark,
} from "#/server/home";

const healthKey = ["link-health"];

/** Links that stopped working or moved, with one-click fixes. */
export function LinkHealthDialog({ onClose }: { onClose: () => void }) {
	const queryClient = useQueryClient();
	const health = useQuery({
		queryKey: healthKey,
		queryFn: () => run(call(listLinkHealth)),
	});
	const [checking, setChecking] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: homeKey }),
			queryClient.invalidateQueries({ queryKey: healthKey }),
		]);

	const act = async (id: string, action: () => Promise<unknown>) => {
		setBusy(id);
		try {
			await action();
			await refresh();
		} catch (cause) {
			toast.error(cause instanceof Error ? cause.message : "Couldn't do that");
		} finally {
			setBusy(null);
		}
	};

	const checkAll = async () => {
		setChecking(true);
		try {
			const result = await run(call(checkLinks, {}));
			toast(
				result.broken + result.redirected
					? `Checked ${result.checked} links: ${result.broken} broken, ${result.redirected} moved`
					: `Checked ${result.checked} links. All good!`,
				{ icon: "🩺" },
			);
			await refresh();
		} catch (cause) {
			toast.error(cause instanceof Error ? cause.message : "Check failed");
		} finally {
			setChecking(false);
		}
	};

	const problems = health.data?.problems ?? [];

	return (
		<Modal open onClose={onClose} title="Link health">
			<div className="space-y-4">
				<div className="flex items-center justify-between gap-3">
					<p className="text-sm text-muted">
						{health.data
							? `${health.data.checked} of ${health.data.total} links checked. tabz re-checks every week.`
							: "Checking which links still work…"}
					</p>
					<button
						type="button"
						className="btn-outline shrink-0 text-xs"
						onClick={checkAll}
						disabled={checking}
					>
						{checking ? (
							<Loader2 className="size-3.5 animate-spin" />
						) : (
							<RefreshCw className="size-3.5" />
						)}{" "}
						Check now
					</button>
				</div>
				{health.isPending ? (
					<div className="flex justify-center py-8 text-muted">
						<Loader2 className="size-5 animate-spin" />
					</div>
				) : problems.length === 0 ? (
					<div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted">
						<CheckCircle2 className="size-8 text-accent" /> No broken links
						found.
					</div>
				) : (
					<ul className="space-y-2">
						{problems.map((link) => (
							<li
								key={link.id}
								className="flex items-center gap-3 rounded-2xl border border-line p-3"
							>
								<Favicon
									url={link.url}
									title={link.title}
									className="size-5 shrink-0 rounded"
								/>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">{link.title}</p>
									<p className="truncate text-xs text-muted">{link.path}</p>
									<p className="mt-0.5 flex items-center gap-1 truncate text-xs text-amber-500">
										{link.health.status === "broken" ? (
											<>
												<TriangleAlert className="size-3 shrink-0" />
												{link.health.code
													? `Page not found (${link.health.code})`
													: "Site unreachable"}
											</>
										) : (
											<>
												<ArrowRight className="size-3 shrink-0" />
												<span className="truncate">
													Moved to{" "}
													{link.health.location?.replace(/^https?:\/\//, "")}
												</span>
											</>
										)}
									</p>
								</div>
								{busy === link.id ? (
									<Loader2 className="size-4 animate-spin text-muted" />
								) : (
									<div className="flex shrink-0 items-center gap-1">
										{link.health.status === "broken" && link.archive && (
											<a
												href={link.archive}
												target="_blank"
												rel="noopener noreferrer"
												className="btn-outline px-2.5 py-1 text-xs"
												title="The Wayback Machine's saved copy of this page"
											>
												Archived copy
											</a>
										)}
										{link.health.status === "redirected" &&
											link.health.location && (
												<button
													type="button"
													className="btn-outline px-2.5 py-1 text-xs"
													onClick={() =>
														act(link.id, () =>
															run(
																call(updateBookmark, {
																	id: link.id,
																	url: link.health.location,
																}),
															),
														)
													}
												>
													Update link
												</button>
											)}
										<button
											type="button"
											className="icon-btn size-8"
											title="Check again"
											aria-label={`Check ${link.title} again`}
											onClick={() =>
												act(link.id, () =>
													run(call(checkLinks, { ids: [link.id] })),
												)
											}
										>
											<RefreshCw className="size-3.5" />
										</button>
										<button
											type="button"
											className="icon-btn size-8"
											title="Move to trash"
											aria-label={`Delete ${link.title}`}
											onClick={() =>
												act(link.id, () =>
													run(call(deleteBookmark, { id: link.id })),
												)
											}
										>
											<Trash2 className="size-3.5" />
										</button>
									</div>
								)}
							</li>
						))}
					</ul>
				)}
			</div>
		</Modal>
	);
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Favicon } from "#/components/ui/Favicon";
import { Modal } from "#/components/ui/Modal";
import { call, run } from "#/lib/api";
import { homeKey } from "#/lib/home-query";
import { deleteBookmark, listDuplicates } from "#/server/home";

/** Bookmarks saved more than once, with one-click cleanup. */
export function DuplicatesDialog({ onClose }: { onClose: () => void }) {
	const queryClient = useQueryClient();
	const duplicates = useQuery({
		queryKey: ["duplicates"],
		queryFn: () => run(call(listDuplicates)),
	});

	const remove = async (ids: string[]) => {
		for (const id of ids) await run(call(deleteBookmark, { id }));
		toast(
			`Removed ${ids.length} duplicate${ids.length === 1 ? "" : "s"} (they're in the trash)`,
		);
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: homeKey }),
			queryClient.invalidateQueries({ queryKey: ["duplicates"] }),
		]);
	};

	return (
		<Modal open onClose={onClose} title="Duplicates">
			{duplicates.isPending ? (
				<div className="flex justify-center py-10 text-muted">
					<Loader2 className="size-5 animate-spin" />
				</div>
			) : !duplicates.data?.length ? (
				<div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted">
					<CheckCircle2 className="size-8 text-accent" /> No duplicates. Every
					link is saved once.
				</div>
			) : (
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<p className="text-sm text-muted">
							{duplicates.data.length} pages saved more than once.
						</p>
						<button
							type="button"
							className="btn-outline text-xs"
							onClick={() =>
								remove(
									duplicates.data.flatMap((set) =>
										set.items.slice(1).map((item) => item.id),
									),
								)
							}
						>
							Keep first of each
						</button>
					</div>
					{duplicates.data.map((set) => (
						<div key={set.key} className="rounded-2xl border border-line p-3">
							<p className="mb-2 flex items-center gap-2 text-sm font-medium">
								<Favicon
									url={set.items[0].url}
									title={set.host}
									className="size-4 rounded"
								/>{" "}
								{set.host}
							</p>
							<ul className="space-y-1">
								{set.items.map((item, index) => (
									<li key={item.id} className="flex items-center gap-2 text-sm">
										<div className="min-w-0 flex-1">
											<p className="truncate">{item.title}</p>
											<p className="truncate text-xs text-muted">{item.path}</p>
										</div>
										{index === 0 ? (
											<span className="text-xs text-muted">kept</span>
										) : (
											<button
												type="button"
												className="icon-btn size-8 hover:text-red-500"
												aria-label="Remove duplicate"
												onClick={() => remove([item.id])}
											>
												<Trash2 className="size-4" />
											</button>
										)}
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			)}
		</Modal>
	);
}

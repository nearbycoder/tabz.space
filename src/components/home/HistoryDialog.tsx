import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Segmented } from "#/components/ui/controls";
import { Favicon } from "#/components/ui/Favicon";
import { Modal } from "#/components/ui/Modal";
import { call, run } from "#/lib/api";
import { cn } from "#/lib/cn";
import { homeKey, useUndo } from "#/lib/home-query";
import {
	deleteForever,
	emptyTrash,
	listActivity,
	listTrash,
	restoreFromTrash,
} from "#/server/home";

const ago = (date: Date | string) => {
	const seconds = Math.round((Date.now() - new Date(date).getTime()) / 1000);
	if (seconds < 60) return "just now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
	return `${Math.floor(seconds / 86_400)}d ago`;
};

/** Recent changes (each undoable) and the 30-day trash. */
export function HistoryDialog({
	initialTab = "history",
	onClose,
}: {
	initialTab?: "history" | "trash";
	onClose: () => void;
}) {
	const [tab, setTab] = useState(initialTab);
	const queryClient = useQueryClient();
	const undo = useUndo();
	const history = useQuery({
		queryKey: ["activity"],
		queryFn: () => run(call(listActivity, { limit: 60 })),
		enabled: tab === "history",
	});
	const trash = useQuery({
		queryKey: ["trash"],
		queryFn: () => run(call(listTrash)),
		enabled: tab === "trash",
	});

	const refresh = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: homeKey }),
			queryClient.invalidateQueries({ queryKey: ["activity"] }),
			queryClient.invalidateQueries({ queryKey: ["trash"] }),
		]);
	};

	return (
		<Modal open onClose={onClose} title="History & trash">
			<div className="space-y-4">
				<Segmented
					value={tab}
					onChange={setTab}
					options={[
						{
							value: "history",
							label: (
								<>
									<History className="size-3.5" /> History
								</>
							),
						},
						{
							value: "trash",
							label: (
								<>
									<Trash2 className="size-3.5" /> Trash
								</>
							),
						},
					]}
				/>

				{tab === "history" &&
					(history.isPending ? (
						<Spinner />
					) : history.data?.length ? (
						<ul className="-mx-2 divide-y divide-line">
							{history.data.map((entry) => (
								<li
									key={entry.id}
									className={cn(
										"flex items-center gap-3 px-2 py-2.5 text-sm",
										entry.undoneAt && "opacity-50",
									)}
								>
									<div className="min-w-0 flex-1">
										<p
											className={cn(
												"truncate",
												entry.undoneAt && "line-through",
											)}
										>
											{entry.label}
										</p>
										<p className="text-xs text-muted">{ago(entry.createdAt)}</p>
									</div>
									{!entry.undoneAt && (
										<button
											type="button"
											className="btn-ghost shrink-0 px-2.5 py-1.5 text-xs"
											onClick={async () => {
												await undo(entry.id);
												await refresh();
											}}
										>
											<Undo2 className="size-3.5" /> Undo
										</button>
									)}
								</li>
							))}
						</ul>
					) : (
						<Empty text="No changes yet. Everything you add, move or delete shows up here, and ⌘Z undoes the latest." />
					))}

				{tab === "trash" &&
					(trash.isPending ? (
						<Spinner />
					) : trash.data?.length ? (
						<>
							<ul className="-mx-2 divide-y divide-line">
								{trash.data.map((item) => (
									<li
										key={`${item.type}-${item.id}`}
										className="flex items-center gap-3 px-2 py-2.5 text-sm"
									>
										<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]">
											{item.url ? (
												<Favicon
													url={item.url}
													favicon={item.icon ?? undefined}
													title={item.title}
													className="size-4 rounded"
												/>
											) : (
												<span className="text-base">
													{item.icon ?? (item.type === "group" ? "▦" : "📁")}
												</span>
											)}
										</span>
										<div className="min-w-0 flex-1">
											<p className="truncate">{item.title}</p>
											<p className="truncate text-xs text-muted">
												{item.detail} · deleted {ago(item.deletedAt)}
											</p>
										</div>
										<button
											type="button"
											className="icon-btn size-8"
											aria-label={`Restore ${item.title}`}
											title="Restore"
											onClick={async () => {
												await run(
													call(restoreFromTrash, {
														type: item.type,
														id: item.id,
													}),
												);
												toast.success(`Restored “${item.title}”`);
												await refresh();
											}}
										>
											<RotateCcw className="size-4" />
										</button>
										<button
											type="button"
											className="icon-btn size-8 hover:text-red-500"
											aria-label={`Delete ${item.title} forever`}
											title="Delete forever"
											onClick={async () => {
												await run(
													call(deleteForever, { type: item.type, id: item.id }),
												);
												await refresh();
											}}
										>
											<Trash2 className="size-4" />
										</button>
									</li>
								))}
							</ul>
							<div className="flex items-center justify-between gap-2 pt-1">
								<p className="text-xs text-muted">
									Items are removed for good after 30 days.
								</p>
								<button
									type="button"
									className="btn-ghost text-xs text-red-500"
									onClick={async () => {
										await run(call(emptyTrash));
										toast("Trash emptied");
										await refresh();
									}}
								>
									Empty trash
								</button>
							</div>
						</>
					) : (
						<Empty text="Trash is empty. Deleted links, folders, groups and boards stay here for 30 days." />
					))}
			</div>
		</Modal>
	);
}

function Spinner() {
	return (
		<div className="flex justify-center py-10 text-muted">
			<Loader2 className="size-5 animate-spin" />
		</div>
	);
}

function Empty({ text }: { text: string }) {
	return <p className="py-8 text-center text-sm text-muted">{text}</p>;
}

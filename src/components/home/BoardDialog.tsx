import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Field, Toggle } from "#/components/ui/controls";
import { Modal } from "#/components/ui/Modal";
import { cn } from "#/lib/cn";
import { homeKey, useHomeAction, useSaveSettings } from "#/lib/home-query";
import type { BoardSchedule } from "#/lib/preferences";
import { DAY_LETTERS, describeSchedule } from "#/lib/schedule";
import { contentsOf } from "#/lib/vault-actions";
import { sealContents } from "#/lib/vault-session";
import {
	createBoard,
	deleteBoard,
	type HomeData,
	updateBoard,
} from "#/server/home";
import { ShareBoard } from "./ShareBoard";
import { flattenTree, type HomeBoard } from "./types";

const ICONS = [
	"🏠",
	"💼",
	"🧑‍💻",
	"📚",
	"🎮",
	"🎵",
	"🛒",
	"✈️",
	"🧪",
	"📰",
	"💡",
	"⭐",
];

export function BoardDialog({
	board,
	canDelete,
	userId,
	vaultUnlocked,
	onClose,
}: {
	board?: HomeBoard;
	canDelete: boolean;
	userId: string;
	/** When the vault is open, boards can be moved into or out of it. */
	vaultUnlocked: boolean;
	onClose: () => void;
}) {
	const [name, setName] = useState(board?.name ?? "");
	const [inVault, setInVault] = useState(board?.vault ?? false);
	const [icon, setIcon] = useState(board?.icon ?? ICONS[1]);
	const [schedule, setSchedule] = useState<BoardSchedule | null>(
		board?.layout.schedule ?? null,
	);
	const saveSettings = useSaveSettings();
	const queryClient = useQueryClient();
	const create = useHomeAction(createBoard, {
		onSuccess: (result) => {
			saveSettings.mutate({ activeBoardId: result.board.id });
			onClose();
		},
	});
	const update = useHomeAction(updateBoard, { onSuccess: onClose });
	const remove = useHomeAction(deleteBoard, {
		onSuccess: onClose,
		undoable: () => `Deleted board “${board?.name}”`,
	});
	const pending = create.isPending || update.isPending;

	return (
		<Modal open onClose={onClose} title={board ? "Edit board" : "New board"}>
			<form
				className="space-y-4"
				onSubmit={(event) => {
					event.preventDefault();
					const vault = vaultUnlocked ? inVault : undefined;
					if (board)
						void (async () => {
							// Crossing an encrypted vault's boundary re-encodes every link.
							const crossing =
								vault !== undefined &&
								vault !== board.vault &&
								queryClient.getQueryData<HomeData>(homeKey)?.vault.encrypted;
							let items: Parameters<typeof updateBoard>[0]["data"]["items"];
							if (crossing) {
								const rows = board.groups.flatMap((group) =>
									flattenTree(group.bookmarks),
								);
								try {
									items = await Promise.all(
										rows.map(async (row) => {
											const contents = contentsOf(row);
											return vault
												? { id: row.id, sealed: await sealContents(contents) }
												: {
														id: row.id,
														plain: {
															title: contents.title,
															url: contents.url ?? "",
															description: contents.description ?? null,
															icon: contents.icon ?? null,
															tags: contents.tags ?? [],
														},
													};
										}),
									);
								} catch (error) {
									toast.error(
										error instanceof Error ? error.message : "Couldn't encrypt",
									);
									return;
								}
							}
							update.mutate({
								id: board.id,
								name,
								icon,
								vault,
								items,
								layout: { schedule: inVault ? null : schedule },
							});
						})();
					else create.mutate({ name, icon, vault });
				}}
			>
				<Field label="Name">
					<input
						className="field"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Work, Personal, Research…"
						required
						maxLength={60}
						autoFocus
					/>
				</Field>
				<Field label="Icon">
					<div className="flex flex-wrap gap-1.5">
						{ICONS.map((option) => (
							<button
								key={option}
								type="button"
								onClick={() => setIcon(option)}
								className={cn(
									"focus-ring grid size-9 place-items-center rounded-xl text-lg transition hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)]",
									icon === option &&
										"bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]",
								)}
							>
								{option}
							</button>
						))}
						<input
							className="field w-16 text-center"
							value={icon}
							onChange={(event) => setIcon(event.target.value)}
							maxLength={8}
							aria-label="Custom emoji"
						/>
					</div>
				</Field>
				{vaultUnlocked && (!board || board.role === "owner") && (
					<Toggle
						label="🔒 Keep in vault"
						checked={inVault}
						onChange={setInVault}
					/>
				)}
				{board && !inVault && board.role === "owner" && (
					<div className="space-y-3 rounded-2xl border border-line p-3">
						<Toggle
							label="🕘 Show this board automatically"
							checked={schedule !== null}
							onChange={(on) =>
								setSchedule(
									on
										? { days: [1, 2, 3, 4, 5], from: "09:00", to: "17:00" }
										: null,
								)
							}
						/>
						{schedule && (
							<>
								<div className="flex gap-1">
									{DAY_LETTERS.map((letter, day) => {
										const on = schedule.days.includes(day);
										return (
											<button
												// biome-ignore lint/suspicious/noArrayIndexKey: weekday index is the identity
												key={day}
												type="button"
												aria-pressed={on}
												aria-label={
													[
														"Sunday",
														"Monday",
														"Tuesday",
														"Wednesday",
														"Thursday",
														"Friday",
														"Saturday",
													][day]
												}
												onClick={() => {
													const days = on
														? schedule.days.filter((d) => d !== day)
														: [...schedule.days, day];
													if (days.length) setSchedule({ ...schedule, days });
												}}
												className={cn(
													"focus-ring grid size-9 place-items-center rounded-full text-sm font-medium transition",
													on
														? "bg-accent text-white"
														: "bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] text-muted hover:text-ink",
												)}
											>
												{letter}
											</button>
										);
									})}
								</div>
								<div className="flex items-center gap-2 text-sm">
									<input
										type="time"
										className="field w-auto"
										value={schedule.from}
										onChange={(event) =>
											event.target.value &&
											setSchedule({ ...schedule, from: event.target.value })
										}
										aria-label="From"
									/>
									<span className="text-muted">to</span>
									<input
										type="time"
										className="field w-auto"
										value={schedule.to}
										onChange={(event) =>
											event.target.value &&
											setSchedule({ ...schedule, to: event.target.value })
										}
										aria-label="To"
									/>
								</div>
								<p className="text-xs text-muted">
									{describeSchedule(schedule)}. During this time tabz opens on
									this board; you can still switch boards.
								</p>
							</>
						)}
					</div>
				)}
				<div className="flex items-center gap-2 pt-2">
					{board && canDelete && (
						<button
							type="button"
							className="btn-ghost text-red-500"
							onClick={() => remove.mutate({ id: board.id })}
						>
							<Trash2 className="size-4" /> Delete board
						</button>
					)}
					<button type="button" className="btn-ghost ml-auto" onClick={onClose}>
						Cancel
					</button>
					<button
						type="submit"
						className="btn-primary"
						disabled={pending || !name.trim()}
					>
						{pending && <Loader2 className="size-4 animate-spin" />}
						{board ? "Save" : "Create board"}
					</button>
				</div>
			</form>
			{board && !board.vault && (
				<div className="mt-4">
					<ShareBoard board={board} userId={userId} onLeft={onClose} />
				</div>
			)}
		</Modal>
	);
}

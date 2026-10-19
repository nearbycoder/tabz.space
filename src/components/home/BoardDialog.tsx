import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Field } from "#/components/ui/controls";
import { Modal } from "#/components/ui/Modal";
import { cn } from "#/lib/cn";
import { useHomeAction, useSaveSettings } from "#/lib/home-query";
import { createBoard, deleteBoard, updateBoard } from "#/server/home";
import type { HomeBoard } from "./types";

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
	onClose,
}: {
	board?: HomeBoard;
	canDelete: boolean;
	onClose: () => void;
}) {
	const [name, setName] = useState(board?.name ?? "");
	const [icon, setIcon] = useState(board?.icon ?? ICONS[1]);
	const saveSettings = useSaveSettings();
	const create = useHomeAction(createBoard, {
		onSuccess: (result) => {
			saveSettings.mutate({ activeBoardId: result.board.id });
			onClose();
		},
	});
	const update = useHomeAction(updateBoard, { onSuccess: onClose });
	const remove = useHomeAction(deleteBoard, { onSuccess: onClose });
	const pending = create.isPending || update.isPending;

	return (
		<Modal open onClose={onClose} title={board ? "Edit board" : "New board"}>
			<form
				className="space-y-4"
				onSubmit={(event) => {
					event.preventDefault();
					if (board) update.mutate({ id: board.id, name, icon });
					else create.mutate({ name, icon });
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
		</Modal>
	);
}

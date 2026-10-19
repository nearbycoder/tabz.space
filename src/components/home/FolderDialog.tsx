import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	rectSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import {
	ExternalLink,
	Loader2,
	Plus,
	Trash2,
	VenetianMask,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Field, Toggle } from "#/components/ui/controls";
import { Modal } from "#/components/ui/Modal";
import { cn } from "#/lib/cn";
import { useHomeAction } from "#/lib/home-query";
import { openIncognito } from "#/lib/incognito";
import type { HomeData } from "#/server/home";
import {
	arrangeFolder,
	createFolder,
	deleteBookmark,
	updateBookmark,
} from "#/server/home";
import { BookmarkTile } from "./BookmarkTile";
import { useHomeContext } from "./context";
import { gridFor } from "./GroupCard";

const FOLDER_ICONS = [
	"📁",
	"💬",
	"🎬",
	"🛠️",
	"📚",
	"🎵",
	"🍳",
	"✈️",
	"💰",
	"🎮",
	"🧠",
	"⭐",
];

const findFolder = (
	data: HomeData | { boards: HomeData["boards"] },
	folderId: string,
) =>
	data.boards
		.flatMap((b) => b.groups)
		.flatMap((g) => g.bookmarks)
		.find((item) => item.id === folderId);

/** An opened folder: its links in a grid you can reorder, plus rename/icon/delete. */
export function FolderDialog({
	folderId,
	onClose,
}: {
	folderId: string;
	onClose: () => void;
}) {
	const { boards, openDialog, isIncognito } = useHomeContext();
	const folder = findFolder({ boards }, folderId);
	const [title, setTitle] = useState(folder?.title ?? "");
	const [order, setOrder] = useState(folder?.children ?? []);
	const [confirming, setConfirming] = useState(false);
	useEffect(() => setOrder(folder?.children ?? []), [folder?.children]);
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const rename = useHomeAction(updateBookmark);
	const arrange = useHomeAction(arrangeFolder);
	const remove = useHomeAction(deleteBookmark, { onSuccess: onClose });
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	if (!folder) return null;

	const saveTitle = () => {
		if (title.trim() && title.trim() !== folder.title)
			rename.mutate({ id: folder.id, title: title.trim() });
	};

	const onDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return;
		const next = arrayMove(
			order,
			order.findIndex((c) => c.id === active.id),
			order.findIndex((c) => c.id === over.id),
		);
		setOrder(next);
		arrange.mutate({ folderId: folder.id, ids: next.map((c) => c.id) });
	};

	return createPortal(
		<div className="fixed inset-0 z-50 grid place-items-center p-4">
			<button
				type="button"
				aria-label="Close"
				className="absolute inset-0 bg-black/35 backdrop-blur-md"
				onClick={onClose}
			/>
			<div
				role="dialog"
				aria-label={folder.title}
				className="glass animate-folder relative w-full max-w-xl rounded-[2rem] p-6 shadow-2xl"
			>
				<div className="mb-5 flex items-center gap-3">
					<div className="relative">
						<select
							aria-label="Folder icon"
							value={folder.icon ?? "📁"}
							onChange={(event) =>
								rename.mutate({ id: folder.id, icon: event.target.value })
							}
							className="focus-ring size-11 cursor-pointer appearance-none rounded-2xl bg-surface-2 text-center text-2xl"
						>
							{FOLDER_ICONS.map((icon) => (
								<option key={icon} value={icon}>
									{icon}
								</option>
							))}
						</select>
					</div>
					<input
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						onBlur={saveTitle}
						onKeyDown={(event) =>
							event.key === "Enter" && (event.target as HTMLInputElement).blur()
						}
						aria-label="Folder name"
						maxLength={60}
						className="focus-ring min-w-0 flex-1 rounded-xl bg-transparent px-2 py-1 text-xl font-semibold"
					/>
					<span className="text-sm text-muted">{order.length}</span>
				</div>

				<DndContext
					id={`folder-${folder.id}`}
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={onDragEnd}
				>
					<SortableContext
						items={order.map((c) => c.id)}
						strategy={rectSortingStrategy}
					>
						<div
							className="grid max-h-[50vh] gap-3 overflow-y-auto p-1"
							style={gridFor("tile", "md")}
						>
							{order.map((child) => (
								<BookmarkTile
									key={child.id}
									item={child}
									style="tile"
									size="md"
								/>
							))}
							<button
								type="button"
								onClick={() =>
									openDialog({
										type: "bookmark",
										groupId: folder.groupId,
										parentId: folder.id,
									})
								}
								className="focus-ring grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-line text-muted transition hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:text-ink"
								aria-label="Add link to folder"
							>
								<Plus className="size-5" />
							</button>
						</div>
					</SortableContext>
				</DndContext>
				{order.length === 0 && (
					<p className="mt-2 text-center text-sm text-muted">
						Empty folder. Drag links onto it or add one here.
					</p>
				)}

				<div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
					<div className="min-w-0 flex-1">
						<Toggle
							label="🕶️ Open everything here in incognito"
							checked={folder.incognito}
							onChange={(incognito) =>
								rename.mutate({ id: folder.id, incognito })
							}
						/>
					</div>
					{order.length > 0 && (
						<button
							type="button"
							className="btn-outline"
							title={
								folder.incognito || order.some(isIncognito)
									? "Open all in a private window"
									: "Open all in new tabs"
							}
							onClick={() => {
								const urls = order.map((c) => c.url);
								if (folder.incognito || order.every(isIncognito))
									openIncognito(urls);
								else
									for (const url of urls)
										window.open(url, "_blank", "noopener");
							}}
						>
							{folder.incognito ? (
								<VenetianMask className="size-4" />
							) : (
								<ExternalLink className="size-4" />
							)}{" "}
							Open all
						</button>
					)}
				</div>

				<div className="mt-4 flex flex-wrap items-center gap-2">
					{confirming ? (
						<>
							<button
								type="button"
								className="btn-outline"
								onClick={() => remove.mutate({ id: folder.id })}
							>
								Keep links, remove folder
							</button>
							<button
								type="button"
								className="btn bg-red-500 text-white"
								onClick={() =>
									remove.mutate({ id: folder.id, withContents: true })
								}
							>
								Delete everything
							</button>
						</>
					) : (
						<button
							type="button"
							className="btn-ghost text-red-500"
							onClick={() => setConfirming(true)}
						>
							<Trash2 className="size-4" /> Delete folder
						</button>
					)}
					<button
						type="button"
						className={cn("btn-primary ml-auto")}
						onClick={onClose}
					>
						{(rename.isPending || arrange.isPending) && (
							<Loader2 className="size-4 animate-spin" />
						)}
						Done
					</button>
				</div>
			</div>
		</div>,
		document.body,
	);
}

export function NewFolderDialog({
	groupId,
	onClose,
}: {
	groupId: string;
	onClose: () => void;
}) {
	const [title, setTitle] = useState("");
	const [icon, setIcon] = useState(FOLDER_ICONS[0]);
	const [incognito, setIncognito] = useState(false);
	const { openDialog } = useHomeContext();
	const create = useHomeAction(createFolder, {
		onSuccess: (folder) => openDialog({ type: "folder", folderId: folder.id }),
	});
	return (
		<Modal open onClose={onClose} title="New folder">
			<form
				className="space-y-4"
				onSubmit={(event) => {
					event.preventDefault();
					create.mutate({ groupId, title, icon, incognito });
				}}
			>
				<Field label="Name">
					<input
						className="field"
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						placeholder="Recipes, Side projects…"
						required
						maxLength={60}
						autoFocus
					/>
				</Field>
				<Field label="Icon">
					<div className="flex flex-wrap gap-1.5">
						{FOLDER_ICONS.map((option) => (
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
					</div>
				</Field>
				<Toggle
					label="🕶️ Open everything here in incognito"
					checked={incognito}
					onChange={setIncognito}
				/>
				<div className="flex justify-end gap-2 pt-2">
					<button type="button" className="btn-ghost" onClick={onClose}>
						Cancel
					</button>
					<button
						type="submit"
						className="btn-primary"
						disabled={create.isPending || !title.trim()}
					>
						{create.isPending && <Loader2 className="size-4 animate-spin" />}{" "}
						Create folder
					</button>
				</div>
			</form>
		</Modal>
	);
}

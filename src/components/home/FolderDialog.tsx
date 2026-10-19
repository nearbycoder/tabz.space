import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core";
import {
	arrayMove,
	rectSortingStrategy,
	SortableContext,
} from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import {
	ChevronRight,
	ExternalLink,
	FolderPlus,
	Loader2,
	Plus,
	Trash2,
	VenetianMask,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Field, Toggle } from "#/components/ui/controls";
import { Modal } from "#/components/ui/Modal";
import { cn } from "#/lib/cn";
import { useDragSensors } from "#/lib/dnd-sensors";
import { homeKey, useHomeAction } from "#/lib/home-query";
import { useVisibleArea } from "#/lib/use-keyboard-inset";
import { sealContents } from "#/lib/vault-session";
import type { HomeData } from "#/server/home";
import {
	arrangeFolder,
	createFolder,
	deleteBookmark,
	updateBookmark,
} from "#/server/home";
import { BookmarkTile, folderSummary } from "./BookmarkTile";
import { useHomeContext } from "./context";
import { gridFor } from "./GroupCard";
import { findInTree, flattenTree, linksIn, type TreeItem } from "./types";

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

/** A folder anywhere in the library, with its group and the folders above it. */
const findFolder = (boards: HomeData["boards"], folderId: string) => {
	for (const group of boards.flatMap((b) => b.groups)) {
		const found = findInTree(group.bookmarks, folderId);
		if (found) return { ...found, group };
	}
	return null;
};

/** An opened folder: its links in a grid you can reorder, plus rename/icon/delete. */
export function FolderDialog({
	folderId,
	onClose,
}: {
	folderId: string;
	onClose: () => void;
}) {
	const { boards, openDialog, isIncognito, openAll } = useHomeContext();
	const found = findFolder(boards, folderId);
	const folder = found?.item;
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
	const remove = useHomeAction(deleteBookmark, {
		onSuccess: onClose,
		undoable: () => `Deleted folder “${folder?.title}”`,
	});
	const sensors = useDragSensors();
	// With the keyboard up (renaming), sit in the visible area above it.
	const visible = useVisibleArea();

	if (!folder) return null;

	// Folders in an encrypted vault are saved sealed.
	const saveFolder = async (patch: { title?: string; icon?: string }) => {
		if (!folder.meta.sealed) {
			rename.mutate({ id: folder.id, ...patch });
			return;
		}
		try {
			const sealed = await sealContents({
				title: patch.title ?? folder.title,
				icon: patch.icon ?? folder.icon,
			});
			rename.mutate({ id: folder.id, sealed });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Couldn't encrypt");
		}
	};

	const saveTitle = () => {
		if (title.trim() && title.trim() !== folder.title)
			void saveFolder({ title: title.trim() });
	};

	const links = linksIn(order);
	// Where this folder can live: the group's top level, or any folder that
	// isn't this one or inside it.
	const inside = new Set([
		folder.id,
		...flattenTree(folder.children).map((i) => i.id),
	]);
	const destinations = found
		? walkFolders(found.group.bookmarks).filter(
				({ item }) => !inside.has(item.id),
			)
		: [];

	const onDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return;
		// Dropped onto a subfolder: move it in there.
		const overKey = String(over.id);
		if (overKey.startsWith("into:")) {
			const target = order.find((c) => c.id === overKey.slice(5));
			if (!target || target.id === active.id) return;
			setOrder(order.filter((c) => c.id !== active.id));
			arrange.mutate({
				folderId: target.id,
				ids: [...target.children.map((c) => c.id), String(active.id)],
			});
			return;
		}
		const next = arrayMove(
			order,
			order.findIndex((c) => c.id === active.id),
			order.findIndex((c) => c.id === over.id),
		);
		setOrder(next);
		arrange.mutate({ folderId: folder.id, ids: next.map((c) => c.id) });
	};

	return createPortal(
		<div
			className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
			style={
				visible
					? { top: visible.top, height: visible.height, bottom: "auto" }
					: undefined
			}
		>
			<button
				type="button"
				aria-label="Close"
				className="absolute inset-0 bg-black/35 backdrop-blur-md"
				onClick={onClose}
			/>
			<div
				role="dialog"
				aria-label={folder.title}
				style={visible ? { maxHeight: visible.height - 8 } : undefined}
				className="glass animate-folder relative max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[2rem] sm:pb-6"
			>
				{found && (
					<nav
						aria-label="Folder path"
						className="mb-3 flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted"
					>
						<button type="button" className="hover:text-ink" onClick={onClose}>
							{found.group.name}
						</button>
						{found.path.map((parent) => (
							<span key={parent.id} className="flex items-center gap-1">
								<ChevronRight className="size-3" />
								<button
									type="button"
									className="max-w-[10rem] truncate hover:text-ink"
									onClick={() =>
										openDialog({ type: "folder", folderId: parent.id })
									}
								>
									{parent.icon ?? "📁"} {parent.title}
								</button>
							</span>
						))}
						<ChevronRight className="size-3" />
						<span className="truncate text-ink">{folder.title}</span>
					</nav>
				)}
				<div className="mb-5 flex items-center gap-3">
					<div className="relative">
						<select
							aria-label="Folder icon"
							value={folder.icon ?? "📁"}
							onChange={(event) =>
								void saveFolder({ icon: event.target.value })
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
					<span className="shrink-0 text-xs text-muted">
						{folderSummary(order)}
					</span>
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
								title="Add a link"
							>
								<Plus className="size-5" />
							</button>
							<button
								type="button"
								onClick={() =>
									openDialog({
										type: "new-folder",
										groupId: folder.groupId,
										parentId: folder.id,
									})
								}
								className="focus-ring grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-line text-muted transition hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:text-ink"
								aria-label="New folder inside"
								title="New folder inside"
							>
								<FolderPlus className="size-5" />
							</button>
						</div>
					</SortableContext>
				</DndContext>
				{order.length === 0 && (
					<p className="mt-2 text-center text-sm text-muted">
						Empty folder. Drag links onto it, or add a link or folder here.
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
					{links.length > 0 && (
						<button
							type="button"
							className="btn-outline"
							title={
								folder.incognito || links.some(isIncognito)
									? `Open all ${links.length} in a private window`
									: `Open all ${links.length} in new tabs`
							}
							onClick={() => openAll(links)}
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

				{found && (
					<label className="mt-4 flex items-center gap-2 text-sm">
						<span className="shrink-0 text-muted">Inside</span>
						<select
							className="field"
							value={folder.parentId ?? ""}
							onChange={(event) =>
								rename.mutate({
									id: folder.id,
									parentId: event.target.value || null,
								})
							}
						>
							<option value="">{found.group.name} (top level)</option>
							{destinations.map(({ item, depth }) => (
								<option key={item.id} value={item.id}>
									{`${"\u00a0\u00a0\u00a0".repeat(depth + 1)}${item.icon ?? "📁"} ${item.title}`}
								</option>
							))}
						</select>
					</label>
				)}

				<div className="mt-4 flex flex-wrap items-center gap-2">
					{confirming ? (
						<>
							<button
								type="button"
								className="btn-outline"
								onClick={() => remove.mutate({ id: folder.id })}
							>
								Keep what's inside, remove folder
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

/** Every folder in a tree with its depth (for "move to" pickers). */
function walkFolders(
	items: TreeItem[],
	depth = 0,
): { item: TreeItem; depth: number }[] {
	return items
		.filter((item) => item.kind === "folder")
		.flatMap((item) => [
			{ item, depth },
			...walkFolders(item.children, depth + 1),
		]);
}

export function NewFolderDialog({
	groupId,
	parentId,
	onClose,
}: {
	groupId: string;
	/** Create it inside this folder. */
	parentId?: string;
	onClose: () => void;
}) {
	const [title, setTitle] = useState("");
	const [icon, setIcon] = useState(FOLDER_ICONS[0]);
	const [incognito, setIncognito] = useState(false);
	const { openDialog, boards } = useHomeContext();
	const queryClient = useQueryClient();
	const sealHere =
		Boolean(
			boards.find((b) => b.groups.some((g) => g.id === groupId))?.vault,
		) && Boolean(queryClient.getQueryData<HomeData>(homeKey)?.vault.encrypted);
	const create = useHomeAction(createFolder, {
		onSuccess: (folder) => openDialog({ type: "folder", folderId: folder.id }),
	});
	return (
		<Modal
			open
			onClose={onClose}
			title={parentId ? "New folder inside" : "New folder"}
		>
			<form
				className="space-y-4"
				onSubmit={(event) => {
					event.preventDefault();
					if (!sealHere) {
						create.mutate({ groupId, parentId, title, icon, incognito });
						return;
					}
					sealContents({ title, icon })
						.then((sealed) =>
							create.mutate({
								groupId,
								parentId,
								title: "Locked folder",
								incognito,
								sealed,
							}),
						)
						.catch((error) => toast.error(error.message));
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

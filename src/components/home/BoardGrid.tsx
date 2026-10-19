import {
	type CollisionDetection,
	closestCenter,
	closestCorners,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	pointerWithin,
} from "@dnd-kit/core";
import {
	arrayMove,
	rectSortingStrategy,
	SortableContext,
} from "@dnd-kit/sortable";
import { FolderPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buzz, useDragSensors } from "#/lib/dnd-sensors";
import { useHomeAction } from "#/lib/home-query";
import {
	arrangeBookmarks,
	arrangeFolder,
	reorderGroups,
	updateGroup,
} from "#/server/home";
import { TileBody } from "./BookmarkTile";
import { useHomeContext } from "./context";
import { GroupCard } from "./GroupCard";
import type { HomeBoard, HomeGroup } from "./types";

const groupKey = (id: string) => `group:${id}`;
const isGroupKey = (id: string) => id.startsWith("group:");
const isIntoKey = (id: string) => id.startsWith("into:");

export function BoardGrid({ board }: { board: HomeBoard }) {
	const { editing, openDialog } = useHomeContext();
	const [items, setItems] = useState<HomeGroup[]>(board.groups);
	const [activeId, setActiveId] = useState<string | null>(null);
	const dragOrigin = useRef<string | null>(null);
	const itemsRef = useRef(items);
	itemsRef.current = items;

	// Follow server data whenever we're not mid-drag.
	useEffect(() => {
		if (!activeId) setItems(board.groups);
	}, [board.groups, activeId]);

	const withBoardGroups = <T extends { boards: HomeBoard[] }>(
		data: T,
		groups: HomeGroup[],
	) => ({
		...data,
		boards: data.boards.map((b) => (b.id === board.id ? { ...b, groups } : b)),
	});

	const persistGroups = useHomeAction(reorderGroups, {
		optimistic: (data, input) =>
			withBoardGroups(
				data,
				input.ids
					.map((id) => board.groups.find((g) => g.id === id))
					.filter((g): g is HomeGroup => Boolean(g)),
			),
	});
	const persistBookmarks = useHomeAction(arrangeBookmarks, {
		optimistic: (data) => withBoardGroups(data, itemsRef.current),
	});
	const moveIntoFolder = useHomeAction(arrangeFolder, {
		optimistic: (data) => withBoardGroups(data, itemsRef.current),
	});
	const toggleGroup = useHomeAction(updateGroup, {
		optimistic: (data, input) => ({
			...data,
			boards: data.boards.map((b) => ({
				...b,
				groups: b.groups.map((g) =>
					g.id === input.id
						? { ...g, collapsed: input.collapsed ?? g.collapsed }
						: g,
				),
			})),
		}),
	});

	const sensors = useDragSensors();

	const findGroupOf = (id: string) => {
		if (id.startsWith("drop:")) return id.slice(5);
		return itemsRef.current.find((group) =>
			group.bookmarks.some((item) => item.id === id),
		)?.id;
	};
	const findItem = (id: string) =>
		itemsRef.current.flatMap((g) => g.bookmarks).find((item) => item.id === id);

	// Groups collide with groups. Links prefer a folder's drop zone when the pointer
	// is right over it, then tiles, then group drop areas.
	const collisionDetection: CollisionDetection = (args) => {
		const activeKey = String(args.active.id);
		const activeIsGroup = isGroupKey(activeKey);
		const candidates = args.droppableContainers.filter(
			(c) => isGroupKey(String(c.id)) === activeIsGroup,
		);
		if (activeIsGroup)
			return closestCenter({ ...args, droppableContainers: candidates });
		const draggingFolder = findItem(activeKey)?.kind === "folder";
		const within = pointerWithin({ ...args, droppableContainers: candidates });
		const folderHit =
			!draggingFolder &&
			within.find(
				(hit) => isIntoKey(String(hit.id)) && hit.id !== `into:${activeKey}`,
			);
		if (folderHit) return [folderHit];
		const sortable = candidates.filter((c) => !isIntoKey(String(c.id)));
		const tiles = within.filter(
			(hit) =>
				!String(hit.id).startsWith("drop:") && !isIntoKey(String(hit.id)),
		);
		if (tiles.length) return tiles;
		const zones = within.filter((hit) => String(hit.id).startsWith("drop:"));
		return zones.length
			? zones
			: closestCorners({ ...args, droppableContainers: sortable });
	};

	const onDragStart = ({ active }: DragStartEvent) => {
		buzz();
		setActiveId(String(active.id));
		dragOrigin.current = isGroupKey(String(active.id))
			? null
			: (findGroupOf(String(active.id)) ?? null);
	};

	// Moving across groups happens live so the destination opens up a slot.
	const onDragOver = ({ active, over }: DragOverEvent) => {
		const activeKey = String(active.id);
		if (!over || isGroupKey(activeKey) || isIntoKey(String(over.id))) return;
		const from = findGroupOf(activeKey);
		const to = findGroupOf(String(over.id));
		if (!from || !to || from === to) return;
		setItems((groups) => {
			const source = groups.find((g) => g.id === from);
			const target = groups.find((g) => g.id === to);
			const moving = source?.bookmarks.find((b) => b.id === activeKey);
			if (!source || !target || !moving) return groups;
			const overIndex = target.bookmarks.findIndex((b) => b.id === over.id);
			const index = overIndex >= 0 ? overIndex : target.bookmarks.length;
			return groups.map((group) => {
				if (group.id === from)
					return {
						...group,
						bookmarks: group.bookmarks.filter((b) => b.id !== activeKey),
					};
				if (group.id === to) {
					const next = [...group.bookmarks];
					next.splice(index, 0, { ...moving, groupId: to });
					return { ...group, bookmarks: next };
				}
				return group;
			});
		});
	};

	const onDragEnd = ({ active, over, delta }: DragEndEvent) => {
		const activeKey = String(active.id);
		setActiveId(null);
		// Press-and-hold released in place (the touch "long press"): open the item instead.
		if (
			!isGroupKey(activeKey) &&
			over?.id === active.id &&
			Math.hypot(delta.x, delta.y) < 8
		) {
			const item = findItem(activeKey);
			if (item?.kind === "folder")
				openDialog({ type: "folder", folderId: item.id });
			else if (item)
				openDialog({ type: "bookmark", groupId: item.groupId, bookmark: item });
			return;
		}
		if (!over) {
			setItems(board.groups);
			return;
		}
		const overKey = String(over.id);

		if (isGroupKey(activeKey)) {
			const from = items.findIndex((g) => groupKey(g.id) === activeKey);
			const to = items.findIndex((g) => groupKey(g.id) === overKey);
			if (from < 0 || to < 0 || from === to) return;
			const next = arrayMove(items, from, to);
			setItems(next);
			persistGroups.mutate({ ids: next.map((g) => g.id) });
			return;
		}

		// Dropped onto a folder: move the link inside it.
		if (isIntoKey(overKey)) {
			const folderId = overKey.slice(5);
			const moving = findItem(activeKey);
			const folder = findItem(folderId);
			if (!moving || !folder || moving.kind === "folder") return;
			const next = items.map((g) => ({
				...g,
				bookmarks: g.bookmarks
					.filter((b) => b.id !== activeKey)
					.map((b) =>
						b.id === folderId
							? {
									...b,
									children: [
										...b.children,
										{ ...moving, parentId: folderId, groupId: b.groupId },
									],
								}
							: b,
					),
			}));
			setItems(next);
			itemsRef.current = next;
			moveIntoFolder.mutate({
				folderId,
				ids: [...folder.children.map((c) => c.id), activeKey],
			});
			return;
		}

		const groupId = findGroupOf(activeKey);
		if (!groupId) return;
		let next = items;
		const group = items.find((g) => g.id === groupId);
		if (group) {
			const from = group.bookmarks.findIndex((b) => b.id === activeKey);
			const to = group.bookmarks.findIndex((b) => b.id === overKey);
			if (from >= 0 && to >= 0 && from !== to) {
				next = items.map((g) =>
					g.id === groupId
						? { ...g, bookmarks: arrayMove(g.bookmarks, from, to) }
						: g,
				);
				setItems(next);
				itemsRef.current = next;
			}
		}
		const touched = new Set(
			[groupId, dragOrigin.current].filter((id): id is string => Boolean(id)),
		);
		const original = board.groups
			.find((g) => g.id === groupId)
			?.bookmarks.map((b) => b.id)
			.join();
		const current = next
			.find((g) => g.id === groupId)
			?.bookmarks.map((b) => b.id)
			.join();
		if (touched.size === 1 && original === current) return;
		persistBookmarks.mutate({
			groups: [...touched].map((id) => ({
				groupId: id,
				ids: next.find((g) => g.id === id)?.bookmarks.map((b) => b.id) ?? [],
			})),
		});
	};

	const activeItem =
		activeId && !isGroupKey(activeId)
			? items.flatMap((g) => g.bookmarks).find((b) => b.id === activeId)
			: undefined;
	const activeGroup = activeItem
		? items.find((g) => g.id === activeItem.groupId)
		: undefined;
	const columns = board.layout.columns;

	return (
		<DndContext
			id={`board-${board.id}`}
			sensors={sensors}
			collisionDetection={collisionDetection}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDragEnd={onDragEnd}
			onDragCancel={() => {
				setActiveId(null);
				setItems(board.groups);
			}}
		>
			<SortableContext
				items={items.map((g) => groupKey(g.id))}
				strategy={rectSortingStrategy}
			>
				<div
					className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:[grid-template-columns:repeat(var(--cols-sm),minmax(0,1fr))] lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
					style={
						{
							"--cols": columns,
							"--cols-sm": Math.min(columns, 2),
						} as React.CSSProperties
					}
				>
					{items.map((group) => (
						<GroupCard
							key={group.id}
							group={group}
							layout={board.layout}
							onToggle={() =>
								toggleGroup.mutate({
									id: group.id,
									collapsed: !group.collapsed,
								})
							}
						/>
					))}
					{(editing || items.length === 0) && (
						<button
							type="button"
							onClick={() => openDialog({ type: "group", boardId: board.id })}
							className="focus-ring flex min-h-32 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line text-sm text-muted transition hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:text-ink"
						>
							<FolderPlus className="size-5" /> New group
						</button>
					)}
				</div>
			</SortableContext>
			<DragOverlay
				dropAnimation={{
					duration: 180,
					easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
				}}
			>
				{activeItem && (
					<div className="relative rotate-3 scale-110 drop-shadow-2xl">
						<TileBody
							item={activeItem}
							style={activeGroup?.options.tileStyle ?? board.layout.tileStyle}
							size={board.layout.tileSize}
							overlay
						/>
					</div>
				)}
			</DragOverlay>
		</DndContext>
	);
}

import {
	type CollisionDetection,
	closestCenter,
	closestCorners,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	pointerWithin,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	rectSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { FolderPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHomeAction } from "#/lib/home-query";
import { arrangeBookmarks, reorderGroups, updateGroup } from "#/server/home";
import { TileBody } from "./BookmarkTile";
import { GroupCard } from "./GroupCard";
import type { DialogState, HomeBoard, HomeBookmark, HomeGroup } from "./types";

type Props = {
	board: HomeBoard;
	editing: boolean;
	openInNewTab: boolean;
	openDialog: (dialog: DialogState) => void;
	onVisit: (bookmark: HomeBookmark) => void;
};

const groupKey = (id: string) => `group:${id}`;
const isGroupKey = (id: string) => id.startsWith("group:");

export function BoardGrid({
	board,
	editing,
	openInNewTab,
	openDialog,
	onVisit,
}: Props) {
	const [items, setItems] = useState<HomeGroup[]>(board.groups);
	const [activeId, setActiveId] = useState<string | null>(null);
	const dragOrigin = useRef<string | null>(null);

	// Follow server data whenever we're not mid-drag.
	useEffect(() => {
		if (!activeId) setItems(board.groups);
	}, [board.groups, activeId]);

	const persistGroups = useHomeAction(reorderGroups, {
		optimistic: (data, input) => ({
			...data,
			boards: data.boards.map((b) =>
				b.id === board.id
					? {
							...b,
							groups: input.ids
								.map((id) => b.groups.find((g) => g.id === id))
								.filter((g): g is HomeGroup => Boolean(g)),
						}
					: b,
			),
		}),
	});
	const persistBookmarks = useHomeAction(arrangeBookmarks, {
		optimistic: (data) => ({
			...data,
			boards: data.boards.map((b) =>
				b.id === board.id ? { ...b, groups: itemsRef.current } : b,
			),
		}),
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

	const itemsRef = useRef(items);
	itemsRef.current = items;

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const findGroupOf = (id: string) => {
		if (id.startsWith("drop:")) return id.slice(5);
		return itemsRef.current.find((group) =>
			group.bookmarks.some((bookmark) => bookmark.id === id),
		)?.id;
	};

	// Groups only collide with groups; bookmarks with bookmarks or group drop zones.
	const collisionDetection: CollisionDetection = (args) => {
		const activeIsGroup = isGroupKey(String(args.active.id));
		const droppableContainers = args.droppableContainers.filter(
			(container) => isGroupKey(String(container.id)) === activeIsGroup,
		);
		if (activeIsGroup) return closestCenter({ ...args, droppableContainers });
		const within = pointerWithin({ ...args, droppableContainers });
		const tiles = within.filter((hit) => !String(hit.id).startsWith("drop:"));
		if (tiles.length) return tiles;
		return within.length
			? within
			: closestCorners({ ...args, droppableContainers });
	};

	const onDragStart = ({ active }: DragStartEvent) => {
		setActiveId(String(active.id));
		dragOrigin.current = isGroupKey(String(active.id))
			? null
			: (findGroupOf(String(active.id)) ?? null);
	};

	// Moving across groups happens live so the destination opens up a slot.
	const onDragOver = ({ active, over }: DragOverEvent) => {
		const activeKey = String(active.id);
		if (!over || isGroupKey(activeKey)) return;
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

	const onDragEnd = ({ active, over }: DragEndEvent) => {
		const activeKey = String(active.id);
		setActiveId(null);
		if (!over) {
			setItems(board.groups);
			return;
		}
		if (isGroupKey(activeKey)) {
			const from = items.findIndex((g) => groupKey(g.id) === activeKey);
			const to = items.findIndex((g) => groupKey(g.id) === over.id);
			if (from < 0 || to < 0 || from === to) return;
			const next = arrayMove(items, from, to);
			setItems(next);
			persistGroups.mutate({ ids: next.map((g) => g.id) });
			return;
		}
		const groupId = findGroupOf(activeKey);
		if (!groupId) return;
		let next = items;
		const group = items.find((g) => g.id === groupId);
		if (group) {
			const from = group.bookmarks.findIndex((b) => b.id === activeKey);
			const to = group.bookmarks.findIndex((b) => b.id === over.id);
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

	const activeBookmark =
		activeId && !isGroupKey(activeId)
			? items.flatMap((g) => g.bookmarks).find((b) => b.id === activeId)
			: undefined;
	const activeGroup = activeBookmark
		? items.find((g) => g.id === activeBookmark.groupId)
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
					className="grid items-start gap-4 sm:[grid-template-columns:repeat(var(--cols-sm),minmax(0,1fr))] lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
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
							editing={editing}
							openInNewTab={openInNewTab}
							onAdd={() => openDialog({ type: "bookmark", groupId: group.id })}
							onEditGroup={() =>
								openDialog({ type: "group", boardId: board.id, group })
							}
							onToggle={() =>
								toggleGroup.mutate({
									id: group.id,
									collapsed: !group.collapsed,
								})
							}
							onEditBookmark={(bookmark) =>
								openDialog({ type: "bookmark", groupId: group.id, bookmark })
							}
							onVisit={onVisit}
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
				{activeBookmark && (
					<div className="relative rotate-2 scale-105 drop-shadow-xl">
						<TileBody
							bookmark={activeBookmark}
							style={activeGroup?.options.tileStyle ?? board.layout.tileStyle}
							size={board.layout.tileSize}
							editing={false}
							openInNewTab={false}
							onEdit={() => {}}
							onVisit={() => {}}
							overlay
						/>
					</div>
				)}
			</DragOverlay>
		</DndContext>
	);
}

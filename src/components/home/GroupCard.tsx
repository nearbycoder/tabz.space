import { useDroppable } from "@dnd-kit/core";
import {
	rectSortingStrategy,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical, Plus, Settings2 } from "lucide-react";
import { cn } from "#/lib/cn";
import type { BoardLayout } from "#/lib/preferences";
import { BookmarkTile } from "./BookmarkTile";
import type { HomeBookmark, HomeGroup } from "./types";

type Props = {
	group: HomeGroup;
	layout: BoardLayout;
	editing: boolean;
	openInNewTab: boolean;
	onAdd: () => void;
	onEditGroup: () => void;
	onToggle: () => void;
	onEditBookmark: (bookmark: HomeBookmark) => void;
	onVisit: (bookmark: HomeBookmark) => void;
};

const gridFor = (
	style: BoardLayout["tileStyle"],
	size: BoardLayout["tileSize"],
) => {
	const min = {
		tile: { sm: "3.75rem", md: "4.5rem", lg: "5.75rem" },
		icon: { sm: "2.75rem", md: "3.25rem", lg: "4rem" },
		card: { sm: "11rem", md: "13rem", lg: "15rem" },
		list: { sm: "100%", md: "100%", lg: "100%" },
	}[style][size];
	return {
		gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}, 100%), 1fr))`,
	};
};

export function GroupCard({
	group,
	layout,
	editing,
	openInNewTab,
	onAdd,
	onEditGroup,
	onToggle,
	onEditBookmark,
	onVisit,
}: Props) {
	const style = group.options.tileStyle ?? layout.tileStyle;
	const span = Math.min(group.options.span ?? 1, layout.columns);
	const sortable = useSortable({
		id: `group:${group.id}`,
		data: { type: "group" },
	});
	const drop = useDroppable({
		id: `drop:${group.id}`,
		data: { type: "drop", groupId: group.id },
	});

	return (
		<section
			ref={sortable.setNodeRef}
			style={
				{
					transform: CSS.Translate.toString(sortable.transform),
					transition: sortable.transition,
					"--span": span,
				} as React.CSSProperties
			}
			className={cn(
				"glass group/card rounded-3xl p-4 shadow-sm lg:[grid-column:span_var(--span)/span_var(--span)]",
				sortable.isDragging && "z-10 opacity-60 shadow-2xl",
			)}
		>
			{(layout.showGroupTitles || editing) && (
				<header className="mb-3 flex items-center gap-1.5">
					<button
						type="button"
						aria-label="Drag group"
						className={cn(
							"icon-btn -ml-2 size-7 cursor-grab touch-none",
							!editing && "opacity-0 group-hover/card:opacity-100",
						)}
						{...sortable.attributes}
						{...sortable.listeners}
					>
						<GripVertical className="size-3.5" />
					</button>
					<span
						className="size-2 shrink-0 rounded-full"
						style={{ background: group.color ?? "var(--muted)" }}
					/>
					<h2 className="truncate text-sm font-semibold">{group.name}</h2>
					<span className="text-xs text-muted">{group.bookmarks.length}</span>
					<div
						className={cn(
							"ml-auto flex items-center transition",
							!editing &&
								"opacity-0 group-hover/card:opacity-100 focus-within:opacity-100",
						)}
					>
						<button
							type="button"
							className="icon-btn size-7"
							aria-label="Add bookmark"
							onClick={onAdd}
						>
							<Plus className="size-4" />
						</button>
						<button
							type="button"
							className="icon-btn size-7"
							aria-label="Group settings"
							onClick={onEditGroup}
						>
							<Settings2 className="size-3.5" />
						</button>
						<button
							type="button"
							className="icon-btn size-7"
							aria-label={group.collapsed ? "Expand" : "Collapse"}
							onClick={onToggle}
						>
							<ChevronDown
								className={cn(
									"size-4 transition",
									group.collapsed && "-rotate-90",
								)}
							/>
						</button>
					</div>
				</header>
			)}
			{!group.collapsed && (
				<div
					ref={drop.setNodeRef}
					className={cn(
						"min-h-12 rounded-2xl transition",
						drop.isOver &&
							group.bookmarks.length === 0 &&
							"bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]",
					)}
				>
					<SortableContext
						items={group.bookmarks.map((bookmark) => bookmark.id)}
						strategy={
							style === "list"
								? verticalListSortingStrategy
								: rectSortingStrategy
						}
					>
						<div
							className={cn("grid", style === "list" ? "gap-0.5" : "gap-3")}
							style={gridFor(style, layout.tileSize)}
						>
							{group.bookmarks.map((bookmark) => (
								<BookmarkTile
									key={bookmark.id}
									bookmark={bookmark}
									style={style}
									size={layout.tileSize}
									editing={editing}
									openInNewTab={openInNewTab}
									onEdit={() => onEditBookmark(bookmark)}
									onVisit={() => onVisit(bookmark)}
								/>
							))}
							{(editing || group.bookmarks.length === 0) && (
								<button
									type="button"
									onClick={onAdd}
									className={cn(
										"focus-ring flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-sm text-muted transition hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:text-ink",
										style === "tile" || style === "icon"
											? "aspect-square"
											: "px-3 py-2.5",
									)}
								>
									<Plus className="size-4" />
									{style !== "tile" && style !== "icon" && "Add bookmark"}
								</button>
							)}
						</div>
					</SortableContext>
				</div>
			)}
		</section>
	);
}

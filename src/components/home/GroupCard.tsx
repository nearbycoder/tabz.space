import { useDroppable } from "@dnd-kit/core";
import {
	rectSortingStrategy,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	ChevronDown,
	ExternalLink,
	FolderPlus,
	GripVertical,
	Plus,
	Settings2,
	Sparkles,
} from "lucide-react";
import { useMemo } from "react";
import { cn } from "#/lib/cn";
import {
	type BoardLayout,
	type TileStyle,
	WIDGET_TYPES,
} from "#/lib/preferences";
import { SMART_EMPTY, smartItems } from "#/lib/smart";
import { BookmarkTile, TileBody } from "./BookmarkTile";
import { useHomeContext } from "./context";
import type { HomeGroup } from "./types";
import { WidgetBody } from "./widgets/WidgetBody";

type Props = {
	group: HomeGroup;
	layout: BoardLayout;
	onToggle: () => void;
};

export const gridFor = (style: TileStyle, size: BoardLayout["tileSize"]) => {
	const min = {
		tile: { sm: "3.75rem", md: "4.5rem", lg: "5.75rem" },
		icon: { sm: "2.75rem", md: "3.25rem", lg: "4rem" },
		card: { sm: "11rem", md: "13rem", lg: "15rem" },
		gallery: { sm: "8rem", md: "10rem", lg: "13rem" },
		list: { sm: "100%", md: "100%", lg: "100%" },
	}[style][size];
	return {
		gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}, 100%), 1fr))`,
	};
};

export function GroupCard({ group, layout, onToggle }: Props) {
	const { editing, openDialog, openAll, boards } = useHomeContext();
	const smart = group.kind === "smart" ? group.options.smart : undefined;
	const widget = group.kind === "widget" ? group.options.widget : undefined;
	const smartLinks = useMemo(
		() => (smart ? smartItems(boards, smart) : []),
		[boards, smart],
	);
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
	const links = smart
		? smartLinks
		: group.bookmarks.flatMap((item) =>
				item.kind === "folder" ? item.children : [item],
			);
	const total = links.length;
	const square = style === "tile" || style === "icon";

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
				"glass group/card min-w-0 rounded-3xl p-4 shadow-sm lg:[grid-column:span_var(--span)/span_var(--span)]",
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
					{smart && (
						<Sparkles
							className="size-3.5 shrink-0 text-accent"
							aria-label="Smart group"
						/>
					)}
					{widget && (
						<span className="text-sm leading-none" aria-hidden="true">
							{WIDGET_TYPES[widget.type].icon}
						</span>
					)}
					<h2 className="truncate text-sm font-semibold">{group.name}</h2>
					{!widget && <span className="text-xs text-muted">{total}</span>}
					<div
						className={cn(
							"ml-auto flex items-center transition",
							!editing &&
								"opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
						)}
					>
						{total > 1 && (
							<button
								type="button"
								className="icon-btn size-7 pointer-coarse:size-9"
								aria-label="Open all as tabs"
								title={`Open all ${total} as tabs`}
								onClick={() => openAll(links)}
							>
								<ExternalLink className="size-3.5" />
							</button>
						)}
						{!smart && !widget && (
							<>
								<button
									type="button"
									className="icon-btn size-7 pointer-coarse:size-9"
									aria-label="Add bookmark"
									title="Add bookmark"
									onClick={() =>
										openDialog({ type: "bookmark", groupId: group.id })
									}
								>
									<Plus className="size-4" />
								</button>
								<button
									type="button"
									className="icon-btn size-7 pointer-coarse:size-9"
									aria-label="New folder"
									title="New folder"
									onClick={() =>
										openDialog({ type: "new-folder", groupId: group.id })
									}
								>
									<FolderPlus className="size-3.5" />
								</button>
							</>
						)}
						<button
							type="button"
							className="icon-btn size-7 pointer-coarse:size-9"
							aria-label="Group settings"
							title="Group settings"
							onClick={() =>
								openDialog({ type: "group", boardId: group.boardId, group })
							}
						>
							<Settings2 className="size-3.5" />
						</button>
						<button
							type="button"
							className="icon-btn size-7 pointer-coarse:size-9"
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
			{!group.collapsed && smart && (
				<div
					className={cn("grid", style === "list" ? "gap-0.5" : "gap-3")}
					style={gridFor(style, layout.tileSize)}
				>
					{smartLinks.map((item) => (
						<div key={item.id} className="group/tile relative">
							<TileBody item={item} style={style} size={layout.tileSize} />
						</div>
					))}
					{smartLinks.length === 0 && (
						<p className="col-span-full py-3 text-center text-sm text-muted">
							{SMART_EMPTY[smart.sort]}
						</p>
					)}
				</div>
			)}
			{!group.collapsed && widget && <WidgetBody group={group} />}
			{!group.collapsed && !smart && !widget && (
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
						items={group.bookmarks.map((item) => item.id)}
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
							{group.bookmarks.map((item) => (
								<BookmarkTile
									key={item.id}
									item={item}
									style={style}
									size={layout.tileSize}
								/>
							))}
							{(editing || group.bookmarks.length === 0) && (
								<button
									type="button"
									onClick={() =>
										openDialog({ type: "bookmark", groupId: group.id })
									}
									className={cn(
										"focus-ring flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-sm text-muted transition hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:text-ink",
										square
											? "aspect-square"
											: style === "gallery"
												? "aspect-[16/12]"
												: "px-3 py-2.5",
									)}
								>
									<Plus className="size-4" />
									{!square && "Add bookmark"}
								</button>
							)}
						</div>
					</SortableContext>
				</div>
			)}
		</section>
	);
}

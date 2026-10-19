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
import { Suspense, useMemo, useRef, useState } from "react";
import { cn } from "#/lib/cn";
import { useHomeAction } from "#/lib/home-query";
import { lazyNamed } from "#/lib/lazy";
import {
	type BoardLayout,
	type GroupWidth,
	groupFraction,
	nearestWidth,
	type TileStyle,
	WIDGET_TYPES,
} from "#/lib/preferences";
import { SMART_EMPTY, smartItems } from "#/lib/smart";
import { updateGroup } from "#/server/home";
import { BookmarkTile, TileBody } from "./BookmarkTile";
import { useHomeContext } from "./context";
import { type HomeGroup, linksIn } from "./types";

// Widget code only loads on boards that have widgets.
const WidgetBody = lazyNamed(
	() => import("./widgets/WidgetBody"),
	"WidgetBody",
);

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

/*
 * Group widths: the board is a wrapping row, and each group takes a fraction
 * of it on wide screens (halves on tablets, full width on phones). With a
 * 1rem gap, fractions that add up to 1 fill a row exactly.
 */
export const GROUP_WIDTH_CLASS =
	"w-full sm:w-[calc((100%_+_1rem)_*_var(--w-sm)_-_1rem)] lg:w-[calc((100%_+_1rem)_*_var(--w)_-_1rem)]";

export const groupWidthStyle = (fraction: number) =>
	({
		"--w": fraction,
		"--w-sm": fraction <= 0.5 ? 0.5 : 1,
	}) as React.CSSProperties;

const WIDTH_LABEL: Record<string, string> = {
	"1/4": "¼",
	"1/3": "⅓",
	"1/2": "½",
	"2/3": "⅔",
	"3/4": "¾",
	"1": "Full",
};

export function GroupCard({ group, layout, onToggle }: Props) {
	const { editing, openDialog, openAll, boards, readOnly } = useHomeContext();
	const smart = group.kind === "smart" ? group.options.smart : undefined;
	const widget = group.kind === "widget" ? group.options.widget : undefined;
	const smartLinks = useMemo(
		() => (smart ? smartItems(boards, smart) : []),
		[boards, smart],
	);
	const style = group.options.tileStyle ?? layout.tileStyle;
	// While resizing, the card follows the pointer before the width is saved.
	const [resizing, setResizing] = useState<GroupWidth | null>(null);
	const fraction = resizing
		? groupFraction({ width: resizing }, layout.columns)
		: groupFraction(group.options, layout.columns);
	const card = useRef<HTMLElement | null>(null);
	const resize = useHomeAction(updateGroup, {
		optimistic: (data, input) => ({
			...data,
			boards: data.boards.map((board) => ({
				...board,
				groups: board.groups.map((g) =>
					g.id === input.id && input.options
						? { ...g, options: { ...g.options, ...input.options } }
						: g,
				),
			})),
		}),
	});
	const startResize = (event: React.PointerEvent) => {
		const node = card.current;
		const row = node?.parentElement;
		if (!node || !row) return;
		event.preventDefault();
		event.stopPropagation();
		const left = node.getBoundingClientRect().left;
		const total = row.getBoundingClientRect().width;
		const gap = 16;
		let chosen: GroupWidth | null = null;
		const move = (moveEvent: PointerEvent) => {
			const width = Math.max(40, moveEvent.clientX - left);
			chosen = nearestWidth((width + gap) / (total + gap));
			setResizing(chosen);
		};
		const end = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", end);
			window.removeEventListener("pointercancel", end);
			setResizing(null);
			if (chosen && chosen !== group.options.width)
				resize.mutate({ id: group.id, options: { width: chosen } });
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", end);
		window.addEventListener("pointercancel", end);
	};
	const sortable = useSortable({
		id: `group:${group.id}`,
		data: { type: "group" },
	});
	const drop = useDroppable({
		id: `drop:${group.id}`,
		data: { type: "drop", groupId: group.id },
	});
	const links = smart ? smartLinks : linksIn(group.bookmarks);
	const total = links.length;
	const square = style === "tile" || style === "icon";

	return (
		<section
			ref={(node) => {
				sortable.setNodeRef(node);
				card.current = node;
			}}
			data-group={group.name}
			data-kind={group.kind}
			style={
				{
					transform: CSS.Translate.toString(sortable.transform),
					transition: resizing ? undefined : sortable.transition,
					...groupWidthStyle(fraction),
				} as React.CSSProperties
			}
			className={cn(
				"glass group/card relative min-w-0 rounded-3xl p-4 shadow-sm",
				GROUP_WIDTH_CLASS,
				sortable.isDragging && "z-10 opacity-60 shadow-2xl",
				resizing &&
					"ring-2 ring-[color-mix(in_srgb,var(--accent)_60%,transparent)]",
			)}
		>
			{editing && !readOnly && (
				<button
					type="button"
					aria-label="Resize group"
					title="Drag to resize"
					onPointerDown={startResize}
					className="absolute top-1/2 -right-2 z-10 hidden h-14 w-4 -translate-y-1/2 cursor-ew-resize touch-none place-items-center lg:grid"
				>
					<span className="h-10 w-1.5 rounded-full bg-[color-mix(in_srgb,var(--ink)_25%,transparent)] transition hover:bg-accent" />
				</button>
			)}
			{resizing && (
				<span className="pointer-events-none absolute top-3 right-6 z-10 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white shadow">
					{WIDTH_LABEL[resizing] ?? resizing}
				</span>
			)}
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
							{"data" in widget && typeof widget.data.icon === "string"
								? widget.data.icon
								: WIDGET_TYPES[widget.type].icon}
						</span>
					)}
					<GroupName group={group} editable={!readOnly} />
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
						{!smart && !widget && !readOnly && (
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
						{!readOnly && (
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
						)}
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
			{!group.collapsed && widget && (
				<Suspense fallback={<div className="min-h-24" />}>
					<WidgetBody group={group} />
				</Suspense>
			)}
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
							{!readOnly && (editing || group.bookmarks.length === 0) && (
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

/** The group's name; click it to rename in place (Enter saves, Escape cancels). */
function GroupName({
	group,
	editable,
}: {
	group: HomeGroup;
	editable: boolean;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const rename = useHomeAction(updateGroup, {
		optimistic: (data, input) => ({
			...data,
			boards: data.boards.map((board) => ({
				...board,
				groups: board.groups.map((g) =>
					g.id === input.id ? { ...g, name: input.name ?? g.name } : g,
				),
			})),
		}),
	});
	const save = () => {
		const name = draft?.trim();
		setDraft(null);
		if (name && name !== group.name) rename.mutate({ id: group.id, name });
	};

	if (draft !== null)
		return (
			<input
				// biome-ignore lint/a11y/noAutofocus: opened by clicking the name
				autoFocus
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onFocus={(event) => event.currentTarget.select()}
				onBlur={save}
				onKeyDown={(event) => {
					if (event.key === "Enter") event.currentTarget.blur();
					if (event.key === "Escape") setDraft(null);
				}}
				maxLength={60}
				aria-label="Group name"
				className="min-w-0 flex-1 rounded-md bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] px-1 text-sm font-semibold outline-none ring-2 ring-[color-mix(in_srgb,var(--accent)_50%,transparent)]"
			/>
		);
	return (
		<h2 className="min-w-0 truncate text-sm font-semibold">
			{editable ? (
				<button
					type="button"
					title="Rename"
					onClick={() => setDraft(group.name)}
					className="max-w-full cursor-text truncate rounded-md px-1 text-left transition hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
				>
					{group.name}
				</button>
			) : (
				group.name
			)}
		</h2>
	);
}

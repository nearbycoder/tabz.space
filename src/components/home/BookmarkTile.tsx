import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Pencil } from "lucide-react";
import type { MouseEvent } from "react";
import { Favicon } from "#/components/ui/Favicon";
import { cn } from "#/lib/cn";
import type { BoardLayout, TileStyle } from "#/lib/preferences";
import { hostnameOf } from "#/lib/url";
import type { HomeBookmark } from "./types";

type Props = {
	bookmark: HomeBookmark;
	style: TileStyle;
	size: BoardLayout["tileSize"];
	editing: boolean;
	openInNewTab: boolean;
	onEdit: () => void;
	onVisit: () => void;
	overlay?: boolean;
};

const iconSize = {
	tile: {
		sm: "size-7 text-2xl",
		md: "size-9 text-3xl",
		lg: "size-11 text-4xl",
	},
	icon: { sm: "size-6 text-xl", md: "size-7 text-2xl", lg: "size-9 text-3xl" },
	card: { sm: "size-6 text-lg", md: "size-7 text-xl", lg: "size-8 text-2xl" },
	list: { sm: "size-4 text-sm", md: "size-5 text-base", lg: "size-6 text-lg" },
} as const;

export function BookmarkTile(props: Props) {
	const { bookmark, editing, overlay } = props;
	const sortable = useSortable({
		id: bookmark.id,
		data: { type: "bookmark", groupId: bookmark.groupId },
		disabled: overlay,
	});

	return (
		<div
			ref={sortable.setNodeRef}
			style={{
				transform: CSS.Translate.toString(sortable.transform),
				transition: sortable.transition,
			}}
			className={cn(
				"group/tile relative",
				sortable.isDragging && "opacity-30",
				editing && "cursor-grab",
			)}
			{...sortable.attributes}
			{...sortable.listeners}
		>
			<TileBody {...props} />
		</div>
	);
}

export function TileBody({
	bookmark,
	style,
	size,
	editing,
	openInNewTab,
	onEdit,
	onVisit,
	overlay,
}: Props) {
	const onClick = (event: MouseEvent) => {
		if (editing) {
			event.preventDefault();
			onEdit();
			return;
		}
		onVisit();
	};
	const icon = (
		<Favicon
			url={bookmark.url}
			icon={bookmark.icon}
			favicon={bookmark.meta.favicon}
			title={bookmark.title}
			color={bookmark.color}
			className={cn("shrink-0 rounded-md", iconSize[style][size])}
		/>
	);
	const tint = bookmark.color
		? { background: `color-mix(in srgb, ${bookmark.color} 14%, transparent)` }
		: undefined;

	const body =
		style === "tile" ? (
			<>
				<span
					className="grid aspect-square w-full place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] transition group-hover/tile:bg-[color-mix(in_srgb,var(--ink)_9%,transparent)]"
					style={tint}
				>
					{icon}
				</span>
				<span className="mt-1.5 block w-full truncate text-center text-xs text-muted group-hover/tile:text-ink">
					{bookmark.title}
				</span>
			</>
		) : style === "icon" ? (
			<span
				className="grid aspect-square w-full place-items-center rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] transition group-hover/tile:bg-[color-mix(in_srgb,var(--ink)_9%,transparent)]"
				style={tint}
			>
				{icon}
			</span>
		) : style === "card" ? (
			<span
				className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3 transition group-hover/tile:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))]"
				style={tint}
			>
				{icon}
				<span className="min-w-0">
					<span className="block truncate text-sm font-medium">
						{bookmark.title}
					</span>
					<span className="block truncate text-xs text-muted">
						{bookmark.description || hostnameOf(bookmark.url)}
					</span>
				</span>
			</span>
		) : (
			<span
				className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition group-hover/tile:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
				style={tint}
			>
				{icon}
				<span className="truncate text-sm">{bookmark.title}</span>
				<span className="ml-auto hidden truncate pl-2 text-xs text-muted sm:block">
					{hostnameOf(bookmark.url)}
				</span>
			</span>
		);

	return (
		<>
			<a
				href={bookmark.url}
				target={openInNewTab ? "_blank" : undefined}
				rel="noopener noreferrer"
				draggable={false}
				onClick={onClick}
				title={`${bookmark.title}\n${bookmark.url}`}
				className={cn(
					"focus-ring block rounded-2xl",
					overlay && "pointer-events-none",
				)}
			>
				{body}
			</a>
			{!overlay && (
				<button
					type="button"
					aria-label={`Edit ${bookmark.title}`}
					onPointerDown={(event) => event.stopPropagation()}
					onClick={onEdit}
					className={cn(
						"absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full border border-line bg-surface-2 text-muted shadow-sm transition hover:text-ink",
						editing
							? "opacity-100"
							: "opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100",
					)}
				>
					<Pencil className="size-3" />
				</button>
			)}
		</>
	);
}

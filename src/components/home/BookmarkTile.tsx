import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Folder, Pencil, VenetianMask } from "lucide-react";
import { type MouseEvent, type ReactNode, useRef, useState } from "react";
import { Favicon } from "#/components/ui/Favicon";
import { screenshotFor } from "#/lib/appearance";
import { cn } from "#/lib/cn";
import type { BoardLayout, TileStyle } from "#/lib/preferences";
import { hostnameOf } from "#/lib/url";
import { useHomeContext } from "./context";
import { LinkPreview } from "./LinkPreview";
import type { LinkItem } from "./types";

export type TileItem = LinkItem & { children?: LinkItem[] };

type Props = {
	item: TileItem;
	style: TileStyle;
	size: BoardLayout["tileSize"];
	/** Renders a static copy (drag overlay). */
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
	gallery: {
		sm: "size-4 text-sm",
		md: "size-5 text-base",
		lg: "size-5 text-base",
	},
} as const;

const boxBase =
	"relative grid aspect-square w-full place-items-center bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] transition group-hover/tile:bg-[color-mix(in_srgb,var(--ink)_9%,transparent)] group-hover/tile:shadow-lg";

export function BookmarkTile({ item, style, size }: Props) {
	const { editing } = useHomeContext();
	const sortable = useSortable({
		id: item.id,
		data: { type: "bookmark", kind: item.kind, groupId: item.groupId },
	});

	return (
		<div
			ref={sortable.setNodeRef}
			style={{
				transform: CSS.Translate.toString(sortable.transform),
				transition: sortable.transition,
			}}
			className={cn(
				"group/tile relative select-none [-webkit-touch-callout:none]",
				sortable.isDragging && "opacity-30",
				editing && "cursor-grab",
			)}
			{...sortable.attributes}
			{...sortable.listeners}
		>
			<div
				className={cn(editing && !sortable.isDragging && "animate-wiggle")}
				style={
					editing
						? { animationDelay: `${(item.position % 5) * -60}ms` }
						: undefined
				}
			>
				<TileBody item={item} style={style} size={size} />
			</div>
		</div>
	);
}

/** Tracks the cursor to tilt a tile in 3D. */
function useTilt(enabled: boolean) {
	const ref = useRef<HTMLSpanElement>(null);
	const onMouseMove = (event: MouseEvent) => {
		const node = ref.current;
		if (!enabled || !node) return;
		const rect = node.getBoundingClientRect();
		const x = (event.clientX - rect.left) / rect.width - 0.5;
		const y = (event.clientY - rect.top) / rect.height - 0.5;
		node.style.setProperty("--rx", `${(-y * 14).toFixed(2)}deg`);
		node.style.setProperty("--ry", `${(x * 14).toFixed(2)}deg`);
		node.style.setProperty("--lift", "-3px");
	};
	const onMouseLeave = () => {
		for (const prop of ["--rx", "--ry", "--lift"])
			ref.current?.style.removeProperty(prop);
	};
	return {
		ref,
		onMouseMove,
		onMouseLeave,
		className: enabled ? "tilt" : undefined,
	};
}

function FolderMosaic({
	folder,
	compact,
}: {
	folder: TileItem;
	compact?: boolean;
}) {
	const children = folder.children ?? [];
	if (children.length === 0)
		return (
			<Folder
				className={cn("text-accent", compact ? "size-1/2" : "size-1/2")}
			/>
		);
	return (
		<span className="grid size-[64%] grid-cols-2 gap-[10%]">
			{children.slice(0, 4).map((child) => (
				<span
					key={child.id}
					className="grid place-items-center overflow-hidden rounded-[22%] bg-surface-2 shadow-sm"
				>
					<Favicon
						url={child.url}
						icon={child.icon}
						favicon={child.meta.favicon}
						title={child.title}
						className="size-[70%] text-[0.7em]"
					/>
				</span>
			))}
		</span>
	);
}

export function TileBody({ item, style, size, overlay }: Props) {
	const { editing, settings, openDialog, onVisit, isIncognito, openLink } =
		useHomeContext();
	const incognito = isIncognito(item);
	const isFolder = item.kind === "folder";
	const tilt = useTilt(
		settings.tilt &&
			!overlay &&
			!editing &&
			(style === "tile" || style === "icon" || style === "gallery"),
	);
	const drop = useDroppable({
		id: `into:${item.id}`,
		data: { type: "into", folderId: item.id },
		disabled: !isFolder || overlay,
	});
	const [imageFailed, setImageFailed] = useState(false);

	const open = (event: MouseEvent) => {
		if (isFolder) {
			event.preventDefault();
			openDialog({ type: "folder", folderId: item.id });
			return;
		}
		if (editing) {
			event.preventDefault();
			openDialog({ type: "bookmark", groupId: item.groupId, bookmark: item });
			return;
		}
		if (incognito) {
			// Never let the browser open a private link in a normal tab.
			event.preventDefault();
			openLink(item);
			return;
		}
		onVisit(item);
	};

	const tint = item.color
		? { background: `color-mix(in srgb, ${item.color} 16%, transparent)` }
		: undefined;
	const icon = isFolder ? (
		<FolderMosaic folder={item} />
	) : (
		<Favicon
			url={item.url}
			icon={item.icon}
			favicon={item.meta.favicon}
			title={item.title}
			color={item.color}
			className={cn("shrink-0 rounded-md", iconSize[style][size])}
		/>
	);
	const smallIcon = isFolder ? (
		<span
			className={cn(
				"grid shrink-0 place-items-center rounded-md text-accent",
				iconSize[style][size],
			)}
		>
			{item.icon ? <span>{item.icon}</span> : <Folder className="size-full" />}
		</span>
	) : (
		icon
	);
	const dropRing =
		drop.isOver &&
		"ring-2 ring-accent ring-offset-2 ring-offset-transparent scale-105";
	const subtitle = isFolder
		? `${item.children?.length ?? 0} ${item.children?.length === 1 ? "link" : "links"}`
		: item.description || hostnameOf(item.url);

	let body: ReactNode;
	if (style === "tile" || style === "icon") {
		body = (
			<>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: mouse tracking only drives the visual tilt */}
				<span
					ref={(node) => {
						tilt.ref.current = node;
						drop.setNodeRef(node);
					}}
					onMouseMove={tilt.onMouseMove}
					onMouseLeave={tilt.onMouseLeave}
					className={cn(
						boxBase,
						style === "tile" ? "rounded-2xl" : "rounded-xl",
						tilt.className,
						dropRing,
					)}
					style={tint}
				>
					{icon}
				</span>
				{style === "tile" && (
					<span className="mt-1.5 block w-full truncate text-center text-xs text-muted group-hover/tile:text-ink">
						{item.title}
					</span>
				)}
			</>
		);
	} else if (style === "gallery") {
		// Private links don't send their URL to the screenshot service.
		const image =
			isFolder || incognito
				? null
				: !imageFailed && item.meta.image
					? item.meta.image
					: screenshotFor(item.url);
		body = (
			// biome-ignore lint/a11y/noStaticElementInteractions: mouse tracking only drives the visual tilt
			<span
				ref={(node) => {
					tilt.ref.current = node;
					drop.setNodeRef(node);
				}}
				onMouseMove={tilt.onMouseMove}
				onMouseLeave={tilt.onMouseLeave}
				className={cn(
					"block overflow-hidden rounded-2xl border border-line bg-surface-2 transition group-hover/tile:shadow-xl",
					tilt.className,
					dropRing,
				)}
			>
				<span
					className="relative grid aspect-[16/10] place-items-center overflow-hidden bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
					style={tint}
				>
					{image ? (
						<img
							src={image}
							alt=""
							loading="lazy"
							referrerPolicy="no-referrer"
							draggable={false}
							onError={() => setImageFailed(true)}
							className="size-full object-cover transition duration-500 group-hover/tile:scale-105"
						/>
					) : (
						<span className="grid size-2/3 place-items-center">
							{isFolder ? (
								<FolderMosaic folder={item} />
							) : (
								<Favicon
									url={item.url}
									icon={item.icon}
									favicon={item.meta.favicon}
									title={item.title}
									color={item.color}
									className="size-12 rounded-xl text-4xl"
								/>
							)}
						</span>
					)}
				</span>
				<span className="flex items-center gap-2 p-2.5">
					{smallIcon}
					<span className="min-w-0">
						<span className="block truncate text-sm font-medium">
							{item.title}
						</span>
						<span className="block truncate text-xs text-muted">
							{subtitle}
						</span>
					</span>
				</span>
			</span>
		);
	} else if (style === "card") {
		body = (
			<span
				ref={drop.setNodeRef}
				className={cn(
					"flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3 transition group-hover/tile:-translate-y-0.5 group-hover/tile:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] group-hover/tile:shadow-md",
					dropRing,
				)}
				style={tint}
			>
				{smallIcon}
				<span className="min-w-0">
					<span className="block truncate text-sm font-medium">
						{item.title}
					</span>
					<span className="block truncate text-xs text-muted">{subtitle}</span>
				</span>
			</span>
		);
	} else {
		body = (
			<span
				ref={drop.setNodeRef}
				className={cn(
					"flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition group-hover/tile:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]",
					dropRing,
				)}
				style={tint}
			>
				{smallIcon}
				<span className="truncate text-sm">{item.title}</span>
				<span className="ml-auto hidden truncate pl-2 text-xs text-muted sm:block">
					{isFolder ? subtitle : hostnameOf(item.url)}
				</span>
			</span>
		);
	}

	const link = isFolder ? (
		<button
			type="button"
			onClick={open}
			title={item.title}
			className={cn(
				"focus-ring block w-full rounded-2xl text-left",
				overlay && "pointer-events-none",
			)}
		>
			{body}
		</button>
	) : (
		<a
			href={item.url}
			target={settings.openInNewTab ? "_blank" : undefined}
			rel="noopener noreferrer"
			draggable={false}
			onClick={open}
			onAuxClick={(event) => {
				if (incognito && event.button === 1) {
					event.preventDefault();
					openLink(item);
				}
			}}
			className={cn(
				"focus-ring block rounded-2xl",
				overlay && "pointer-events-none",
			)}
		>
			{body}
		</a>
	);

	return (
		<>
			{isFolder || overlay ? (
				link
			) : (
				<LinkPreview
					bookmark={item}
					enabled={settings.linkPreviews && !editing && !incognito}
				>
					{link}
				</LinkPreview>
			)}
			{incognito && (
				<span
					title="Opens in a private window"
					className="pointer-events-none absolute -top-1.5 -left-1.5 z-10 grid size-6 place-items-center rounded-full border border-line bg-surface-2 text-ink shadow-sm"
				>
					<VenetianMask className="size-3.5" />
				</span>
			)}
			{!overlay && (
				<button
					type="button"
					aria-label={`Edit ${item.title}`}
					onPointerDown={(event) => event.stopPropagation()}
					onClick={() =>
						isFolder
							? openDialog({ type: "folder", folderId: item.id })
							: openDialog({
									type: "bookmark",
									groupId: item.groupId,
									bookmark: item,
								})
					}
					className={cn(
						"absolute -top-1.5 -right-1.5 z-10 grid size-6 place-items-center rounded-full border border-line bg-surface-2 text-muted shadow-sm transition hover:text-ink",
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

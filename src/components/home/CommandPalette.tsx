import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
	Bot,
	ClipboardList,
	Copy,
	Dices,
	FolderOpen,
	FolderPlus,
	Globe,
	HeartPulse,
	History,
	LayoutGrid,
	Lock,
	Monitor,
	Moon,
	Palette,
	Pencil,
	Plus,
	Search,
	SlidersHorizontal,
	Sun,
	Trash2,
	Undo2,
	Upload,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Favicon } from "#/components/ui/Favicon";
import { call, run as runEffect } from "#/lib/api";
import {
	SEARCH_ENGINES,
	THEME_PRESETS,
	type UserSettings,
} from "#/lib/preferences";
import { hostnameOf, normalizeUrl } from "#/lib/url";
import { searchContent } from "#/server/home";
import { useHomeContext } from "./context";
import { type HomeBoard, isLinksGroup, type LinkItem } from "./types";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	board: HomeBoard;
	onSelectBoard: (id: string) => void;
	onToggleEdit: () => void;
	onSaveSettings: (patch: Partial<UserSettings>) => void;
	/** Only passed while the vault is unlocked; the palette never mentions a locked vault. */
	onLockVault?: () => void;
	onUndo: () => void;
};

type Entry = { bookmark: LinkItem; path: string };

function Row({
	icon,
	children,
	hint,
}: {
	icon: ReactNode;
	children: ReactNode;
	hint?: ReactNode;
}) {
	return (
		<>
			<span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] text-muted">
				{icon}
			</span>
			<span className="min-w-0 flex-1 truncate">{children}</span>
			{hint && <span className="ml-2 shrink-0 text-xs text-muted">{hint}</span>}
		</>
	);
}

/** Every typed word must appear; earlier and word-start matches rank higher. */
/** A page-text excerpt with the matched words (wrapped in « ») highlighted. */
function Snippet({ text }: { text: string }) {
	let offset = 0;
	const parts = text.split(/(«[^»]*»)/).map((part) => {
		const at = offset;
		offset += part.length;
		return { part, at };
	});
	return (
		<span className="mt-0.5 line-clamp-2 block text-xs whitespace-normal text-muted">
			{parts.map(({ part, at }) =>
				part.startsWith("«") ? (
					<mark
						key={at}
						className="rounded bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] px-0.5 text-ink"
					>
						{part.slice(1, -1)}
					</mark>
				) : (
					<span key={at}>{part}</span>
				),
			)}
		</span>
	);
}

const filter = (value: string, search: string, keywords?: string[]) => {
	const haystack = `${value} ${keywords?.join(" ") ?? ""}`.toLowerCase();
	const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
	if (!terms.every((term) => haystack.includes(term))) return 0;
	const first = haystack.indexOf(terms[0]);
	const wordStart = first === 0 || /[\s/.:-]/.test(haystack[first - 1] ?? "");
	return (wordStart ? 0.6 : 0.3) + 0.4 / (1 + first / 20);
};

const itemClass =
	"flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm outline-none";

/** ⌘K: fuzzy-jump to any link, folder or board, or run an action. */
export function CommandPalette({
	open,
	onOpenChange,
	board,
	onSelectBoard,
	onToggleEdit,
	onSaveSettings,
	onLockVault,
	onUndo,
}: Props) {
	const { boards, settings, openDialog, openLink, isIncognito } =
		useHomeContext();
	const [query, setQuery] = useState("");
	const newTab = useRef(false);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				onOpenChange(!open);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onOpenChange]);

	useEffect(() => {
		if (!open) setQuery("");
	}, [open]);

	const { links, folders } = useMemo(() => {
		const links: Entry[] = [];
		const folders: { folder: LinkItem; path: string }[] = [];
		for (const b of boards) {
			for (const group of b.groups) {
				for (const item of group.bookmarks) {
					if (item.kind === "folder") {
						folders.push({ folder: item, path: `${b.name} / ${group.name}` });
						for (const child of item.children)
							links.push({
								bookmark: child,
								path: `${b.name} / ${group.name} / ${item.title}`,
							});
					} else
						links.push({ bookmark: item, path: `${b.name} / ${group.name}` });
				}
			}
		}
		links.sort((a, b) => b.bookmark.visitCount - a.bookmark.visitCount);
		return { links, folders };
	}, [boards]);

	// Matches inside saved pages' text, fetched once typing pauses.
	const [textQuery, setTextQuery] = useState("");
	useEffect(() => {
		const timer = setTimeout(() => setTextQuery(query.trim()), 250);
		return () => clearTimeout(timer);
	}, [query]);
	const pageHits = useQuery({
		queryKey: ["search-content", textQuery],
		queryFn: () =>
			runEffect(call(searchContent, { query: textQuery, limit: 12 })),
		enabled: open && textQuery.length >= 3,
		staleTime: 30_000,
		placeholderData: (previous) => previous,
	});
	const textMatches = useMemo(() => {
		if (textQuery.length < 3 || !pageHits.data) return [];
		const byId = new Map(links.map((entry) => [entry.bookmark.id, entry]));
		return pageHits.data.flatMap((hit) => {
			const entry = byId.get(hit.id);
			// Skip links the regular list already shows for this query.
			if (
				!entry ||
				filter(
					`${entry.bookmark.title} ${entry.bookmark.url} ${entry.path}`,
					textQuery,
					entry.bookmark.tags,
				) > 0
			)
				return [];
			return [{ ...entry, snippet: hit.snippet }];
		});
	}, [pageHits.data, links, textQuery]);

	if (!open || typeof document === "undefined") return null;

	const close = () => onOpenChange(false);
	const run = (action: () => void) => {
		close();
		action();
	};
	const openUrl = (url: string, forceNewTab = false) => {
		if (forceNewTab || newTab.current || settings.openInNewTab)
			window.open(url, "_blank", "noopener");
		else window.location.assign(url);
	};
	const visit = (bookmark: LinkItem) =>
		run(() => openLink(bookmark, { newTab: newTab.current }));
	const firstGroup = board.groups.find(isLinksGroup)?.id;
	const trimmed = query.trim();
	const typedUrl =
		trimmed && !/\s/.test(trimmed) && trimmed.includes(".")
			? normalizeUrl(trimmed)
			: null;
	const engine = SEARCH_ENGINES[settings.searchEngine];

	return createPortal(
		<div className="fixed inset-0 z-[70] flex items-start justify-center p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-4 sm:pt-[12vh]">
			<button
				type="button"
				aria-label="Close"
				className="absolute inset-0 bg-black/30 backdrop-blur-[3px]"
				onClick={close}
			/>
			<Command
				label="Command palette"
				loop
				filter={filter}
				className="animate-pop relative w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-surface-2 shadow-2xl backdrop-blur-xl"
				onKeyDown={(event) => {
					newTab.current = event.metaKey || event.ctrlKey;
					if (event.key === "Escape") close();
				}}
			>
				<div className="flex items-center gap-3 border-b border-line px-4">
					<Search className="size-4 shrink-0 text-muted" />
					<Command.Input
						autoFocus
						value={query}
						onValueChange={setQuery}
						placeholder="Search links, folders, boards, actions…"
						className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted"
					/>
					<kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted sm:block">
						esc
					</kbd>
					<button
						type="button"
						onClick={close}
						className="shrink-0 text-sm font-medium text-accent sm:hidden"
					>
						Cancel
					</button>
				</div>
				<Command.List className="max-h-[48dvh] overflow-y-auto overscroll-contain p-2 [scrollbar-width:thin] sm:max-h-[55vh]">
					{!(trimmed.length >= 3 && textMatches.length > 0) && (
						<Command.Empty className="px-3 py-8 text-center text-sm text-muted">
							Nothing matches. Press ↵ to search the web.
						</Command.Empty>
					)}

					{trimmed && (
						<Command.Group heading="Web" forceMount>
							{typedUrl && (
								<Command.Item
									forceMount
									value={`go ${typedUrl}`}
									onSelect={() => run(() => openUrl(typedUrl))}
									className={itemClass}
								>
									<Row icon={<Globe className="size-4" />}>
										Go to {hostnameOf(typedUrl)}
									</Row>
								</Command.Item>
							)}
							<Command.Item
								forceMount
								value={`web-search ${trimmed}`}
								onSelect={() =>
									run(() => openUrl(engine.url + encodeURIComponent(trimmed)))
								}
								className={itemClass}
							>
								<Row icon={<Search className="size-4" />} hint={engine.label}>
									Search for “{trimmed}”
								</Row>
							</Command.Item>
							{typedUrl && (
								<Command.Item
									forceMount
									value={`save ${typedUrl}`}
									onSelect={() =>
										run(
											() =>
												firstGroup &&
												openDialog({
													type: "bookmark",
													groupId: firstGroup,
													url: typedUrl,
												}),
										)
									}
									className={itemClass}
								>
									<Row icon={<Plus className="size-4" />}>
										Save {hostnameOf(typedUrl)} to tabz
									</Row>
								</Command.Item>
							)}
						</Command.Group>
					)}

					<Command.Group heading="Links">
						{links
							.slice(0, trimmed ? links.length : 8)
							.map(({ bookmark, path }) => (
								<Command.Item
									key={bookmark.id}
									value={`${bookmark.title} ${bookmark.url} ${path} ${bookmark.id}`}
									keywords={bookmark.tags}
									onSelect={() => visit(bookmark)}
									className={itemClass}
								>
									<Row
										icon={
											<Favicon
												url={bookmark.url}
												icon={bookmark.icon}
												favicon={bookmark.meta.favicon}
												title={bookmark.title}
												className="size-4 rounded text-sm"
											/>
										}
										hint={
											isIncognito(bookmark)
												? "🕶️ private"
												: hostnameOf(bookmark.url)
										}
									>
										<span className="font-medium">{bookmark.title}</span>
										<span className="ml-2 text-xs text-muted">{path}</span>
									</Row>
								</Command.Item>
							))}
					</Command.Group>

					{trimmed.length >= 3 && textMatches.length > 0 && (
						<Command.Group heading="Found in page text" forceMount>
							{textMatches.map(({ bookmark, path, snippet }) => (
								<Command.Item
									key={bookmark.id}
									value={`${trimmed} page-text ${bookmark.id}`}
									onSelect={() => visit(bookmark)}
									className={itemClass}
								>
									<Row
										icon={
											<Favicon
												url={bookmark.url}
												icon={bookmark.icon}
												favicon={bookmark.meta.favicon}
												title={bookmark.title}
												className="size-4 rounded text-sm"
											/>
										}
										hint={hostnameOf(bookmark.url)}
									>
										<span className="font-medium">{bookmark.title}</span>
										<span className="ml-2 text-xs text-muted">{path}</span>
										<Snippet text={snippet} />
									</Row>
								</Command.Item>
							))}
						</Command.Group>
					)}

					{folders.length > 0 && (
						<Command.Group heading="Folders">
							{folders.map(({ folder, path }) => (
								<Command.Item
									key={folder.id}
									value={`folder ${folder.title} ${path}`}
									onSelect={() =>
										run(() =>
											openDialog({ type: "folder", folderId: folder.id }),
										)
									}
									className={itemClass}
								>
									<Row
										icon={
											folder.icon ? (
												<span>{folder.icon}</span>
											) : (
												<FolderOpen className="size-4" />
											)
										}
										hint={path}
									>
										{folder.title}
									</Row>
								</Command.Item>
							))}
						</Command.Group>
					)}

					<Command.Group heading="Boards">
						{boards.map((b, index) => (
							<Command.Item
								key={b.id}
								value={`board ${b.name}`}
								onSelect={() => run(() => onSelectBoard(b.id))}
								className={itemClass}
							>
								<Row
									icon={
										b.icon ? (
											<span>{b.icon}</span>
										) : (
											<LayoutGrid className="size-4" />
										)
									}
									hint={index < 9 ? `${index + 1}` : undefined}
								>
									Go to {b.name}
								</Row>
							</Command.Item>
						))}
					</Command.Group>

					<Command.Group heading="Actions">
						{onLockVault && (
							<Command.Item
								value="lock vault"
								onSelect={() => run(onLockVault)}
								className={itemClass}
							>
								<Row icon={<Lock className="size-4" />}>Lock vault</Row>
							</Command.Item>
						)}
						{firstGroup && (
							<Command.Item
								value="add new bookmark"
								onSelect={() =>
									run(() =>
										openDialog({ type: "bookmark", groupId: firstGroup }),
									)
								}
								className={itemClass}
							>
								<Row icon={<Plus className="size-4" />} hint="N">
									Add bookmark
								</Row>
							</Command.Item>
						)}
						{firstGroup && (
							<Command.Item
								value="new folder"
								onSelect={() =>
									run(() =>
										openDialog({ type: "new-folder", groupId: firstGroup }),
									)
								}
								className={itemClass}
							>
								<Row icon={<FolderPlus className="size-4" />}>New folder</Row>
							</Command.Item>
						)}
						<Command.Item
							value="paste many links bulk add"
							onSelect={() => run(() => openDialog({ type: "bulk-add" }))}
							className={itemClass}
						>
							<Row icon={<ClipboardList className="size-4" />}>
								Paste many links
							</Row>
						</Command.Item>
						<Command.Item
							value="undo last change"
							onSelect={() => run(() => onUndo())}
							className={itemClass}
						>
							<Row icon={<Undo2 className="size-4" />} hint="⌘Z">
								Undo
							</Row>
						</Command.Item>
						<Command.Item
							value="history activity changes"
							onSelect={() => run(() => openDialog({ type: "history" }))}
							className={itemClass}
						>
							<Row icon={<History className="size-4" />}>History</Row>
						</Command.Item>
						<Command.Item
							value="trash deleted restore"
							onSelect={() =>
								run(() => openDialog({ type: "history", tab: "trash" }))
							}
							className={itemClass}
						>
							<Row icon={<Trash2 className="size-4" />}>Trash</Row>
						</Command.Item>
						<Command.Item
							value="find duplicates cleanup"
							onSelect={() => run(() => openDialog({ type: "duplicates" }))}
							className={itemClass}
						>
							<Row icon={<Copy className="size-4" />}>Find duplicates</Row>
						</Command.Item>
						<Command.Item
							value="broken links dead link health check"
							onSelect={() => run(() => openDialog({ type: "link-health" }))}
							className={itemClass}
						>
							<Row icon={<HeartPulse className="size-4" />}>
								Find broken links
							</Row>
						</Command.Item>
						<Command.Item
							value="new group section"
							onSelect={() =>
								run(() => openDialog({ type: "group", boardId: board.id }))
							}
							className={itemClass}
						>
							<Row icon={<LayoutGrid className="size-4" />}>New group</Row>
						</Command.Item>
						<Command.Item
							value="new board page tab"
							onSelect={() => run(() => openDialog({ type: "board" }))}
							className={itemClass}
						>
							<Row icon={<LayoutGrid className="size-4" />}>New board</Row>
						</Command.Item>
						<Command.Item
							value="edit layout rearrange"
							onSelect={() => run(onToggleEdit)}
							className={itemClass}
						>
							<Row icon={<Pencil className="size-4" />} hint="E">
								Toggle edit mode
							</Row>
						</Command.Item>
						<Command.Item
							value="surprise me random"
							onSelect={() => {
								const pick = links[Math.floor(Math.random() * links.length)];
								if (pick) visit(pick.bookmark);
							}}
							className={itemClass}
						>
							<Row icon={<Dices className="size-4" />}>Surprise me</Row>
						</Command.Item>
						<Command.Item
							value="shuffle theme random look"
							onSelect={() => {
								const others = THEME_PRESETS.filter(
									(p) => p.settings.accent !== settings.accent,
								);
								const preset =
									others[Math.floor(Math.random() * others.length)];
								onSaveSettings(preset.settings);
							}}
							className={itemClass}
						>
							<Row icon={<Palette className="size-4" />}>Shuffle theme</Row>
						</Command.Item>
						{THEME_PRESETS.map((preset) => (
							<Command.Item
								key={preset.id}
								value={`theme look ${preset.label}`}
								onSelect={() => run(() => onSaveSettings(preset.settings))}
								className={itemClass}
							>
								<Row icon={<span>{preset.emoji}</span>}>
									Theme: {preset.label}
								</Row>
							</Command.Item>
						))}
						<Command.Item
							value="light mode"
							onSelect={() => run(() => onSaveSettings({ theme: "light" }))}
							className={itemClass}
						>
							<Row icon={<Sun className="size-4" />}>Light mode</Row>
						</Command.Item>
						<Command.Item
							value="dark mode"
							onSelect={() => run(() => onSaveSettings({ theme: "dark" }))}
							className={itemClass}
						>
							<Row icon={<Moon className="size-4" />}>Dark mode</Row>
						</Command.Item>
						<Command.Item
							value="system mode auto"
							onSelect={() => run(() => onSaveSettings({ theme: "system" }))}
							className={itemClass}
						>
							<Row icon={<Monitor className="size-4" />}>
								Match system theme
							</Row>
						</Command.Item>
						<Command.Item
							value="customize settings appearance"
							onSelect={() => run(() => openDialog({ type: "settings" }))}
							className={itemClass}
						>
							<Row icon={<SlidersHorizontal className="size-4" />}>
								Customize
							</Row>
						</Command.Item>
						<Command.Item
							value="import bookmarks chrome export"
							onSelect={() =>
								run(() => openDialog({ type: "settings", tab: "data" }))
							}
							className={itemClass}
						>
							<Row icon={<Upload className="size-4" />}>Import bookmarks</Row>
						</Command.Item>
						<Command.Item
							value="connect ai mcp claude cursor"
							onSelect={() =>
								run(() => openDialog({ type: "settings", tab: "connect" }))
							}
							className={itemClass}
						>
							<Row icon={<Bot className="size-4" />}>
								Connect an AI assistant
							</Row>
						</Command.Item>
					</Command.Group>
				</Command.List>
				<div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-muted sm:flex">
					<span>↵ open</span>
					<span>⌘↵ new tab</span>
					<span>↑↓ navigate</span>
					<span className="ml-auto">tabz</span>
				</div>
			</Command>
		</div>,
		document.body,
	);
}

import { Effect } from "effect";
import { Check, Command, Pencil, Plus, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "#/components/Logo";
import { call } from "#/lib/api";
import { applyAppearance } from "#/lib/appearance";
import { cn } from "#/lib/cn";
import { useHome, useSaveSettings } from "#/lib/home-query";
import { applyTheme } from "#/lib/theme";
import { recordVisit } from "#/server/home";
import type { SessionInfo } from "#/server/session";
import { Backdrop } from "./Backdrop";
import { BoardDialog } from "./BoardDialog";
import { BoardGrid } from "./BoardGrid";
import { BookmarkDialog } from "./BookmarkDialog";
import { Clock } from "./Clock";
import { CommandPalette } from "./CommandPalette";
import { HomeContext } from "./context";
import { FolderDialog, NewFolderDialog } from "./FolderDialog";
import { GroupDialog } from "./GroupDialog";
import { SearchBar } from "./SearchBar";
import { SettingsPanel } from "./SettingsPanel";
import { TopSites } from "./TopSites";
import type { DialogState, LinkItem } from "./types";

const widths = {
	narrow: "max-w-4xl",
	wide: "max-w-7xl",
	full: "max-w-none",
} as const;

export function HomeScreen({ session }: { session: SessionInfo }) {
	const data = useHome();
	const { settings, boards } = data;
	const board =
		boards.find((b) => b.id === settings.activeBoardId) ?? boards[0];
	const [editing, setEditing] = useState(false);
	const [dialog, setDialog] = useState<DialogState>(null);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const saveSettings = useSaveSettings();

	useEffect(() => {
		applyTheme(settings.theme);
		if (settings.theme !== "system") return;
		const media = matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system");
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [settings.theme]);

	useEffect(() => applyAppearance(settings), [settings]);

	const selectBoard = useCallback(
		(id: string) => {
			if (id !== board?.id) saveSettings.mutate({ activeBoardId: id });
		},
		[board?.id, saveSettings],
	);

	// Keyboard: e = edit mode, n = new bookmark, 1–9 = switch board (⌘K lives in the palette).
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			if (
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				dialog ||
				paletteOpen
			)
				return;
			if (
				target.isContentEditable ||
				["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
			)
				return;
			if (event.key === "e") setEditing((value) => !value);
			else if (event.key === "n" && board?.groups[0]) {
				event.preventDefault();
				setDialog({ type: "bookmark", groupId: board.groups[0].id });
			} else if (/^[1-9]$/.test(event.key)) {
				const next = boards[Number(event.key) - 1];
				if (next) selectBoard(next.id);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [board, boards, dialog, paletteOpen, selectBoard]);

	const links = useMemo(
		() =>
			boards.flatMap((b) =>
				b.groups.flatMap((group) =>
					group.bookmarks.flatMap((item) =>
						item.kind === "folder"
							? item.children.map((bookmark) => ({
									bookmark,
									group: `${group.name} / ${item.title}`,
								}))
							: [{ bookmark: item as LinkItem, group: group.name }],
					),
				),
			),
		[boards],
	);

	const onVisit = useCallback((bookmark: LinkItem) => {
		// Fire-and-forget; visit counts power search ranking and the most-visited strip.
		Effect.runFork(call(recordVisit, { id: bookmark.id }).pipe(Effect.ignore));
	}, []);

	const context = useMemo(
		() => ({ settings, boards, editing, openDialog: setDialog, onVisit }),
		[settings, boards, editing, onVisit],
	);

	if (!board) return null;
	const close = () => setDialog(null);

	return (
		<HomeContext.Provider value={context}>
			<div className="relative min-h-dvh">
				<Backdrop background={settings.background} />

				<header className="sticky top-0 z-30">
					<div
						className={cn(
							"mx-auto flex items-center gap-2 px-4 py-3 sm:px-6",
							widths[board.layout.width],
						)}
					>
						<Logo className="mr-2 hidden text-base sm:inline-flex" />
						<nav className="glass flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-2xl p-1 [scrollbar-width:none]">
							{boards.map((b) => (
								<button
									key={b.id}
									type="button"
									onClick={() => selectBoard(b.id)}
									onDoubleClick={() => setDialog({ type: "board", board: b })}
									className={cn(
										"focus-ring flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm transition",
										b.id === board.id
											? "bg-surface-2 font-medium text-ink shadow-sm"
											: "text-muted hover:text-ink",
									)}
								>
									{b.icon && <span>{b.icon}</span>}
									{b.name}
									{editing && b.id === board.id && (
										<Pencil
											className="size-3 text-muted"
											onClick={(event) => {
												event.stopPropagation();
												setDialog({ type: "board", board: b });
											}}
										/>
									)}
								</button>
							))}
							<button
								type="button"
								className="icon-btn size-8"
								aria-label="New board"
								onClick={() => setDialog({ type: "board" })}
							>
								<Plus className="size-4" />
							</button>
						</nav>
						<div className="ml-auto flex items-center gap-1">
							<button
								type="button"
								onClick={() => setPaletteOpen(true)}
								className="glass focus-ring hidden items-center gap-2 rounded-xl py-1.5 pr-1.5 pl-3 text-sm text-muted transition hover:text-ink md:flex"
							>
								Jump to…
								<kbd className="flex items-center gap-0.5 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">
									<Command className="size-3" />K
								</kbd>
							</button>
							<button
								type="button"
								className={cn(
									"btn-ghost",
									editing && "bg-accent text-white hover:bg-accent",
								)}
								onClick={() => setEditing((value) => !value)}
								title="Edit layout (E)"
							>
								{editing ? (
									<Check className="size-4" />
								) : (
									<Pencil className="size-4" />
								)}
								<span className="hidden sm:inline">
									{editing ? "Done" : "Edit"}
								</span>
							</button>
							<button
								type="button"
								className="icon-btn"
								aria-label="Add bookmark"
								title="Add bookmark (N)"
								disabled={!board.groups[0]}
								onClick={() =>
									board.groups[0] &&
									setDialog({ type: "bookmark", groupId: board.groups[0].id })
								}
							>
								<Plus className="size-5" />
							</button>
							<button
								type="button"
								className="icon-btn"
								aria-label="Customize"
								title="Customize"
								onClick={() => setDialog({ type: "settings" })}
							>
								<SlidersHorizontal className="size-4" />
							</button>
						</div>
					</div>
				</header>

				<main
					className={cn(
						"relative mx-auto px-4 pb-24 sm:px-6",
						widths[board.layout.width],
					)}
				>
					<div className="flex flex-col gap-6 pt-6 pb-10 sm:pt-10">
						<Clock
							name={settings.greetingName || session.name}
							showClock={settings.showClock}
							showGreeting={settings.showGreeting}
							format={settings.clockFormat}
						/>
						{settings.showSearch && (
							<SearchBar
								bookmarks={links}
								engine={settings.searchEngine}
								openInNewTab={settings.openInNewTab}
								onVisit={onVisit}
							/>
						)}
						<TopSites links={links.map((entry) => entry.bookmark)} />
					</div>
					<BoardGrid board={board} />
				</main>

				<CommandPalette
					open={paletteOpen}
					onOpenChange={setPaletteOpen}
					board={board}
					onSelectBoard={selectBoard}
					onToggleEdit={() => setEditing((value) => !value)}
					onSaveSettings={(patch) => saveSettings.mutate(patch)}
				/>

				{dialog?.type === "bookmark" && (
					<BookmarkDialog
						boards={boards}
						groupId={dialog.groupId}
						bookmark={dialog.bookmark}
						parentId={dialog.parentId}
						initialUrl={dialog.url}
						festive={settings.celebrate}
						onClose={close}
					/>
				)}
				{dialog?.type === "folder" && (
					<FolderDialog folderId={dialog.folderId} onClose={close} />
				)}
				{dialog?.type === "new-folder" && (
					<NewFolderDialog groupId={dialog.groupId} onClose={close} />
				)}
				{dialog?.type === "group" && (
					<GroupDialog
						boards={boards}
						boardId={dialog.boardId}
						group={dialog.group}
						onClose={close}
					/>
				)}
				{dialog?.type === "board" && (
					<BoardDialog
						board={dialog.board}
						canDelete={boards.length > 1}
						onClose={close}
					/>
				)}
				{dialog?.type === "settings" && (
					<SettingsPanel
						settings={settings}
						board={board}
						boards={boards}
						session={session}
						initialTab={dialog.tab}
						onClose={close}
					/>
				)}
			</div>
		</HomeContext.Provider>
	);
}

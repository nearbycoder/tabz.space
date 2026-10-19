import { Effect } from "effect";
import { Check, Pencil, Plus, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "#/components/Logo";
import { call } from "#/lib/api";
import { cn } from "#/lib/cn";
import { useHome, useSaveSettings } from "#/lib/home-query";
import { BACKGROUNDS } from "#/lib/preferences";
import { applyTheme } from "#/lib/theme";
import { recordVisit } from "#/server/home";
import type { SessionInfo } from "#/server/session";
import { BoardDialog } from "./BoardDialog";
import { BoardGrid } from "./BoardGrid";
import { BookmarkDialog } from "./BookmarkDialog";
import { Clock } from "./Clock";
import { GroupDialog } from "./GroupDialog";
import { SearchBar } from "./SearchBar";
import { SettingsPanel } from "./SettingsPanel";
import type { DialogState, HomeBookmark } from "./types";

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
	const saveSettings = useSaveSettings();

	useEffect(() => {
		applyTheme(settings.theme);
		if (settings.theme !== "system") return;
		const media = matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system");
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [settings.theme]);

	useEffect(() => {
		document.documentElement.style.setProperty("--accent", settings.accent);
	}, [settings.accent]);

	const selectBoard = useCallback(
		(id: string) => {
			if (id !== board?.id) saveSettings.mutate({ activeBoardId: id });
		},
		[board?.id, saveSettings],
	);

	// Keyboard: e = edit mode, n = new bookmark, 1–9 = switch board.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			if (event.metaKey || event.ctrlKey || event.altKey || dialog) return;
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
	}, [board, boards, dialog, selectBoard]);

	const searchable = useMemo(
		() =>
			boards.flatMap((b) =>
				b.groups.flatMap((group) =>
					group.bookmarks.map((bookmark) => ({ bookmark, group: group.name })),
				),
			),
		[boards],
	);

	const onVisit = useCallback((bookmark: HomeBookmark) => {
		// Fire-and-forget; visit counts only influence search ranking.
		Effect.runFork(call(recordVisit, { id: bookmark.id }).pipe(Effect.ignore));
	}, []);

	if (!board) return null;

	const background =
		settings.background.type === "image"
			? {
					backgroundImage: `url("${settings.background.value.replace(/"/g, "")}")`,
					backgroundSize: "cover",
					backgroundPosition: "center",
				}
			: {
					background:
						BACKGROUNDS[
							settings.background.value as keyof typeof BACKGROUNDS
						] ?? BACKGROUNDS.aurora,
				};

	return (
		<div className="relative min-h-dvh">
			<div
				aria-hidden
				className="pointer-events-none fixed inset-0"
				style={background}
			/>
			{settings.background.type === "image" && (
				<div
					aria-hidden
					className="pointer-events-none fixed inset-0 bg-[var(--canvas)]/40"
				/>
			)}

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
				<div className="flex flex-col gap-8 pt-6 pb-10 sm:pt-10">
					<Clock
						name={session.name}
						showClock={settings.showClock}
						showGreeting={settings.showGreeting}
						format={settings.clockFormat}
					/>
					{settings.showSearch && (
						<SearchBar
							bookmarks={searchable}
							engine={settings.searchEngine}
							openInNewTab={settings.openInNewTab}
							onVisit={onVisit}
						/>
					)}
				</div>
				<BoardGrid
					board={board}
					editing={editing}
					openInNewTab={settings.openInNewTab}
					openDialog={setDialog}
					onVisit={onVisit}
				/>
			</main>

			{dialog?.type === "bookmark" && (
				<BookmarkDialog
					boards={boards}
					groupId={dialog.groupId}
					bookmark={dialog.bookmark}
					onClose={() => setDialog(null)}
				/>
			)}
			{dialog?.type === "group" && (
				<GroupDialog
					boards={boards}
					boardId={dialog.boardId}
					group={dialog.group}
					onClose={() => setDialog(null)}
				/>
			)}
			{dialog?.type === "board" && (
				<BoardDialog
					board={dialog.board}
					canDelete={boards.length > 1}
					onClose={() => setDialog(null)}
				/>
			)}
			{dialog?.type === "settings" && (
				<SettingsPanel
					settings={settings}
					board={board}
					boards={boards}
					session={session}
					onClose={() => setDialog(null)}
				/>
			)}
		</div>
	);
}

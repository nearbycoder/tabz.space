import { Effect } from "effect";
import {
	Check,
	Command,
	Lock,
	Moon,
	Pencil,
	Plus,
	Search,
	SlidersHorizontal,
	Sun,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "#/components/Logo";
import { call } from "#/lib/api";
import { applyAppearance } from "#/lib/appearance";
import { cn } from "#/lib/cn";
import { useHome, useSaveSettings } from "#/lib/home-query";
import { openIncognito } from "#/lib/incognito";
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
import type { DialogState, HomeBoard, LinkItem } from "./types";
import { useLockVault, VaultUnlockDialog } from "./Vault";

/** Thumb-reach actions for phones; the header holds these on larger screens. */
function MobileDock(props: {
	editing: boolean;
	vaultUnlocked: boolean;
	onSearch: () => void;
	onAdd: () => void;
	onEdit: () => void;
	onCustomize: () => void;
	onLock: () => void;
	dark: boolean;
	onToggleTheme: () => void;
}) {
	const item =
		"focus-ring grid size-12 place-items-center rounded-2xl text-muted transition active:scale-90 active:text-ink";
	return (
		<nav
			aria-label="Quick actions"
			className="glass fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-sm items-center justify-around rounded-3xl p-1.5 shadow-2xl shadow-black/20 sm:hidden"
		>
			<button
				type="button"
				className={item}
				aria-label="Search"
				onClick={props.onSearch}
			>
				<Search className="size-5" />
			</button>
			<button
				type="button"
				className={cn(item, props.editing && "bg-accent text-white")}
				aria-label={props.editing ? "Done editing" : "Edit layout"}
				onClick={props.onEdit}
			>
				{props.editing ? (
					<Check className="size-5" />
				) : (
					<Pencil className="size-5" />
				)}
			</button>
			<button
				type="button"
				className="focus-ring grid size-14 place-items-center rounded-2xl bg-accent text-white shadow-lg transition active:scale-90"
				aria-label="Add bookmark"
				onClick={props.onAdd}
			>
				<Plus className="size-6" />
			</button>
			{props.vaultUnlocked ? (
				<button
					type="button"
					className={cn(item, "text-accent")}
					aria-label="Lock vault"
					onClick={props.onLock}
				>
					<Lock className="size-5" />
				</button>
			) : (
				<button
					type="button"
					className={item}
					aria-label={props.dark ? "Light mode" : "Dark mode"}
					onClick={props.onToggleTheme}
				>
					{props.dark ? (
						<Sun className="size-5" />
					) : (
						<Moon className="size-5" />
					)}
				</button>
			)}
			<button
				type="button"
				className={item}
				aria-label="Customize"
				onClick={props.onCustomize}
			>
				<SlidersHorizontal className="size-5" />
			</button>
		</nav>
	);
}

const widths = {
	narrow: "max-w-4xl",
	wide: "max-w-7xl",
	full: "max-w-none",
} as const;

export function HomeScreen({ session }: { session: SessionInfo }) {
	const data = useHome();
	const { settings, boards, vault } = data;
	const board =
		boards.find((b) => b.id === settings.activeBoardId) ?? boards[0];
	const [editing, setEditing] = useState(false);
	const [dialog, setDialog] = useState<DialogState>(null);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const saveSettings = useSaveSettings();
	const lockVault = useLockVault();
	const typed = useRef("");
	const [now, setNow] = useState(() => Date.now());

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

	/** Secret entrance: the typed code (desktop) or 5 quick taps on the clock (phones). */
	const openVault = useCallback(() => {
		if (!vault.configured) return;
		const firstVaultBoard = boards.find((b) => b.vault);
		if (vault.unlocked && firstVaultBoard) selectBoard(firstVaultBoard.id);
		else setDialog({ type: "vault-unlock" });
	}, [boards, selectBoard, vault.configured, vault.unlocked]);

	const taps = useRef<number[]>([]);
	const onClockTap = () => {
		const now = Date.now();
		taps.current = [...taps.current.filter((t) => now - t < 2000), now];
		if (taps.current.length >= 5) {
			taps.current = [];
			openVault();
		}
	};

	// Keyboard: e = edit mode, n = new bookmark, 1–9 = switch board (⌘K lives in the palette).
	// Typing the secret vault code anywhere opens the vault prompt.
	useEffect(() => {
		const code = settings.vaultCode.toLowerCase();
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
			if (event.key.length === 1) {
				typed.current = (typed.current + event.key.toLowerCase()).slice(-24);
				if (vault.configured && typed.current.endsWith(code)) {
					typed.current = "";
					event.preventDefault();
					openVault();
					return;
				}
				// Mid-code keystrokes shouldn't trigger single-key shortcuts.
				const midCode = [...Array(code.length).keys()].some(
					(i) => i >= 1 && typed.current.endsWith(code.slice(0, i + 1)),
				);
				if (vault.configured && midCode) return;
			}
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
	}, [
		board,
		boards,
		dialog,
		paletteOpen,
		selectBoard,
		settings.vaultCode,
		vault.configured,
		openVault,
	]);

	// Auto-lock: the cookie expires server-side; drop the boards client-side at the same moment.
	useEffect(() => {
		if (!vault.unlocked || !vault.expiresAt) return;
		setNow(Date.now());
		const tick = setInterval(() => setNow(Date.now()), 30_000);
		const timer = setTimeout(
			() => lockVault(),
			Math.max(0, vault.expiresAt - Date.now()),
		);
		return () => {
			clearInterval(tick);
			clearTimeout(timer);
		};
	}, [vault.unlocked, vault.expiresAt, lockVault]);

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

	const incognitoFolders = useMemo(
		() =>
			new Set(
				boards
					.flatMap((b) => b.groups)
					.flatMap((g) => g.bookmarks)
					.filter((item) => item.kind === "folder" && item.incognito)
					.map((item) => item.id),
			),
		[boards],
	);

	const isIncognito = useCallback(
		(bookmark: LinkItem) =>
			settings.incognitoAll ||
			bookmark.incognito ||
			(bookmark.parentId !== null && incognitoFolders.has(bookmark.parentId)),
		[settings.incognitoAll, incognitoFolders],
	);

	const openLink = useCallback(
		(bookmark: LinkItem, options?: { newTab?: boolean }) => {
			// Private links skip visit tracking so they never surface in "most visited".
			if (isIncognito(bookmark)) {
				openIncognito([bookmark.url]);
				return;
			}
			onVisit(bookmark);
			if (options?.newTab || settings.openInNewTab)
				window.open(bookmark.url, "_blank", "noopener");
			else window.location.assign(bookmark.url);
		},
		[isIncognito, onVisit, settings.openInNewTab],
	);

	const context = useMemo(
		() => ({
			settings,
			boards,
			editing,
			openDialog: setDialog,
			onVisit,
			isIncognito,
			openLink,
		}),
		[settings, boards, editing, onVisit, isIncognito, openLink],
	);

	if (!board) return null;
	const close = () => setDialog(null);
	const isDark =
		settings.theme === "dark" ||
		(settings.theme === "system" &&
			typeof window !== "undefined" &&
			matchMedia("(prefers-color-scheme: dark)").matches);

	return (
		<HomeContext.Provider value={context}>
			<div className="relative min-h-dvh">
				<Backdrop background={settings.background} />

				<header className="sticky top-0 z-30 bg-[color-mix(in_srgb,var(--canvas)_60%,transparent)] pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:bg-transparent sm:backdrop-blur-none">
					<div
						className={cn(
							"mx-auto flex items-center gap-2 px-4 py-3 sm:px-6",
							widths[board.layout.width],
						)}
					>
						<Logo className="mr-2 hidden text-base sm:inline-flex" />
						<nav className="glass flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-2xl p-1 [scrollbar-width:none]">
							{[
								...boards.filter((b) => !b.vault),
								...boards.filter((b) => b.vault),
							].map((b: HomeBoard, index, list) => (
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
										b.vault &&
											"border border-dashed border-[color-mix(in_srgb,var(--accent)_45%,transparent)]",
										b.vault && !list[index - 1]?.vault && "ml-2",
									)}
								>
									{b.vault && <Lock className="size-3 text-accent" />}
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
						<div className="ml-auto hidden items-center gap-1 sm:flex">
							{vault.unlocked && (
								<button
									type="button"
									onClick={() => lockVault()}
									title="Lock vault"
									aria-label="Lock vault"
									className="btn-ghost text-accent"
								>
									<Lock className="size-4" />
									<span className="hidden text-xs tabular-nums sm:inline">
										{vault.expiresAt
											? `${Math.max(1, Math.ceil((vault.expiresAt - now) / 60_000))}m`
											: "Lock"}
									</span>
								</button>
							)}
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
						"relative mx-auto px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-24",
						widths[board.layout.width],
					)}
				>
					<div className="flex flex-col gap-6 pt-6 pb-10 sm:pt-10">
						{/* biome-ignore lint/a11y/noStaticElementInteractions: hidden vault gesture, intentionally undiscoverable */}
						{/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users open the vault by typing the code */}
						<div onClick={onClockTap} className="select-none">
							<Clock
								name={settings.greetingName || session.name}
								showClock={settings.showClock}
								showGreeting={settings.showGreeting}
								format={settings.clockFormat}
							/>
						</div>
						{settings.showSearch && (
							<SearchBar
								bookmarks={links}
								engine={settings.searchEngine}
								openInNewTab={settings.openInNewTab}
							/>
						)}
						<TopSites links={links.map((entry) => entry.bookmark)} />
					</div>
					<BoardGrid board={board} />
				</main>

				<MobileDock
					editing={editing}
					vaultUnlocked={vault.unlocked}
					onSearch={() => setPaletteOpen(true)}
					onAdd={() =>
						board.groups[0] &&
						setDialog({ type: "bookmark", groupId: board.groups[0].id })
					}
					onEdit={() => setEditing((value) => !value)}
					onCustomize={() => setDialog({ type: "settings" })}
					onLock={() => lockVault()}
					dark={isDark}
					onToggleTheme={() =>
						saveSettings.mutate({ theme: isDark ? "light" : "dark" })
					}
				/>

				<CommandPalette
					open={paletteOpen}
					onOpenChange={setPaletteOpen}
					board={board}
					onSelectBoard={selectBoard}
					onToggleEdit={() => setEditing((value) => !value)}
					onSaveSettings={(patch) => saveSettings.mutate(patch)}
					onLockVault={vault.unlocked ? () => lockVault() : undefined}
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
						canDelete={
							Boolean(dialog.board?.vault) ||
							boards.filter((b) => !b.vault).length > 1
						}
						vaultUnlocked={vault.unlocked}
						onClose={close}
					/>
				)}
				{dialog?.type === "vault-unlock" && (
					<VaultUnlockDialog
						onClose={close}
						onUnlocked={(boardId) => {
							close();
							saveSettings.mutate({ activeBoardId: boardId });
						}}
					/>
				)}
				{dialog?.type === "settings" && (
					<SettingsPanel
						settings={settings}
						vault={vault}
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

import { useQueryClient } from "@tanstack/react-query";
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
	Users,
} from "lucide-react";
import {
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Logo } from "#/components/Logo";
import { call, run } from "#/lib/api";
import { applyAppearance } from "#/lib/appearance";
import { cn } from "#/lib/cn";
import { homeKey, useHome, useSaveSettings, useUndo } from "#/lib/home-query";
import {
	connectExtension,
	openIncognito,
	openTabs,
	shareLookWithExtension,
} from "#/lib/incognito";
import { lazyNamed, whenIdle } from "#/lib/lazy";
import { showLeaving } from "#/lib/leaving";
import { BACKGROUNDS, type GradientKey } from "#/lib/preferences";
import { scheduledBoardId } from "#/lib/schedule";
import { applyTheme } from "#/lib/theme";
import { extractUrls } from "#/lib/url";
import { useVisibleArea } from "#/lib/use-keyboard-inset";
import { useLockVault } from "#/lib/vault-lock";
import {
	resumeVault,
	startVaultSync,
	useDecryptedHome,
	useVaultKeyReady,
} from "#/lib/vault-session";
import type { HomeData } from "#/server/home";
import { recordVisit } from "#/server/home";
import type { SessionInfo } from "#/server/session";
import { Backdrop } from "./Backdrop";
import { BoardGrid } from "./BoardGrid";
import { Clock } from "./Clock";
import { HomeContext } from "./context";
import { ReportBanner } from "./MonthlyReport";
import { Rediscover } from "./Rediscover";
import { SearchBar } from "./SearchBar";
import { TopSites } from "./TopSites";
import {
	type DialogState,
	findInTree,
	type HomeBoard,
	type HomeGroup,
	isLinksGroup,
	type LinkItem,
	linksIn,
	mapTree,
	type TreeItem,
	targetUrl,
} from "./types";

/** Thumb-reach actions for phones; the header holds these on larger screens. */
// Dialogs load on first use (and are prefetched when the browser is idle),
// keeping the first page load small.
const BookmarkDialog = lazyNamed(
	() => import("./BookmarkDialog"),
	"BookmarkDialog",
);
const CommandPalette = lazyNamed(
	() => import("./CommandPalette"),
	"CommandPalette",
);
const FolderDialog = lazyNamed(() => import("./FolderDialog"), "FolderDialog");
const NewFolderDialog = lazyNamed(
	() => import("./FolderDialog"),
	"NewFolderDialog",
);
const GroupDialog = lazyNamed(() => import("./GroupDialog"), "GroupDialog");
const BoardDialog = lazyNamed(() => import("./BoardDialog"), "BoardDialog");
const SettingsPanel = lazyNamed(
	() => import("./SettingsPanel"),
	"SettingsPanel",
);
const VaultUnlockDialog = lazyNamed(
	() => import("./Vault"),
	"VaultUnlockDialog",
);
const BulkAddDialog = lazyNamed(
	() => import("./BulkAddDialog"),
	"BulkAddDialog",
);
const HistoryDialog = lazyNamed(
	() => import("./HistoryDialog"),
	"HistoryDialog",
);
const DuplicatesDialog = lazyNamed(
	() => import("./DuplicatesDialog"),
	"DuplicatesDialog",
);
const LinkHealthDialog = lazyNamed(
	() => import("./LinkHealthDialog"),
	"LinkHealthDialog",
);
const MonthlyReportDialog = lazyNamed(
	() => import("./MonthlyReport"),
	"MonthlyReportDialog",
);
const ShortcutsDialog = lazyNamed(
	() => import("./ShortcutsDialog"),
	"ShortcutsDialog",
);

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
	// Out of the way while typing (iOS would float it above the keyboard).
	const keyboardOpen = useVisibleArea() !== null;
	if (keyboardOpen) return null;
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
	const data = useDecryptedHome(useHome());
	const queryClient = useQueryClient();
	const vaultKeyReady = useVaultKeyReady();
	const { settings, boards, vault } = data;
	const [now, setNow] = useState(() => Date.now());
	// A scheduled board takes over during its window unless you pick another.
	const scheduledId = scheduledBoardId(boards, now, settings.timeZone);
	const [picked, setPicked] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset the manual pick whenever the schedule changes
	useEffect(() => setPicked(null), [scheduledId]);
	const board =
		boards.find((b) => b.id === (picked ?? scheduledId)) ??
		boards.find((b) => b.id === settings.activeBoardId) ??
		boards[0];
	const [editingState, setEditing] = useState(false);
	const readOnly = board?.role === "viewer";
	const editing = editingState && !readOnly;
	const [dialog, setDialog] = useState<DialogState>(null);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const saveSettings = useSaveSettings();
	const lockVault = useLockVault();
	const undoLast = useUndo();
	const typed = useRef("");

	useEffect(() => {
		applyTheme(settings.theme);
		if (settings.theme !== "system") return;
		const media = matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system");
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [settings.theme]);

	useEffect(() => applyAppearance(settings), [settings]);

	// The vault follows the tab: resume it after a reload or a return via Back,
	// and refresh when another tab locks it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: once per page load
	useEffect(() => {
		startVaultSync();
		const refresh = () => queryClient.invalidateQueries({ queryKey: homeKey });
		const resume = () =>
			resumeVault(data.userId).then((reopened) => {
				if (reopened) void refresh();
			});
		if (data.vault.configured && !data.vault.unlocked) void resume();
		const onShow = (event: PageTransitionEvent) => event.persisted && resume();
		window.addEventListener("tabz:vault-locked", refresh);
		window.addEventListener("pageshow", onShow);
		return () => {
			window.removeEventListener("tabz:vault-locked", refresh);
			window.removeEventListener("pageshow", onShow);
		};
	}, []);

	// Let people know when changes can't be saved.
	const [online, setOnline] = useState(true);
	useEffect(() => {
		const update = () => setOnline(navigator.onLine);
		update();
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
		};
	}, []);

	// Phones: swipe sideways on the page to move between boards.
	const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
	const tabOrder = useMemo(
		() => [...boards.filter((b) => !b.vault), ...boards.filter((b) => b.vault)],
		[boards],
	);
	const onSwipeStart = (event: React.TouchEvent) => {
		const target = event.target as HTMLElement;
		swipe.current =
			editing ||
			dialog ||
			event.touches.length > 1 ||
			target.closest("input, textarea, select, [data-no-swipe]")
				? null
				: {
						x: event.touches[0].clientX,
						y: event.touches[0].clientY,
						t: Date.now(),
					};
	};
	const onSwipeEnd = (event: React.TouchEvent) => {
		const start = swipe.current;
		swipe.current = null;
		if (!start || !board) return;
		const dx = event.changedTouches[0].clientX - start.x;
		const dy = event.changedTouches[0].clientY - start.y;
		if (Math.abs(dx) < 80 || Math.abs(dy) > 50 || Date.now() - start.t > 600)
			return;
		const index = tabOrder.findIndex((b) => b.id === board.id);
		const next = tabOrder[index + (dx < 0 ? 1 : -1)];
		if (next) {
			navigator.vibrate?.(8);
			selectBoard(next.id);
		}
	};

	// Keep the current board's tab in view and name the browser tab after it.
	useEffect(() => {
		if (!board) return;
		document.querySelector(`[data-board-tab="${board.id}"]`)?.scrollIntoView({
			inline: "center",
			block: "nearest",
			behavior: "smooth",
		});
		document.title = `${board.vault ? "tabz" : `${board.icon ? `${board.icon} ` : ""}${board.name} · tabz`}`;
	}, [board]);

	// ⌘K / Ctrl+K toggles the palette (which only loads once it's needed).
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setPaletteOpen((open) => !open);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// Fetch the common dialogs in the background so they open instantly.
	useEffect(() => {
		whenIdle(() => {
			CommandPalette.preload();
			BookmarkDialog.preload();
			FolderDialog.preload();
			SettingsPanel.preload();
			GroupDialog.preload();
			if (vault.configured) VaultUnlockDialog.preload();
		});
	}, [vault.configured]);

	// Widgets used on any board load in the background, so switching boards is instant.
	const widgetTypes = [
		...new Set(
			data.boards.flatMap((b) =>
				b.groups.flatMap((g) =>
					g.options.widget ? [g.options.widget.type] : [],
				),
			),
		),
	]
		.sort()
		.join(",");
	useEffect(() => {
		if (!widgetTypes) return;
		whenIdle(() => {
			void import("./widgets/WidgetBody").then((module) =>
				module.preloadWidgets(widgetTypes.split(",")),
			);
		}, 5000);
	}, [widgetTypes]);

	// Hands the extension an API token so it works without setup.
	useEffect(() => connectExtension(), []);

	// Let the extension's new tab page paint this background while tabz loads.
	const background = settings.background;
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-share when the theme changes too
	useEffect(() => {
		const canvas = getComputedStyle(document.documentElement)
			.getPropertyValue("--canvas")
			.trim();
		shareLookWithExtension({
			canvas,
			gradient:
				background.type === "preset" && background.value in BACKGROUNDS
					? BACKGROUNDS[background.value as GradientKey]
					: background.type === "color"
						? background.value
						: undefined,
			image: background.type === "image" ? background.value : undefined,
			dim: background.dim,
		});
	}, [background, settings.theme]);

	const selectBoard = useCallback(
		(id: string) => {
			if (scheduledId) setPicked(id);
			if (id !== settings.activeBoardId)
				saveSettings.mutate({ activeBoardId: id });
		},
		[scheduledId, settings.activeBoardId, saveSettings],
	);

	// Re-check schedules every half minute, only if any board has one.
	const hasSchedules = boards.some((b) => b.layout.schedule);
	useEffect(() => {
		if (!hasSchedules) return;
		const tick = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(tick);
	}, [hasSchedules]);

	// Remember the browser's time zone so schedules also apply while rendering on the server.
	useEffect(() => {
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (zone && zone !== settings.timeZone)
			saveSettings.mutate({ timeZone: zone });
	}, [settings.timeZone, saveSettings]);

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
			navigator.vibrate?.(30);
			// The same gesture locks it again while it's open.
			if (vault.unlocked) {
				const firstBoard = boards.find((b) => !b.vault);
				if (board?.vault && firstBoard) selectBoard(firstBoard.id);
				void lockVault();
			} else openVault();
		}
	};

	// ⌘Z undoes the last change; pasting links anywhere opens "Paste links".
	useEffect(() => {
		const isTyping = (target: EventTarget | null) => {
			const el = target as HTMLElement | null;
			return (
				!!el &&
				(el.isContentEditable ||
					["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
			);
		};
		const onKey = (event: KeyboardEvent) => {
			if (
				(event.metaKey || event.ctrlKey) &&
				!event.shiftKey &&
				event.key.toLowerCase() === "z" &&
				!isTyping(event.target) &&
				!dialog
			) {
				event.preventDefault();
				undoLast();
			}
		};
		const onPaste = (event: ClipboardEvent) => {
			if (isTyping(event.target) || dialog || paletteOpen) return;
			const text = event.clipboardData?.getData("text") ?? "";
			if (extractUrls(text).length === 0) return;
			event.preventDefault();
			setDialog({ type: "bulk-add", text });
		};
		window.addEventListener("keydown", onKey);
		window.addEventListener("paste", onPaste);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("paste", onPaste);
		};
	}, [dialog, paletteOpen, undoLast]);

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
			else if (event.key === "n" && board?.groups.find(isLinksGroup)) {
				event.preventDefault();
				setDialog({
					type: "bookmark",
					groupId: (board.groups.find(isLinksGroup) as HomeGroup).id,
				});
			} else if (/^[1-9]$/.test(event.key)) {
				const next = boards[Number(event.key) - 1];
				if (next) selectBoard(next.id);
			} else if (event.key === "[" || event.key === "]") {
				const order = [
					...boards.filter((b) => !b.vault),
					...boards.filter((b) => b.vault),
				];
				const index = order.findIndex((b) => b.id === board?.id);
				const next = order[index + (event.key === "]" ? 1 : -1)];
				if (next) selectBoard(next.id);
			} else if (event.key === "?") {
				event.preventDefault();
				setDialog({ type: "shortcuts" });
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
					linksIn(group.bookmarks).map((bookmark) => ({
						bookmark: bookmark as LinkItem,
						group: [
							group.name,
							...(findInTree(group.bookmarks, bookmark.id)?.path.map(
								(folder) => folder.title,
							) ?? []),
						].join(" / "),
					})),
				),
			),
		[boards],
	);

	const onVisit = useCallback(
		(bookmark: LinkItem, options?: { leaving?: boolean }) => {
			// Visit counts power search ranking and the most-visited strip. A beacon
			// survives this page unloading, however fast the next one arrives.
			const sent = navigator.sendBeacon?.(
				"/api/visit",
				new Blob([JSON.stringify({ id: bookmark.id })], {
					type: "application/json",
				}),
			);
			if (!sent) run(call(recordVisit, { id: bookmark.id })).catch(() => {});
			// This tab is leaving: don't spend the moment re-rendering everything.
			if (options?.leaving) return;
			// Clear "new posts" badges right away when the link opens in another tab.
			const visited = <T extends LinkItem>(item: T): T =>
				item.id === bookmark.id
					? {
							...item,
							visitCount: item.visitCount + 1,
							lastVisitedAt: new Date(),
						}
					: item;
			queryClient.setQueryData<HomeData>(homeKey, (data) =>
				data
					? {
							...data,
							boards: data.boards.map((b) => ({
								...b,
								groups: b.groups.map((g) => ({
									...g,
									bookmarks: mapTree(g.bookmarks, visited),
								})),
							})),
						}
					: data,
			);
		},
		[queryClient],
	);

	// Folders that are private themselves or sit inside a private folder.
	const incognitoFolders = useMemo(() => {
		const ids = new Set<string>();
		const walk = (items: TreeItem[], inherited: boolean) => {
			for (const item of items) {
				if (item.kind !== "folder") continue;
				const privateHere = inherited || item.incognito;
				if (privateHere) ids.add(item.id);
				walk(item.children, privateHere);
			}
		};
		for (const group of boards.flatMap((b) => b.groups))
			walk(group.bookmarks, false);
		return ids;
	}, [boards]);

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
			const newTab = options?.newTab || settings.openInNewTab;
			onVisit(bookmark, { leaving: !newTab });
			if (newTab) window.open(targetUrl(bookmark), "_blank", "noopener");
			else {
				showLeaving();
				window.location.assign(targetUrl(bookmark));
			}
		},
		[isIncognito, onVisit, settings.openInNewTab],
	);

	const openAll = useCallback(
		(bookmarks: LinkItem[]) => {
			const privateUrls = bookmarks.filter(isIncognito).map(targetUrl);
			const urls = bookmarks.filter((b) => !isIncognito(b)).map(targetUrl);
			if (privateUrls.length) openIncognito(privateUrls);
			if (urls.length) openTabs(urls);
		},
		[isIncognito],
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
			openAll,
			readOnly,
		}),
		[
			settings,
			boards,
			editing,
			onVisit,
			isIncognito,
			openLink,
			openAll,
			readOnly,
		],
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
			<div className="relative min-h-dvh" data-board={board.name}>
				{settings.customCss && (
					// User-authored styles for their own page; can't close the tag.
					<style>{settings.customCss.replace(/<\/?\s*style/gi, "")}</style>
				)}
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
									data-board-tab={b.id}
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
									{(b.ownerName || b.shareSlug) && (
										<Users
											className="size-3 text-muted"
											aria-label={
												b.ownerName
													? `Shared by ${b.ownerName}`
													: "Shared publicly"
											}
										/>
									)}
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
								disabled={readOnly}
								title={readOnly ? "This board is view-only" : "Edit layout (E)"}
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
								disabled={readOnly || !board.groups.find(isLinksGroup)}
								onClick={() =>
									board.groups.find(isLinksGroup) &&
									setDialog({
										type: "bookmark",
										groupId: (board.groups.find(isLinksGroup) as HomeGroup).id,
									})
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
					onTouchStart={onSwipeStart}
					onTouchEnd={onSwipeEnd}
				>
					<div className="flex flex-col gap-6 pt-6 pb-10 sm:pt-10">
						{/* biome-ignore lint/a11y/noStaticElementInteractions: hidden vault gesture, intentionally undiscoverable */}
						{/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users open the vault by typing the code */}
						<div
							onClick={onClockTap}
							className={cn(
								"select-none",
								// Keep a tap target for the vault even with the clock hidden.
								!settings.showClock && !settings.showGreeting && "min-h-16",
							)}
							data-clock
						>
							<Clock
								name={settings.greetingName || session.name}
								showClock={settings.showClock}
								showGreeting={settings.showGreeting}
								format={settings.clockFormat}
								timeZone={settings.timeZone}
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
						<ReportBanner
							onOpen={(month) => setDialog({ type: "report", month })}
						/>
					</div>
					{board.vault && vault.encrypted && !vaultKeyReady && (
						<button
							type="button"
							onClick={() => setDialog({ type: "vault-unlock" })}
							className="glass mx-auto mb-4 flex items-center gap-2 rounded-full px-4 py-2 text-sm"
						>
							<Lock className="size-4 text-accent" /> Enter your vault password
							to read these links in this tab
						</button>
					)}
					{!online && (
						<p
							role="status"
							className="glass mx-auto mb-4 w-fit rounded-full px-4 py-1.5 text-sm text-muted"
						>
							📡 You're offline. Links still open; changes will save once you're
							back.
						</p>
					)}
					<div key={board.id} className="animate-pop">
						<BoardGrid board={board} />
					</div>
					<Rediscover />
				</main>

				<MobileDock
					editing={editing}
					vaultUnlocked={vault.unlocked}
					onSearch={() => setPaletteOpen(true)}
					onAdd={() =>
						board.groups.find(isLinksGroup) &&
						setDialog({
							type: "bookmark",
							groupId: (board.groups.find(isLinksGroup) as HomeGroup).id,
						})
					}
					onEdit={() => setEditing((value) => !value)}
					onCustomize={() => setDialog({ type: "settings" })}
					onLock={() => lockVault()}
					dark={isDark}
					onToggleTheme={() =>
						saveSettings.mutate({ theme: isDark ? "light" : "dark" })
					}
				/>

				<Suspense fallback={null}>
					{paletteOpen && (
						<CommandPalette
							open={paletteOpen}
							onOpenChange={setPaletteOpen}
							board={board}
							onSelectBoard={selectBoard}
							onToggleEdit={() => setEditing((value) => !value)}
							onSaveSettings={(patch) => saveSettings.mutate(patch)}
							onLockVault={vault.unlocked ? () => lockVault() : undefined}
							onUndo={() => undoLast()}
						/>
					)}

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
					{dialog?.type === "history" && (
						<HistoryDialog initialTab={dialog.tab} onClose={close} />
					)}
					{dialog?.type === "duplicates" && (
						<DuplicatesDialog onClose={close} />
					)}
					{dialog?.type === "link-health" && (
						<LinkHealthDialog onClose={close} />
					)}
					{dialog?.type === "shortcuts" && (
						<ShortcutsDialog
							showVault={!vault.configured || vault.unlocked}
							onClose={close}
						/>
					)}
					{dialog?.type === "report" && (
						<MonthlyReportDialog month={dialog.month} onClose={close} />
					)}
					{dialog?.type === "bulk-add" &&
						(dialog.groupId ?? board.groups.find(isLinksGroup)?.id) && (
							<BulkAddDialog
								boards={boards}
								groupId={
									(dialog.groupId ??
										board.groups.find(isLinksGroup)?.id) as string
								}
								initialText={dialog.text}
								festive={settings.celebrate}
								onClose={close}
							/>
						)}
					{dialog?.type === "folder" && (
						<FolderDialog
							key={dialog.folderId}
							folderId={dialog.folderId}
							onClose={close}
						/>
					)}
					{dialog?.type === "new-folder" && (
						<NewFolderDialog
							groupId={dialog.groupId}
							parentId={dialog.parentId}
							onClose={close}
						/>
					)}
					{dialog?.type === "group" && (
						<GroupDialog
							boards={boards}
							boardId={dialog.boardId}
							group={dialog.group}
							initialKind={dialog.kind}
							onClose={close}
						/>
					)}
					{dialog?.type === "board" && (
						<BoardDialog
							board={dialog.board}
							canDelete={
								(!dialog.board || dialog.board.role === "owner") &&
								(Boolean(dialog.board?.vault) ||
									boards.filter((b) => !b.vault && b.role === "owner").length >
										1)
							}
							vaultUnlocked={vault.unlocked}
							userId={data.userId}
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
							aiAvailable={data.features.ai}
							initialTab={dialog.tab}
							onClose={close}
						/>
					)}
				</Suspense>
			</div>
		</HomeContext.Provider>
	);
}

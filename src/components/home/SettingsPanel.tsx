import { useQueryClient } from "@tanstack/react-query";
import {
	Bot,
	ClipboardList,
	Copy,
	Download,
	GalleryHorizontalEnd,
	Grid2x2,
	History,
	Home,
	LayoutList,
	Loader2,
	Lock,
	LogOut,
	Palette,
	Rows3,
	Shapes,
	Trash2,
	Upload,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	ColorSwatches,
	Field,
	Segmented,
	Slider,
	Toggle,
} from "#/components/ui/controls";
import { Modal } from "#/components/ui/Modal";
import { loadFont } from "#/lib/appearance";
import { authClient } from "#/lib/auth-client";
import { parseBookmarkHtml, toBookmarkHtml } from "#/lib/bookmark-file";
import { cn } from "#/lib/cn";
import { homeKey, useHomeAction, useSaveSettings } from "#/lib/home-query";
import {
	type ExtensionStatus,
	getExtensionStatus,
	onExtensionStatus,
} from "#/lib/incognito";
import {
	ACCENTS,
	BACKGROUNDS,
	type BoardLayout,
	FONTS,
	type FontKey,
	type GradientKey,
	PATTERNS,
	SEARCH_ENGINES,
	type SearchEngine,
	THEME_PRESETS,
	type UserSettings,
	WALLPAPERS,
} from "#/lib/preferences";
import { type HomeData, importBookmarks, updateBoard } from "#/server/home";
import type { SessionInfo } from "#/server/session";
import { Backdrop } from "./Backdrop";
import { ConnectAI } from "./ConnectAI";
import { useHomeContext } from "./context";
import type { HomeBoard } from "./types";
import { VaultSettings, type VaultState } from "./Vault";

type Props = {
	settings: UserSettings;
	vault: VaultState;
	board: HomeBoard;
	boards: HomeBoard[];
	session: SessionInfo;
	initialTab?: string;
	onClose: () => void;
};

const TABS = [
	{ id: "look", label: "Look", icon: Palette },
	{ id: "layout", label: "Layout", icon: Grid2x2 },
	{ id: "home", label: "Home", icon: Home },
	{ id: "vault", label: "Vault", icon: Lock },
	{ id: "data", label: "Data", icon: Download },
	{ id: "connect", label: "AI", icon: Bot },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="space-y-3 border-t border-line pt-5 first:border-0 first:pt-0">
			<h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
				{title}
			</h3>
			{children}
		</section>
	);
}

function Bookmarklet() {
	const ref = useRef<HTMLAnchorElement>(null);
	useEffect(() => {
		// React refuses javascript: hrefs, so set it on the DOM node directly.
		ref.current?.setAttribute(
			"href",
			`javascript:(()=>{window.open('${window.location.origin}/add?popup=1&url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'tabz','width=460,height=680')})()`,
		);
	}, []);
	return (
		// biome-ignore lint/a11y/useValidAnchor: bookmarklets must be real links so they can be dragged to the bookmarks bar.
		<a
			ref={ref}
			className="btn-outline cursor-grab"
			onClick={(event) => event.preventDefault()}
			href="#bookmarklet"
		>
			＋ Add to tabz
		</a>
	);
}

/** Shows whether the tabz extension can open private windows. */
function ExtensionStatusRow() {
	const [status, setStatus] = useState<ExtensionStatus>(getExtensionStatus);
	useEffect(() => onExtensionStatus(setStatus), []);
	const [tone, text] = !status.installed
		? [
				"bg-amber-500",
				"Extension not detected. Install it to open private links in one click.",
			]
		: !status.incognitoAllowed
			? [
					"bg-amber-500",
					'Extension found. Turn on "Allow in Incognito" in chrome://extensions → Tabz → Details.',
				]
			: [
					"bg-emerald-500",
					"Extension ready: private links open in an incognito window.",
				];
	return (
		<div className="flex items-start gap-2 rounded-xl border border-line p-3 text-xs">
			<span className={cn("mt-1 size-2 shrink-0 rounded-full", tone)} />
			<span className="text-muted">{text}</span>
		</div>
	);
}

/** Swatch that previews a background option at thumbnail size. */
function BackgroundSwatch({
	background,
	active,
	label,
	onClick,
}: {
	background: UserSettings["background"];
	active: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={label}
			className={cn(
				"focus-ring relative h-14 overflow-hidden rounded-xl border border-line bg-[var(--canvas)] text-[11px] font-medium capitalize text-muted transition hover:scale-[1.03]",
				active && "ring-2 ring-accent ring-offset-2 ring-offset-surface-2",
			)}
		>
			<span className="absolute inset-0 [&>div]:!absolute">
				<Backdrop background={{ ...background, dim: 0, animate: false }} />
			</span>
			<span className="relative">{label}</span>
		</button>
	);
}

export function SettingsPanel({
	settings,
	vault,
	board,
	boards,
	session,
	initialTab,
	onClose,
}: Props) {
	const { openDialog } = useHomeContext();
	const [tab, setTab] = useState<TabId>(
		(TABS.find((t) => t.id === initialTab)?.id ?? "look") as TabId,
	);
	const queryClient = useQueryClient();
	const save = useSaveSettings();
	const pending = useRef<Partial<UserSettings>>({});
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

	/** Applies instantly; batches the network save so sliders stay smooth. */
	const set = (patch: Partial<UserSettings>, immediate = true) => {
		queryClient.setQueryData<HomeData>(homeKey, (data) =>
			data ? { ...data, settings: { ...data.settings, ...patch } } : data,
		);
		pending.current = { ...pending.current, ...patch };
		clearTimeout(timer.current);
		timer.current = setTimeout(
			() => {
				save.mutate(pending.current);
				pending.current = {};
			},
			immediate ? 0 : 400,
		);
	};
	const setBackground = (
		patch: Partial<UserSettings["background"]>,
		immediate = true,
	) => set({ background: { ...settings.background, ...patch } }, immediate);

	const layoutAction = useHomeAction(updateBoard, {
		optimistic: (data, input) => ({
			...data,
			boards: data.boards.map((b) =>
				b.id === input.id
					? { ...b, layout: { ...b.layout, ...input.layout } }
					: b,
			),
		}),
	});
	const setLayout = (layout: Partial<BoardLayout>) =>
		layoutAction.mutate({ id: board.id, layout });
	const importer = useHomeAction(importBookmarks, {
		onSuccess: (result) => {
			toast.success(`Imported ${result.imported} bookmarks`);
			set({ activeBoardId: result.boardId });
			onClose();
		},
	});
	const [imageUrl, setImageUrl] = useState(
		settings.background.type === "image" ? settings.background.value : "",
	);
	const fileInput = useRef<HTMLInputElement>(null);
	const layout = board.layout;
	const bg = settings.background;

	// Preview every font in its own typeface.
	useEffect(() => {
		if (tab === "look")
			for (const key of Object.keys(FONTS) as FontKey[]) loadFont(key);
	}, [tab]);

	const onImport = async (file: File) => {
		const groups = parseBookmarkHtml(await file.text());
		if (groups.length === 0) {
			toast.error("No bookmarks found in that file");
			return;
		}
		importer.mutate({ boardName: "Imported", groups });
	};

	const onExport = () => {
		const blob = new Blob([toBookmarkHtml(boards)], { type: "text/html" });
		const link = document.createElement("a");
		link.href = URL.createObjectURL(blob);
		link.download = "tabz-bookmarks.html";
		link.click();
		URL.revokeObjectURL(link.href);
	};

	return (
		<Modal open onClose={onClose} title="Customize" side>
			<div className="sticky top-0 z-10 -mx-6 mb-5 flex gap-1 border-b border-line bg-surface-2 px-6 pb-3">
				{TABS.map(({ id, label, icon: Icon }) => (
					<button
						key={id}
						type="button"
						onClick={() => setTab(id)}
						className={cn(
							"focus-ring flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition",
							tab === id
								? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-ink"
								: "text-muted hover:text-ink",
						)}
					>
						<Icon className="size-4" />
						{label}
					</button>
				))}
			</div>

			{tab === "look" && (
				<div className="space-y-6">
					<Section title="Themes">
						<div className="grid grid-cols-2 gap-2">
							{THEME_PRESETS.map((preset) => (
								<button
									key={preset.id}
									type="button"
									onClick={() => set(preset.settings)}
									className="focus-ring group relative h-20 overflow-hidden rounded-2xl border border-line text-left transition hover:scale-[1.02]"
								>
									<span
										className={cn(
											"absolute inset-0",
											preset.settings.theme === "dark"
												? "bg-[#0b0c10]"
												: "bg-[#f6f6f4]",
										)}
									/>
									<span className="absolute inset-0 [&>div]:!absolute">
										<Backdrop
											background={{
												...preset.settings.background,
												animate: false,
											}}
										/>
									</span>
									<span
										className="absolute right-2 bottom-2 size-5 rounded-full shadow ring-2 ring-white/70"
										style={{ background: preset.settings.accent }}
									/>
									<span
										className={cn(
											"relative block p-3 text-sm font-semibold",
											preset.settings.theme === "dark" ||
												preset.settings.background.type === "image"
												? "text-white drop-shadow"
												: "text-slate-900",
										)}
										style={{ fontFamily: FONTS[preset.settings.font].family }}
									>
										{preset.emoji} {preset.label}
									</span>
								</button>
							))}
						</div>
					</Section>

					<Section title="Colors">
						<Field label="Mode">
							<Segmented
								value={settings.theme}
								onChange={(theme) => set({ theme })}
								options={[
									{ value: "system", label: "Auto" },
									{ value: "light", label: "Light" },
									{ value: "dark", label: "Dark" },
								]}
							/>
						</Field>
						<Field label="Accent">
							<div className="flex flex-wrap items-center gap-2">
								<ColorSwatches
									value={settings.accent}
									colors={ACCENTS}
									onChange={(accent) => accent && set({ accent })}
								/>
								<label
									className="focus-ring relative size-7 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-line"
									title="Custom color"
								>
									<span
										className="absolute inset-0"
										style={{
											background:
												"conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
										}}
									/>
									<input
										type="color"
										value={settings.accent}
										onChange={(event) =>
											set({ accent: event.target.value }, false)
										}
										className="absolute inset-0 cursor-pointer opacity-0"
									/>
								</label>
							</div>
						</Field>
					</Section>

					<Section title="Style">
						<Field label="Font">
							<div className="grid grid-cols-5 gap-1.5">
								{(Object.keys(FONTS) as FontKey[]).map((key) => (
									<button
										key={key}
										type="button"
										onClick={() => set({ font: key })}
										className={cn(
											"focus-ring rounded-xl border border-line px-1 py-2 text-center transition hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]",
											settings.font === key &&
												"border-accent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]",
										)}
									>
										<span
											className="block text-lg leading-none"
											style={{ fontFamily: FONTS[key].family }}
										>
											Aa
										</span>
										<span className="mt-1 block text-[10px] text-muted">
											{FONTS[key].label}
										</span>
									</button>
								))}
							</div>
						</Field>
						<div className="grid grid-cols-2 gap-3">
							<Field label="Corners">
								<Segmented
									value={settings.radius}
									onChange={(radius) => set({ radius })}
									options={[
										{ value: "sharp", label: "Sharp" },
										{ value: "soft", label: "Soft" },
										{ value: "round", label: "Round" },
									]}
								/>
							</Field>
							<Field label="Panels">
								<Segmented
									value={settings.surface}
									onChange={(surface) => set({ surface })}
									options={[
										{ value: "glass", label: "Glass" },
										{ value: "solid", label: "Solid" },
										{ value: "outline", label: "Line" },
									]}
								/>
							</Field>
						</div>
					</Section>

					<Section title="Background">
						<Segmented
							value={bg.type}
							onChange={(type) =>
								setBackground({
									type,
									value:
										type === "preset"
											? "aurora"
											: type === "pattern"
												? "dots"
												: type === "color"
													? "#e8e4dc"
													: (WALLPAPERS[0]?.url ?? ""),
								})
							}
							options={[
								{ value: "preset", label: "Gradient" },
								{ value: "pattern", label: "Pattern" },
								{ value: "color", label: "Color" },
								{ value: "image", label: "Photo" },
							]}
						/>
						{bg.type === "preset" && (
							<>
								<div className="grid grid-cols-3 gap-2">
									{(Object.keys(BACKGROUNDS) as GradientKey[]).map((key) => (
										<BackgroundSwatch
											key={key}
											label={key}
											background={{ ...bg, type: "preset", value: key }}
											active={bg.value === key}
											onClick={() => setBackground({ value: key })}
										/>
									))}
								</div>
								<Toggle
									label="Slowly drift"
									checked={bg.animate}
									onChange={(animate) => setBackground({ animate })}
								/>
							</>
						)}
						{bg.type === "pattern" && (
							<div className="grid grid-cols-3 gap-2">
								{PATTERNS.map((key) => (
									<BackgroundSwatch
										key={key}
										label={key}
										background={{ ...bg, type: "pattern", value: key }}
										active={bg.value === key}
										onClick={() => setBackground({ value: key })}
									/>
								))}
							</div>
						)}
						{bg.type === "color" && (
							<div className="flex flex-wrap items-center gap-2">
								{[
									"#f4efe6",
									"#e8eef7",
									"#eaf5ee",
									"#fbe9ef",
									"#111318",
									"#0f172a",
									"#1c1917",
									"#14281d",
								].map((color) => (
									<button
										key={color}
										type="button"
										aria-label={`Background ${color}`}
										onClick={() => setBackground({ value: color })}
										className={cn(
											"focus-ring size-8 rounded-full border border-line",
											bg.value === color &&
												"ring-2 ring-accent ring-offset-2 ring-offset-surface-2",
										)}
										style={{ background: color }}
									/>
								))}
								<input
									type="color"
									value={bg.value.startsWith("#") ? bg.value : "#e8e4dc"}
									onChange={(event) =>
										setBackground({ value: event.target.value }, false)
									}
									className="h-8 w-12 cursor-pointer rounded-lg border border-line bg-transparent"
									aria-label="Custom background color"
								/>
							</div>
						)}
						{bg.type === "image" && (
							<>
								<div className="grid grid-cols-4 gap-2">
									{WALLPAPERS.map((wallpaper) => (
										<button
											key={wallpaper.id}
											type="button"
											title={wallpaper.label}
											onClick={() => {
												setImageUrl(wallpaper.url);
												setBackground({ value: wallpaper.url });
											}}
											className={cn(
												"focus-ring aspect-[4/3] overflow-hidden rounded-lg border border-line transition hover:scale-105",
												bg.value === wallpaper.url &&
													"ring-2 ring-accent ring-offset-2 ring-offset-surface-2",
											)}
										>
											<img
												src={wallpaper.thumb}
												alt={wallpaper.label}
												loading="lazy"
												className="size-full object-cover"
											/>
										</button>
									))}
								</div>
								<Field label="Your own image" hint="Paste any https image URL.">
									<div className="flex gap-2">
										<input
											className="field"
											value={imageUrl}
											onChange={(event) => setImageUrl(event.target.value)}
											placeholder="https://…"
										/>
										<button
											type="button"
											className="btn-outline"
											disabled={!/^https:\/\//.test(imageUrl)}
											onClick={() => setBackground({ value: imageUrl })}
										>
											Use
										</button>
									</div>
								</Field>
								<Slider
									label="Blur"
									value={bg.blur}
									min={0}
									max={24}
									suffix="px"
									onChange={(blur) => setBackground({ blur }, false)}
								/>
							</>
						)}
						<Slider
							label="Fade"
							value={bg.dim}
							min={0}
							max={90}
							suffix="%"
							onChange={(dim) => setBackground({ dim }, false)}
						/>
					</Section>
				</div>
			)}

			{tab === "layout" && (
				<div className="space-y-6">
					<Section title={`Board · ${board.icon ?? ""} ${board.name}`}>
						<Field label="Columns">
							<Segmented
								value={layout.columns}
								onChange={(columns) => setLayout({ columns })}
								options={[1, 2, 3, 4, 5, 6].map((value) => ({
									value,
									label: value,
								}))}
							/>
						</Field>
						<Field label="Bookmark style">
							<div className="grid grid-cols-5 gap-1.5">
								{(
									[
										{ value: "tile", label: "Tiles", icon: Grid2x2 },
										{
											value: "gallery",
											label: "Previews",
											icon: GalleryHorizontalEnd,
										},
										{ value: "card", label: "Cards", icon: Rows3 },
										{ value: "list", label: "List", icon: LayoutList },
										{ value: "icon", label: "Icons", icon: Shapes },
									] as const
								).map(({ value, label, icon: Icon }) => (
									<button
										key={value}
										type="button"
										onClick={() => setLayout({ tileStyle: value })}
										className={cn(
											"focus-ring flex flex-col items-center gap-1 rounded-xl border border-line py-2.5 text-[11px] font-medium transition hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]",
											layout.tileStyle === value &&
												"border-accent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-ink",
										)}
									>
										<Icon className="size-4" /> {label}
									</button>
								))}
							</div>
						</Field>
						<div className="grid grid-cols-2 gap-3">
							<Field label="Size">
								<Segmented
									value={layout.tileSize}
									onChange={(tileSize) => setLayout({ tileSize })}
									options={[
										{ value: "sm", label: "S" },
										{ value: "md", label: "M" },
										{ value: "lg", label: "L" },
									]}
								/>
							</Field>
							<Field label="Page width">
								<Segmented
									value={layout.width}
									onChange={(width) => setLayout({ width })}
									options={[
										{ value: "narrow", label: "Narrow" },
										{ value: "wide", label: "Wide" },
										{ value: "full", label: "Full" },
									]}
								/>
							</Field>
						</div>
						<Toggle
							label="Show group titles"
							checked={layout.showGroupTitles}
							onChange={(showGroupTitles) => setLayout({ showGroupTitles })}
						/>
						<p className="text-xs text-muted">
							Each group can override its style in its own settings (the ⚙ on
							the group).
						</p>
					</Section>
				</div>
			)}

			{tab === "home" && (
				<div className="space-y-6">
					<Section title="Search">
						<Field label="Search engine">
							<select
								className="field"
								value={settings.searchEngine}
								onChange={(event) =>
									set({ searchEngine: event.target.value as SearchEngine })
								}
							>
								{Object.entries(SEARCH_ENGINES).map(([key, engine]) => (
									<option key={key} value={key}>
										{engine.label}
									</option>
								))}
							</select>
						</Field>
						<Toggle
							label="Search bar"
							checked={settings.showSearch}
							onChange={(showSearch) => set({ showSearch })}
						/>
					</Section>
					<Section title="Widgets">
						<Toggle
							label="Clock"
							checked={settings.showClock}
							onChange={(showClock) => set({ showClock })}
						/>
						<Toggle
							label="24-hour clock"
							checked={settings.clockFormat === "24h"}
							onChange={(on) => set({ clockFormat: on ? "24h" : "12h" })}
						/>
						<Toggle
							label="Greeting & date"
							checked={settings.showGreeting}
							onChange={(showGreeting) => set({ showGreeting })}
						/>
						<Field label="Call me">
							<input
								className="field"
								value={settings.greetingName}
								onChange={(event) =>
									set({ greetingName: event.target.value }, false)
								}
								placeholder={session.name.split(" ")[0]}
								maxLength={40}
							/>
						</Field>
						<Toggle
							label="Most-visited strip"
							checked={settings.showTopSites}
							onChange={(showTopSites) => set({ showTopSites })}
						/>
					</Section>
					<Section title="Behavior & fun">
						<Toggle
							label="Hover previews of websites"
							checked={settings.linkPreviews}
							onChange={(linkPreviews) => set({ linkPreviews })}
						/>
						<Toggle
							label="3D tilt on hover"
							checked={settings.tilt}
							onChange={(tilt) => set({ tilt })}
						/>
						<Toggle
							label="Confetti when saving"
							checked={settings.celebrate}
							onChange={(celebrate) => set({ celebrate })}
						/>
						<Toggle
							label="Open links in a new tab"
							checked={settings.openInNewTab}
							onChange={(openInNewTab) => set({ openInNewTab })}
						/>
					</Section>
					<Section title="Private browsing">
						<Toggle
							label="🕶️ Open every link in incognito"
							checked={settings.incognitoAll}
							onChange={(incognitoAll) => set({ incognitoAll })}
						/>
						<p className="text-xs text-muted">
							You can also mark single links (in their edit dialog) or whole
							folders as always-incognito. Private links skip visit tracking and
							previews.
						</p>
						<ExtensionStatusRow />
					</Section>
				</div>
			)}

			{tab === "data" && (
				<div className="space-y-6">
					<Section title="Import & export">
						<div className="flex flex-wrap gap-2">
							<input
								ref={fileInput}
								type="file"
								accept=".html,.htm,text/html"
								className="hidden"
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (file) onImport(file);
									event.target.value = "";
								}}
							/>
							<button
								type="button"
								className="btn-outline"
								onClick={() => fileInput.current?.click()}
								disabled={importer.isPending}
							>
								{importer.isPending ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<Upload className="size-4" />
								)}{" "}
								Import from browser
							</button>
							<button type="button" className="btn-outline" onClick={onExport}>
								<Download className="size-4" /> Export
							</button>
						</div>
						<p className="text-xs text-muted">
							Chrome: Bookmarks → Bookmark manager → ⋮ → Export bookmarks.
						</p>
					</Section>
					<Section title="Safety net">
						<div className="flex flex-wrap gap-2">
							<button
								type="button"
								className="btn-outline"
								onClick={() => openDialog({ type: "history" })}
							>
								<History className="size-4" /> History
							</button>
							<button
								type="button"
								className="btn-outline"
								onClick={() => openDialog({ type: "history", tab: "trash" })}
							>
								<Trash2 className="size-4" /> Trash
							</button>
							<button
								type="button"
								className="btn-outline"
								onClick={() => openDialog({ type: "duplicates" })}
							>
								<Copy className="size-4" /> Duplicates
							</button>
							<button
								type="button"
								className="btn-outline"
								onClick={() => openDialog({ type: "bulk-add" })}
							>
								<ClipboardList className="size-4" /> Paste links
							</button>
						</div>
						<p className="text-xs text-muted">
							Deleted items stay in the trash for 30 days. ⌘Z undoes your last
							change.
						</p>
					</Section>
					<Section title="Browser">
						<p className="text-sm text-muted">
							Set{" "}
							<span className="font-mono text-ink">
								{typeof window === "undefined" ? "" : window.location.origin}
							</span>{" "}
							as your start page, or install the extension to save pages in one
							click and open tabz on every new tab.
						</p>
						<div className="flex flex-wrap items-center gap-2">
							<a
								className="btn-outline"
								href="https://github.com/nearbycoder/tabz.space/tree/main/extension"
								target="_blank"
								rel="noreferrer"
							>
								Get the extension
							</a>
							<Bookmarklet />
						</div>
						<p className="text-xs text-muted">
							No extension? Drag “＋ Add to tabz” to your bookmarks bar.
						</p>
					</Section>
					<Section title="Account">
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0 text-sm">
								<div className="truncate font-medium">{session.name}</div>
								<div className="truncate text-xs text-muted">
									{session.username ? `@${session.username} · ` : ""}
									{session.email}
								</div>
							</div>
							<button
								type="button"
								className="btn-outline"
								onClick={async () => {
									await authClient.signOut();
									window.location.assign("/");
								}}
							>
								<LogOut className="size-4" /> Sign out
							</button>
						</div>
					</Section>
				</div>
			)}

			{tab === "vault" && <VaultSettings vault={vault} settings={settings} />}

			{tab === "connect" && (
				<Section title="Connect AI (MCP)">
					<ConnectAI />
				</Section>
			)}
		</Modal>
	);
}

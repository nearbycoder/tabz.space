import {
	Download,
	Grid2x2,
	LayoutList,
	Loader2,
	LogOut,
	Rows3,
	Shapes,
	Upload,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	ColorSwatches,
	Field,
	Segmented,
	Toggle,
} from "#/components/ui/controls";
import { Modal } from "#/components/ui/Modal";
import { authClient } from "#/lib/auth-client";
import { parseBookmarkHtml, toBookmarkHtml } from "#/lib/bookmark-file";
import { useHomeAction, useSaveSettings } from "#/lib/home-query";
import {
	ACCENTS,
	BACKGROUNDS,
	type BoardLayout,
	SEARCH_ENGINES,
	type SearchEngine,
	type UserSettings,
} from "#/lib/preferences";
import { importBookmarks, updateBoard } from "#/server/home";
import type { SessionInfo } from "#/server/session";
import { ConnectAI } from "./ConnectAI";
import type { HomeBoard } from "./types";

type Props = {
	settings: UserSettings;
	board: HomeBoard;
	boards: HomeBoard[];
	session: SessionInfo;
	onClose: () => void;
};

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
			`javascript:(()=>{window.open('${window.location.origin}/add?popup=1&url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'tabz','width=440,height=640')})()`,
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

export function SettingsPanel({
	settings,
	board,
	boards,
	session,
	onClose,
}: Props) {
	const save = useSaveSettings();
	const set = (patch: Partial<UserSettings>) => save.mutate(patch);
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
			save.mutate({ activeBoardId: result.boardId });
			onClose();
		},
	});
	const [imageUrl, setImageUrl] = useState(
		settings.background.type === "image" ? settings.background.value : "",
	);
	const fileInput = useRef<HTMLInputElement>(null);
	const layout = board.layout;

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
			<div className="space-y-6 pt-2">
				<Section title={`Layout · ${board.name}`}>
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
						<Segmented
							value={layout.tileStyle}
							onChange={(tileStyle) => setLayout({ tileStyle })}
							options={[
								{
									value: "tile",
									label: (
										<>
											<Grid2x2 className="size-3.5" /> Tiles
										</>
									),
								},
								{
									value: "card",
									label: (
										<>
											<Rows3 className="size-3.5" /> Cards
										</>
									),
								},
								{
									value: "list",
									label: (
										<>
											<LayoutList className="size-3.5" /> List
										</>
									),
								},
								{
									value: "icon",
									label: (
										<>
											<Shapes className="size-3.5" /> Icons
										</>
									),
								},
							]}
						/>
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
				</Section>

				<Section title="Appearance">
					<Field label="Theme">
						<Segmented
							value={settings.theme}
							onChange={(theme) => set({ theme })}
							options={[
								{ value: "system", label: "System" },
								{ value: "light", label: "Light" },
								{ value: "dark", label: "Dark" },
							]}
						/>
					</Field>
					<Field label="Accent">
						<ColorSwatches
							value={settings.accent}
							colors={ACCENTS}
							onChange={(accent) => accent && set({ accent })}
						/>
					</Field>
					<Field label="Background">
						<div className="grid grid-cols-3 gap-2">
							{Object.entries(BACKGROUNDS).map(([key, value]) => (
								<button
									key={key}
									type="button"
									onClick={() =>
										set({ background: { type: "preset", value: key } })
									}
									className="focus-ring h-14 rounded-xl border border-line text-xs font-medium capitalize text-muted transition data-[active=true]:ring-2 data-[active=true]:ring-accent"
									data-active={
										settings.background.type === "preset" &&
										settings.background.value === key
									}
									style={{ background: value || "var(--canvas)" }}
								>
									{key}
								</button>
							))}
						</div>
					</Field>
					<Field
						label="Custom image"
						hint="Paste any image URL — Unsplash works great."
					>
						<div className="flex gap-2">
							<input
								className="field"
								value={imageUrl}
								onChange={(event) => setImageUrl(event.target.value)}
								placeholder="https://images.unsplash.com/…"
							/>
							<button
								type="button"
								className="btn-outline"
								disabled={!/^https:\/\//.test(imageUrl)}
								onClick={() =>
									set({ background: { type: "image", value: imageUrl } })
								}
							>
								Use
							</button>
						</div>
					</Field>
				</Section>

				<Section title="Start page">
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
					<div>
						<Toggle
							label="Search bar"
							checked={settings.showSearch}
							onChange={(showSearch) => set({ showSearch })}
						/>
						<Toggle
							label="Clock"
							checked={settings.showClock}
							onChange={(showClock) => set({ showClock })}
						/>
						<Toggle
							label="Greeting & date"
							checked={settings.showGreeting}
							onChange={(showGreeting) => set({ showGreeting })}
						/>
						<Toggle
							label="24-hour clock"
							checked={settings.clockFormat === "24h"}
							onChange={(on) => set({ clockFormat: on ? "24h" : "12h" })}
						/>
						<Toggle
							label="Open bookmarks in a new tab"
							checked={settings.openInNewTab}
							onChange={(openInNewTab) => set({ openInNewTab })}
						/>
					</div>
				</Section>

				<Section title="Connect AI (MCP)">
					<ConnectAI />
				</Section>

				<Section title="Browser">
					<p className="text-sm text-muted">
						Make tabz your home page: set{" "}
						<span className="font-mono text-ink">
							{typeof window === "undefined" ? "" : window.location.origin}
						</span>{" "}
						as your browser's start page. The tabz extension also adds the page
						you're on in one click and can replace your new tab page.
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
		</Modal>
	);
}

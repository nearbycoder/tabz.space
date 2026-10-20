import { useQueryClient } from "@tanstack/react-query";
import {
	BookOpen,
	ChevronRight,
	ClipboardPaste,
	Loader2,
	Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ColorSwatches, Field, Toggle } from "#/components/ui/controls";
import { Favicon } from "#/components/ui/Favicon";
import { Modal } from "#/components/ui/Modal";
import { call, run } from "#/lib/api";
import { celebrate } from "#/lib/celebrate";
import { homeKey, useHomeAction } from "#/lib/home-query";
import { ACCENTS } from "#/lib/preferences";
import { faviconFor, normalizeUrl, titleFromUrl } from "#/lib/url";
import { sealContents } from "#/lib/vault-session";
import type { HomeData } from "#/server/home";
import {
	createBookmark,
	deleteBookmark,
	lookupUrl,
	updateBookmark,
} from "#/server/home";
import {
	findInTree,
	flattenTree,
	type HomeBoard,
	type LinkItem,
	patchBookmark,
	removeFromTree,
	type TreeItem,
} from "./types";

type Props = {
	boards: HomeBoard[];
	groupId: string;
	bookmark?: LinkItem;
	/** Folder to save into (new bookmarks). */
	parentId?: string | null;
	/** Fire confetti when a bookmark is added. */
	festive?: boolean;
	initialUrl?: string;
	initialTitle?: string;
	onClose: () => void;
	onSaved?: () => void;
	asPage?: boolean;
};

export function BookmarkForm({
	boards,
	groupId,
	bookmark,
	parentId,
	festive,
	initialUrl,
	initialTitle,
	onClose,
	onSaved,
}: Omit<Props, "asPage">) {
	const [url, setUrl] = useState(bookmark?.url ?? initialUrl ?? "");
	const [title, setTitle] = useState(bookmark?.title ?? initialTitle ?? "");
	const [description, setDescription] = useState(bookmark?.description ?? "");
	const [icon, setIcon] = useState(bookmark?.icon ?? "");
	const [color, setColor] = useState<string | null>(bookmark?.color ?? null);
	const [incognito, setIncognito] = useState(bookmark?.incognito ?? false);
	const [moreOpen, setMoreOpen] = useState(
		Boolean(
			bookmark?.description ||
				bookmark?.icon ||
				bookmark?.color ||
				bookmark?.incognito,
		),
	);
	const [targetGroup, setTargetGroup] = useState(bookmark?.groupId ?? groupId);
	const inVault = Boolean(
		boards.find((b) => b.groups.some((g) => g.id === targetGroup))?.vault,
	);
	const [targetFolder, setTargetFolder] = useState<string | null>(
		bookmark?.parentId ?? parentId ?? null,
	);
	const [favicon, setFavicon] = useState<string | undefined>(
		bookmark?.meta.favicon,
	);
	const [image, setImage] = useState<string | null>(
		bookmark?.meta.image ?? null,
	);
	const [duplicates, setDuplicates] = useState<
		{ id: string; title: string; path: string }[]
	>([]);
	const [siteName, setSiteName] = useState<string | null>(
		bookmark?.meta.siteName ?? null,
	);
	const [looking, setLooking] = useState(false);
	const [lookedUp, setLookedUp] = useState(bookmark?.url ?? "");
	const submitButton = useRef<HTMLButtonElement>(null);
	const queryClient = useQueryClient();
	// Encrypted vault: the server must never see this link, so no lookups.
	const sealedTarget =
		Boolean(
			boards.find((b) => b.groups.some((g) => g.id === targetGroup))?.vault,
		) && Boolean(queryClient.getQueryData<HomeData>(homeKey)?.vault.encrypted);
	// Every folder in the group, nested ones indented. A folder can't be
	// moved into itself or anything inside it.
	const excluded = new Set(
		bookmark?.kind === "folder"
			? [
					bookmark.id,
					...flattenTree(
						findInTree(
							boards.flatMap((b) => b.groups).flatMap((g) => g.bookmarks),
							bookmark.id,
						)?.item.children ?? [],
					).map((i) => i.id),
				]
			: [],
	);
	const folders: (TreeItem & { depth: number })[] = [];
	const collect = (items: TreeItem[], depth: number) => {
		for (const item of items)
			if (item.kind === "folder" && !excluded.has(item.id)) {
				folders.push({ ...item, depth });
				collect(item.children, depth + 1);
			}
	};
	collect(
		boards.flatMap((b) => b.groups).find((g) => g.id === targetGroup)
			?.bookmarks ?? [],
		0,
	);

	const done = () => (onSaved ? onSaved() : onClose());
	const create = useHomeAction(createBookmark, {
		success: "Bookmark added",
		onSuccess: () => {
			if (festive) celebrate(submitButton.current);
			done();
		},
	});
	const update = useHomeAction(updateBookmark, {
		onSuccess: done,
		// Edits in place show at once; moves and vault items wait for the server.
		optimistic: (data, input) =>
			!bookmark ||
			input.sealed ||
			input.groupId !== bookmark.groupId ||
			(input.parentId ?? null) !== bookmark.parentId
				? data
				: patchBookmark(data, input.id, {
						title: input.title || bookmark.title,
						url: (input.url && normalizeUrl(input.url)) || bookmark.url,
						description:
							input.description === undefined
								? bookmark.description
								: input.description,
						icon: input.icon === undefined ? bookmark.icon : input.icon,
						color: input.color === undefined ? bookmark.color : input.color,
						incognito: input.incognito ?? bookmark.incognito,
					}),
	});
	const remove = useHomeAction(deleteBookmark, {
		undoable: () => `Deleted “${bookmark?.title}”`,
		optimistic: (data, input) => ({
			...data,
			boards: data.boards.map((b) => ({
				...b,
				groups: b.groups.map((g) => ({
					...g,
					bookmarks: removeFromTree(g.bookmarks, input.id),
				})),
			})),
		}),
		onSuccess: onClose,
	});

	// Fill in title/description from the page itself, without clobbering user edits.
	const lookup = () => lookupUrlValue(url);
	async function lookupUrlValue(value: string) {
		const normalized = normalizeUrl(value);
		if (!normalized || normalized === lookedUp) return;
		setLookedUp(normalized);
		setFavicon(faviconFor(normalized, 128));
		if (sealedTarget) return;
		setLooking(true);
		try {
			const meta = await run(call(lookupUrl, { url: normalized }));
			setTitle((current) => current || meta.title);
			setDescription((current) => current || meta.description || "");
			setFavicon(meta.favicon);
			setImage(meta.image);
			setSiteName(meta.siteName);
			setDuplicates(
				bookmark
					? meta.duplicates.filter((d) => d.id !== bookmark.id)
					: meta.duplicates,
			);
		} catch {
			// Metadata is a nice-to-have; saving still works without it.
		} finally {
			setLooking(false);
		}
	}

	// Prefilled links (extension, ⌘K "save") get their details right away.
	// biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
	useEffect(() => {
		if (initialUrl && !bookmark) lookup();
	}, []);

	const pending = create.isPending || update.isPending;
	const submit = async () => {
		if (sealedTarget) {
			const normalized = normalizeUrl(url);
			if (!normalized) {
				toast.error("That doesn't look like a link");
				return;
			}
			try {
				const sealed = await sealContents({
					title: title.trim() || titleFromUrl(normalized),
					url: normalized,
					description: description.trim() || null,
					tags: bookmark?.tags ?? [],
					icon: icon.trim() || null,
					favicon: favicon ?? faviconFor(normalized),
				});
				if (bookmark)
					update.mutate({
						id: bookmark.id,
						groupId: targetGroup,
						parentId: targetFolder,
						color,
						incognito,
						sealed,
					});
				else
					create.mutate({
						groupId: targetGroup,
						parentId: targetFolder,
						url: "",
						color,
						incognito,
						sealed,
					});
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Couldn't encrypt",
				);
			}
			return;
		}
		const fields = {
			url,
			title: title.trim() || undefined,
			description: description.trim() || null,
			icon: icon.trim() || null,
			color,
			incognito,
		};
		if (bookmark)
			update.mutate({
				id: bookmark.id,
				groupId: targetGroup,
				parentId: targetFolder,
				...fields,
			});
		else
			create.mutate({
				groupId: targetGroup,
				parentId: targetFolder,
				favicon,
				image,
				siteName,
				...fields,
			});
	};

	return (
		<form
			className="space-y-4"
			onSubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			{image && (
				<div className="animate-pop -mt-1 aspect-[2/1] overflow-hidden rounded-2xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]">
					<img
						src={image}
						alt=""
						referrerPolicy="no-referrer"
						onError={() => setImage(null)}
						className="size-full object-cover"
					/>
				</div>
			)}
			<div className="flex items-center gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] p-3">
				<div className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-2">
					{normalizeUrl(url) ? (
						<Favicon
							url={normalizeUrl(url) ?? url}
							icon={icon}
							favicon={favicon}
							sealed={sealedTarget}
							title={title}
							color={color}
							className="size-7 text-2xl"
						/>
					) : (
						<span className="text-muted">?</span>
					)}
				</div>
				<div className="min-w-0 text-sm">
					<div className="truncate font-medium">{title || "New bookmark"}</div>
					<div className="flex items-center gap-1.5 truncate text-xs text-muted">
						{looking && <Loader2 className="size-3 animate-spin" />}
						{looking
							? "Fetching page details…"
							: url || "Paste a link to get started"}
					</div>
				</div>
			</div>
			<Field label="URL">
				<div className="flex gap-2">
					<input
						className="field"
						value={url}
						onChange={(event) => setUrl(event.target.value)}
						onBlur={lookup}
						onPaste={() => setTimeout(lookup, 0)}
						placeholder="github.com"
						required
						autoFocus={!bookmark && !initialUrl}
						inputMode="url"
						autoCapitalize="none"
						autoCorrect="off"
						spellCheck={false}
						enterKeyHint="next"
					/>
					{!url &&
						typeof navigator !== "undefined" &&
						"clipboard" in navigator && (
							<button
								type="button"
								className="btn-outline shrink-0"
								onClick={async () => {
									const text = (
										await navigator.clipboard.readText().catch(() => "")
									).trim();
									if (!text) return;
									setUrl(text);
									setTimeout(() => lookupUrlValue(text), 0);
								}}
							>
								<ClipboardPaste className="size-4" /> Paste
							</button>
						)}
				</div>
			</Field>
			{duplicates.length > 0 && (
				<p className="-mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
					Already saved in{" "}
					<span className="font-medium">{duplicates[0].path}</span>
					{duplicates.length > 1
						? ` and ${duplicates.length - 1} more place${duplicates.length > 2 ? "s" : ""}`
						: ""}
					. You can still save it again.
				</p>
			)}
			{bookmark &&
				bookmark.meta.health?.status === "broken" &&
				bookmark.meta.archive?.url && (
					<p className="-mt-2 flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
						<span>
							This page looks gone. The Wayback Machine has a copy
							{bookmark.meta.archive.at
								? ` from ${new Date(bookmark.meta.archive.at).toLocaleDateString(undefined, { year: "numeric", month: "short" })}`
								: ""}
							.
						</span>
						<a
							href={bookmark.meta.archive.url}
							target="_blank"
							rel="noopener noreferrer"
							className="shrink-0 font-medium text-accent hover:underline"
						>
							Open archived copy
						</a>
					</p>
				)}
			{bookmark && !inVault && bookmark.kind === "link" && (
				<a
					href={`/read/${bookmark.id}`}
					className="-mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
				>
					<BookOpen className="size-3.5" /> Read in reader view
				</a>
			)}
			<Field label="Title">
				<input
					className="field"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="Auto-detected from the page"
					maxLength={200}
				/>
			</Field>
			<div className={folders.length > 0 ? "grid grid-cols-2 gap-3" : ""}>
				<Field label="Group">
					<select
						className="field"
						value={targetGroup}
						onChange={(event) => setTargetGroup(event.target.value)}
					>
						{boards.map((board) => (
							<optgroup
								key={board.id}
								label={`${board.icon ?? ""} ${board.name}`.trim()}
							>
								{board.groups
									.filter((group) => group.kind === "links")
									.map((group) => (
										<option key={group.id} value={group.id}>
											{group.name}
										</option>
									))}
							</optgroup>
						))}
					</select>
				</Field>
				{folders.length > 0 && (
					<Field label="Folder">
						<select
							className="field"
							value={targetFolder ?? ""}
							onChange={(event) => setTargetFolder(event.target.value || null)}
						>
							<option value="">No folder</option>
							{folders.map((folder) => (
								<option key={folder.id} value={folder.id}>
									{`${"\u00a0\u00a0\u00a0".repeat(folder.depth)}${folder.icon ?? "📁"} ${folder.title}`}
								</option>
							))}
						</select>
					</Field>
				)}
			</div>
			{/* Less common settings stay out of the way until needed. */}
			<details
				open={moreOpen}
				onToggle={(event) => setMoreOpen(event.currentTarget.open)}
				className="group/more"
			>
				<summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-muted select-none hover:text-ink [&::-webkit-details-marker]:hidden">
					<ChevronRight className="size-4 transition group-open/more:rotate-90" />
					More options
					{!moreOpen && (description || icon || color || incognito) && (
						<span
							className="size-1.5 rounded-full bg-accent"
							title="Some options are set"
						/>
					)}
				</summary>
				<div className="mt-4 space-y-4">
					<Field label="Description">
						<input
							className="field"
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							placeholder="Optional"
							maxLength={500}
						/>
					</Field>
					<Field label="Icon">
						<input
							className="field"
							value={icon}
							onChange={(event) => setIcon(event.target.value)}
							placeholder="Emoji or image URL"
						/>
					</Field>
					<Toggle
						label="🕶️ Always open in incognito"
						checked={incognito}
						onChange={setIncognito}
					/>
					{!incognito &&
						targetFolder &&
						folders.find((f) => f.id === targetFolder)?.incognito && (
							<p className="-mt-2 text-xs text-muted">
								Opens privately anyway: its folder is set to incognito.
							</p>
						)}
					<Field label="Tint">
						<ColorSwatches
							value={color}
							colors={ACCENTS}
							onChange={setColor}
							allowNone
						/>
					</Field>
				</div>
			</details>
			{/* Pinned to the bottom of the sheet so it's always reachable. */}
			<div className="sticky bottom-0 -mx-6 flex items-center gap-2 border-t border-line bg-surface-2 px-6 pt-3 pb-1 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pt-2">
				{bookmark && (
					<button
						type="button"
						className="btn-ghost text-red-500"
						onClick={() => remove.mutate({ id: bookmark.id })}
						disabled={remove.isPending}
					>
						<Trash2 className="size-4" /> Delete
					</button>
				)}
				<button type="button" className="btn-ghost ml-auto" onClick={onClose}>
					Cancel
				</button>
				<button
					ref={submitButton}
					type="submit"
					className="btn-primary"
					disabled={pending || !url.trim()}
				>
					{pending && <Loader2 className="size-4 animate-spin" />}
					{bookmark ? "Save" : "Add bookmark"}
				</button>
			</div>
		</form>
	);
}

export function BookmarkDialog(props: Props) {
	return (
		<Modal
			open
			onClose={props.onClose}
			title={props.bookmark ? "Edit bookmark" : "Add bookmark"}
		>
			<BookmarkForm {...props} />
		</Modal>
	);
}

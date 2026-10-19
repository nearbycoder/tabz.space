import { Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ColorSwatches, Field } from "#/components/ui/controls";
import { Favicon } from "#/components/ui/Favicon";
import { Modal } from "#/components/ui/Modal";
import { call, run } from "#/lib/api";
import { celebrate } from "#/lib/celebrate";
import { useHomeAction } from "#/lib/home-query";
import { ACCENTS } from "#/lib/preferences";
import { faviconFor, normalizeUrl } from "#/lib/url";
import {
	createBookmark,
	deleteBookmark,
	lookupUrl,
	updateBookmark,
} from "#/server/home";
import type { HomeBoard, LinkItem } from "./types";

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
	const [targetGroup, setTargetGroup] = useState(bookmark?.groupId ?? groupId);
	const [targetFolder, setTargetFolder] = useState<string | null>(
		bookmark?.parentId ?? parentId ?? null,
	);
	const [favicon, setFavicon] = useState<string | undefined>(
		bookmark?.meta.favicon,
	);
	const [image, setImage] = useState<string | null>(
		bookmark?.meta.image ?? null,
	);
	const [siteName, setSiteName] = useState<string | null>(
		bookmark?.meta.siteName ?? null,
	);
	const [looking, setLooking] = useState(false);
	const [lookedUp, setLookedUp] = useState(bookmark?.url ?? "");
	const submitButton = useRef<HTMLButtonElement>(null);
	const folders =
		boards
			.flatMap((b) => b.groups)
			.find((g) => g.id === targetGroup)
			?.bookmarks.filter((item) => item.kind === "folder") ?? [];

	const done = () => (onSaved ? onSaved() : onClose());
	const create = useHomeAction(createBookmark, {
		success: "Bookmark added",
		onSuccess: () => {
			if (festive) celebrate(submitButton.current);
			done();
		},
	});
	const update = useHomeAction(updateBookmark, { onSuccess: done });
	const remove = useHomeAction(deleteBookmark, {
		optimistic: (data, input) => ({
			...data,
			boards: data.boards.map((b) => ({
				...b,
				groups: b.groups.map((g) => ({
					...g,
					bookmarks: g.bookmarks
						.filter((x) => x.id !== input.id)
						.map((x) => ({
							...x,
							children: x.children.filter((c) => c.id !== input.id),
						})),
				})),
			})),
		}),
		onSuccess: onClose,
	});

	// Fill in title/description from the page itself, without clobbering user edits.
	const lookup = async () => {
		const normalized = normalizeUrl(url);
		if (!normalized || normalized === lookedUp) return;
		setLookedUp(normalized);
		setFavicon(faviconFor(normalized, 128));
		setLooking(true);
		try {
			const meta = await run(call(lookupUrl, { url: normalized }));
			setTitle((current) => current || meta.title);
			setDescription((current) => current || meta.description || "");
			setFavicon(meta.favicon);
			setImage(meta.image);
			setSiteName(meta.siteName);
		} catch {
			// Metadata is a nice-to-have; saving still works without it.
		} finally {
			setLooking(false);
		}
	};

	// Prefilled links (extension, ⌘K "save") get their details right away.
	// biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
	useEffect(() => {
		if (initialUrl && !bookmark) lookup();
	}, []);

	const pending = create.isPending || update.isPending;
	const submit = () => {
		const fields = {
			url,
			title: title.trim() || undefined,
			description: description.trim() || null,
			icon: icon.trim() || null,
			color,
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
				submit();
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
				<input
					className="field"
					value={url}
					onChange={(event) => setUrl(event.target.value)}
					onBlur={lookup}
					onPaste={() => setTimeout(lookup, 0)}
					placeholder="github.com"
					required
					autoFocus={!bookmark}
					inputMode="url"
				/>
			</Field>
			<Field label="Title">
				<input
					className="field"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="Auto-detected from the page"
					maxLength={200}
				/>
			</Field>
			<Field label="Description">
				<input
					className="field"
					value={description}
					onChange={(event) => setDescription(event.target.value)}
					placeholder="Optional"
					maxLength={500}
				/>
			</Field>
			<div className="grid grid-cols-2 gap-3">
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
								{board.groups.map((group) => (
									<option key={group.id} value={group.id}>
										{group.name}
									</option>
								))}
							</optgroup>
						))}
					</select>
				</Field>
				<Field label="Icon">
					<input
						className="field"
						value={icon}
						onChange={(event) => setIcon(event.target.value)}
						placeholder="Emoji or image URL"
					/>
				</Field>
			</div>
			{folders.length > 0 && bookmark?.kind !== "folder" && (
				<Field label="Folder">
					<select
						className="field"
						value={targetFolder ?? ""}
						onChange={(event) => setTargetFolder(event.target.value || null)}
					>
						<option value="">No folder</option>
						{folders.map((folder) => (
							<option key={folder.id} value={folder.id}>
								{`${folder.icon ?? "📁"} ${folder.title}`}
							</option>
						))}
					</select>
				</Field>
			)}
			<Field label="Tint">
				<ColorSwatches
					value={color}
					colors={ACCENTS}
					onChange={setColor}
					allowNone
				/>
			</Field>
			<div className="flex items-center gap-2 pt-2">
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

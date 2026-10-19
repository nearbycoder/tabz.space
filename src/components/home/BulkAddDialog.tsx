import { ClipboardPaste, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Field, Toggle } from "#/components/ui/controls";
import { Modal } from "#/components/ui/Modal";
import { celebrate } from "#/lib/celebrate";
import { useHomeAction } from "#/lib/home-query";
import { extractUrls, hostnameOf } from "#/lib/url";
import { bulkCreateBookmarks } from "#/server/home";
import type { HomeBoard } from "./types";

/** Paste a list (or any text) and save every link in it at once. */
export function BulkAddDialog({
	boards,
	groupId,
	initialText = "",
	festive,
	onClose,
}: {
	boards: HomeBoard[];
	groupId: string;
	initialText?: string;
	festive?: boolean;
	onClose: () => void;
}) {
	const [text, setText] = useState(initialText);
	const [target, setTarget] = useState(groupId);
	const [skipDuplicates, setSkipDuplicates] = useState(true);
	const urls = useMemo(() => extractUrls(text), [text]);
	const add = useHomeAction(bulkCreateBookmarks, {
		onSuccess: (result) => {
			if (festive && result.added) celebrate();
			onClose();
		},
		undoable: "Links added",
	});

	return (
		<Modal open onClose={onClose} title="Paste links">
			<div className="space-y-4">
				<Field
					label="Links"
					hint="Paste anything: a list of URLs, notes, Markdown, an email. Every link in it gets saved."
				>
					<div className="relative">
						<textarea
							className="field min-h-36 resize-y font-mono text-sm sm:text-xs"
							value={text}
							onChange={(event) => setText(event.target.value)}
							placeholder={
								"https://github.com\nhttps://news.ycombinator.com\nnotion.so"
							}
							autoFocus={!initialText}
						/>
						{!text && "clipboard" in navigator && (
							<button
								type="button"
								className="btn-outline absolute right-2 bottom-2 text-xs"
								onClick={async () =>
									setText(await navigator.clipboard.readText().catch(() => ""))
								}
							>
								<ClipboardPaste className="size-3.5" /> Paste
							</button>
						)}
					</div>
				</Field>
				{urls.length > 0 && (
					<div className="max-h-32 overflow-y-auto rounded-xl bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] p-2 text-xs">
						{urls.slice(0, 50).map((url) => (
							<p key={url} className="truncate text-muted">
								{hostnameOf(url.startsWith("http") ? url : `https://${url}`)} ·{" "}
								{url}
							</p>
						))}
						{urls.length > 50 && (
							<p className="text-muted">…and {urls.length - 50} more</p>
						)}
					</div>
				)}
				<Field label="Save to">
					<select
						className="field"
						value={target}
						onChange={(event) => setTarget(event.target.value)}
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
				<Toggle
					label="Skip links I've already saved"
					checked={skipDuplicates}
					onChange={setSkipDuplicates}
				/>
				<div className="flex justify-end gap-2 pt-1">
					<button type="button" className="btn-ghost" onClick={onClose}>
						Cancel
					</button>
					<button
						type="button"
						className="btn-primary"
						disabled={!urls.length || add.isPending}
						onClick={() =>
							add.mutate({
								groupId: target,
								urls: urls.slice(0, 200),
								skipDuplicates,
							})
						}
					>
						{add.isPending && <Loader2 className="size-4 animate-spin" />}
						Save {urls.length || ""} link{urls.length === 1 ? "" : "s"}
					</button>
				</div>
			</div>
		</Modal>
	);
}

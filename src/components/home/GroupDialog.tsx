import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { ColorSwatches, Field, Segmented } from "#/components/ui/controls";
import { Modal } from "#/components/ui/Modal";
import { useHomeAction } from "#/lib/home-query";
import {
	ACCENTS,
	DEFAULT_SMART_RULES,
	SMART_SORTS,
	type SmartRules,
	type SmartSort,
	type TileStyle,
} from "#/lib/preferences";
import { createGroup, deleteGroup, updateGroup } from "#/server/home";
import type { HomeBoard, HomeGroup } from "./types";

type Props = {
	boards: HomeBoard[];
	boardId: string;
	group?: HomeGroup;
	onClose: () => void;
};

export function GroupDialog({ boards, boardId, group, onClose }: Props) {
	const board = boards.find((b) => b.id === boardId);
	const [name, setName] = useState(group?.name ?? "");
	const [color, setColor] = useState<string | null>(group?.color ?? ACCENTS[0]);
	const [style, setStyle] = useState<TileStyle | "inherit">(
		group?.options.tileStyle ?? "inherit",
	);
	const [span, setSpan] = useState(group?.options.span ?? 1);
	const [targetBoard, setTargetBoard] = useState(boardId);
	const [kind, setKind] = useState<"links" | "smart">(
		group?.kind === "smart" ? "smart" : "links",
	);
	const [rules, setRules] = useState<SmartRules>(
		group?.options.smart ?? DEFAULT_SMART_RULES,
	);
	const [tagText, setTagText] = useState(rules.tags?.join(", ") ?? "");
	const smartOptions = () => ({
		smart: {
			...rules,
			query: rules.query?.trim() || undefined,
			tags: tagText
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean)
				.slice(0, 10),
		},
	});
	const [confirming, setConfirming] = useState(false);

	const create = useHomeAction(createGroup, { onSuccess: onClose });
	const update = useHomeAction(updateGroup, { onSuccess: onClose });
	const remove = useHomeAction(deleteGroup, {
		undoable: () => `Deleted group “${group?.name}”`,
		optimistic: (data, input) => ({
			...data,
			boards: data.boards.map((b) => ({
				...b,
				groups: b.groups.filter((g) => g.id !== input.id),
			})),
		}),
		onSuccess: onClose,
	});
	const pending = create.isPending || update.isPending;
	const maxSpan = board?.layout.columns ?? 3;

	const submit = () => {
		if (group) {
			update.mutate({
				id: group.id,
				name,
				color,
				boardId: targetBoard,
				options: {
					tileStyle: style === "inherit" ? undefined : style,
					span,
					...(kind === "smart" ? smartOptions() : {}),
				},
			});
		} else if (kind === "smart") {
			create.mutate({ boardId, name, color, kind, options: smartOptions() });
		} else {
			create.mutate({ boardId, name, color });
		}
	};

	return (
		<Modal open onClose={onClose} title={group ? "Edit group" : "New group"}>
			<form
				className="space-y-4"
				onSubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				{!group && (
					<Segmented
						value={kind}
						onChange={setKind}
						options={[
							{ value: "links", label: "Links" },
							{ value: "smart", label: "✨ Smart" },
						]}
					/>
				)}
				<Field label="Name">
					<input
						className="field"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Work, News, Tools…"
						required
						maxLength={60}
						autoFocus
					/>
				</Field>
				{kind === "smart" && (
					<div className="space-y-3 rounded-2xl border border-line p-3">
						<p className="flex items-center gap-1.5 text-xs text-muted">
							<Sparkles className="size-3.5 text-accent" /> Fills itself from
							all your boards and stays up to date.
						</p>
						<Field label="Show">
							<select
								className="field"
								value={rules.sort}
								onChange={(event) =>
									setRules({ ...rules, sort: event.target.value as SmartSort })
								}
							>
								{Object.entries(SMART_SORTS).map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
						</Field>
						<div className="grid gap-3 sm:grid-cols-2">
							<Field label="With tags">
								<input
									className="field"
									value={tagText}
									onChange={(event) => setTagText(event.target.value)}
									placeholder="Any (comma separated)"
								/>
							</Field>
							<Field label="Containing">
								<input
									className="field"
									value={rules.query ?? ""}
									onChange={(event) =>
										setRules({ ...rules, query: event.target.value })
									}
									placeholder="Any text"
									maxLength={100}
								/>
							</Field>
						</div>
						{boards.length > 1 && (
							<Field label="From">
								<select
									className="field"
									value={rules.boardId ?? ""}
									onChange={(event) =>
										setRules({
											...rules,
											boardId: event.target.value || undefined,
										})
									}
								>
									<option value="">All boards</option>
									{boards
										.filter((b) => !b.vault)
										.map((b) => (
											<option key={b.id} value={b.id}>
												{`${b.icon ?? ""} ${b.name}`.trim()}
											</option>
										))}
								</select>
							</Field>
						)}
						<Field label="Up to">
							<Segmented
								value={rules.limit}
								onChange={(limit) => setRules({ ...rules, limit })}
								options={[6, 12, 24, 48].map((value) => ({
									value,
									label: String(value),
								}))}
							/>
						</Field>
					</div>
				)}
				<Field label="Color">
					<ColorSwatches
						value={color}
						colors={ACCENTS}
						onChange={setColor}
						allowNone
					/>
				</Field>
				{group && (
					<>
						<Field label="Tile style">
							<Segmented
								value={style}
								onChange={setStyle}
								options={[
									{ value: "inherit", label: "Board" },
									{ value: "tile", label: "Tiles" },
									{ value: "card", label: "Cards" },
									{ value: "list", label: "List" },
									{ value: "icon", label: "Icons" },
									{ value: "gallery", label: "Previews" },
								]}
							/>
						</Field>
						{maxSpan > 1 && (
							<Field
								label="Width"
								hint="How many board columns this group spans on wide screens."
							>
								<Segmented
									value={Math.min(span, maxSpan)}
									onChange={setSpan}
									options={Array.from({ length: maxSpan }, (_, i) => ({
										value: i + 1,
										label: `${i + 1}×`,
									}))}
								/>
							</Field>
						)}
						{boards.length > 1 && (
							<Field label="Board">
								<select
									className="field"
									value={targetBoard}
									onChange={(event) => setTargetBoard(event.target.value)}
								>
									{boards.map((b) => (
										<option key={b.id} value={b.id}>
											{`${b.icon ?? ""} ${b.name}`.trim()}
										</option>
									))}
								</select>
							</Field>
						)}
					</>
				)}
				<div className="flex items-center gap-2 pt-2">
					{group &&
						(confirming ? (
							<button
								type="button"
								className="btn bg-red-500 text-white"
								onClick={() => remove.mutate({ id: group.id })}
							>
								{group.kind === "smart"
									? "Delete this group?"
									: `Delete ${group.bookmarks.length} bookmarks?`}
							</button>
						) : (
							<button
								type="button"
								className="btn-ghost text-red-500"
								onClick={() => setConfirming(true)}
							>
								<Trash2 className="size-4" /> Delete
							</button>
						))}
					<button type="button" className="btn-ghost ml-auto" onClick={onClose}>
						Cancel
					</button>
					<button
						type="submit"
						className="btn-primary"
						disabled={pending || !name.trim()}
					>
						{pending && <Loader2 className="size-4 animate-spin" />}
						{group ? "Save" : "Create"}
					</button>
				</div>
			</form>
		</Modal>
	);
}

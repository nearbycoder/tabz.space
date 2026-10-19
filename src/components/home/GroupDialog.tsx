import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Sparkles, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ColorSwatches, Field, Segmented } from "#/components/ui/controls";
import { Modal } from "#/components/ui/Modal";
import { call, run } from "#/lib/api";
import { cn } from "#/lib/cn";
import { useHomeAction } from "#/lib/home-query";
import {
	ACCENTS,
	DEFAULT_SMART_RULES,
	SMART_SORTS,
	type SmartRules,
	type SmartSort,
	type TileStyle,
	WIDGET_TYPES,
	type Widget,
} from "#/lib/preferences";
import {
	createGroup,
	deleteGroup,
	saveCustomWidget,
	updateGroup,
} from "#/server/home";
import type { HomeBoard, HomeGroup } from "./types";
import {
	defaultWidget,
	WidgetConfig,
	widgetReady,
} from "./widgets/WidgetConfig";
import { customWidgetsKey, WidgetGallery } from "./widgets/WidgetGallery";

type Props = {
	boards: HomeBoard[];
	boardId: string;
	group?: HomeGroup;
	/** Start a new group as links, smart or widget. */
	initialKind?: "links" | "smart" | "widget";
	onClose: () => void;
};

export function GroupDialog({
	boards,
	boardId,
	group,
	initialKind,
	onClose,
}: Props) {
	const board = boards.find((b) => b.id === boardId);
	const [name, setName] = useState(group?.name ?? "");
	const [color, setColor] = useState<string | null>(group?.color ?? ACCENTS[0]);
	const [style, setStyle] = useState<TileStyle | "inherit">(
		group?.options.tileStyle ?? "inherit",
	);
	const [span, setSpan] = useState(group?.options.span ?? 1);
	const [targetBoard, setTargetBoard] = useState(boardId);
	const [kind, setKind] = useState<"links" | "smart" | "widget">(
		group?.kind ?? initialKind ?? "links",
	);
	const [widget, setWidget] = useState<Widget>(
		group?.options.widget ?? defaultWidget("notes"),
	);
	// New widget groups start in the gallery; picking one moves on to its settings.
	const [picking, setPicking] = useState(!group);
	const configurable = !["notes", "todo"].includes(widget.type);
	const widgetIcon =
		"data" in widget && typeof widget.data.icon === "string"
			? widget.data.icon
			: WIDGET_TYPES[widget.type].icon;
	const queryClient = useQueryClient();
	const keep = useMutation({
		mutationFn: () =>
			run(
				call(saveCustomWidget, {
					name: name.trim() || WIDGET_TYPES[widget.type].label,
					icon: widgetIcon,
					widget,
				}),
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: customWidgetsKey });
			toast.success("Saved to My widgets");
		},
		onError: (error) => toast.error(error.message),
	});
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
					// Notes and to-dos keep their live content; only settings change here.
					...(kind === "widget" && configurable ? { widget } : {}),
				},
			});
		} else if (kind === "widget") {
			create.mutate({
				boardId,
				name: name.trim() || WIDGET_TYPES[widget.type].label,
				color,
				kind,
				options: { widget },
			});
		} else if (kind === "smart") {
			create.mutate({ boardId, name, color, kind, options: smartOptions() });
		} else {
			create.mutate({ boardId, name, color });
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			title={group ? "Edit group" : "New group"}
			// Room for the gallery and the code editors; simple settings stay compact.
			wide={
				kind === "widget" &&
				(picking || widget.type === "custom-html" || widget.type === "json-api")
			}
		>
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
							{ value: "widget", label: "🧩 Widget" },
						]}
					/>
				)}
				{kind === "widget" && picking ? (
					<WidgetGallery
						onPick={(type) => {
							setWidget(defaultWidget(type));
							setPicking(false);
						}}
						onPickSaved={(saved) => {
							setWidget(saved.widget);
							setName(saved.name);
							setPicking(false);
						}}
					/>
				) : (
					<>
						{kind === "widget" && !group && (
							<button
								type="button"
								className="flex items-center gap-1 text-sm text-muted hover:text-ink"
								onClick={() => setPicking(true)}
							>
								<ChevronLeft className="size-4" /> All widgets
								<span className="ml-1 text-ink">
									{widgetIcon} {WIDGET_TYPES[widget.type].label}
								</span>
							</button>
						)}
						<Field label={kind === "widget" ? "Icon & name" : "Name"}>
							<div className="flex gap-2">
								{kind === "widget" &&
									("data" in widget ? (
										<input
											className="field w-12 shrink-0 px-0 text-center text-xl"
											value={
												typeof widget.data.icon === "string"
													? widget.data.icon
													: ""
											}
											onChange={(event) => {
												const icon = [...event.target.value.trim()]
													.slice(0, 2)
													.join("");
												const { icon: _, ...rest } = widget.data;
												setWidget({
													...widget,
													data: icon ? { ...rest, icon } : rest,
												});
											}}
											placeholder={WIDGET_TYPES[widget.type].icon}
											title="Icon: type or paste an emoji (empty = default)"
											aria-label="Icon"
										/>
									) : (
										<span className="field grid w-12 shrink-0 place-items-center px-0 text-xl">
											{widgetIcon}
										</span>
									))}
								<input
									className="field"
									value={name}
									onChange={(event) => setName(event.target.value)}
									placeholder={
										kind === "widget"
											? WIDGET_TYPES[widget.type].label
											: "Work, News, Tools…"
									}
									required={kind !== "widget"}
									maxLength={60}
									autoFocus
								/>
							</div>
						</Field>
						{kind === "smart" && (
							<div className="space-y-3 rounded-2xl border border-line p-3">
								<p className="flex items-center gap-1.5 text-xs text-muted">
									<Sparkles className="size-3.5 text-accent" /> Fills itself
									from all your boards and stays up to date.
								</p>
								<Field label="Show">
									<select
										className="field"
										value={rules.sort}
										onChange={(event) =>
											setRules({
												...rules,
												sort: event.target.value as SmartSort,
											})
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
						{kind === "widget" && (
							<WidgetConfig widget={widget} onChange={setWidget} />
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
								{group.kind !== "widget" && (
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
								)}
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
					</>
				)}
				{kind === "widget" && !picking && "data" in widget && (
					<button
						type="button"
						className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-ink disabled:opacity-50"
						title="Keep this widget, with its settings, to add to any board later"
						disabled={keep.isPending || keep.isSuccess || !widgetReady(widget)}
						onClick={() => keep.mutate()}
					>
						<Star
							className={cn(
								"size-3.5",
								keep.isSuccess && "fill-amber-400 text-amber-400",
							)}
						/>
						{keep.isSuccess ? "Saved to My widgets" : "Save to My widgets"}
					</button>
				)}
				<div className="flex items-center gap-2 border-t border-line pt-4">
					{group &&
						(confirming ? (
							<button
								type="button"
								className="btn bg-red-500 text-white"
								onClick={() => remove.mutate({ id: group.id })}
							>
								{group.kind !== "links"
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
						disabled={
							pending ||
							(kind === "widget"
								? picking || !widgetReady(widget)
								: !name.trim())
						}
					>
						{pending && <Loader2 className="size-4 animate-spin" />}
						{group ? "Save" : "Create"}
					</button>
				</div>
			</form>
		</Modal>
	);
}

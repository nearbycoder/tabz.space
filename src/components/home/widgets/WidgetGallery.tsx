import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { call, run } from "#/lib/api";
import { cn } from "#/lib/cn";
import type { Widget } from "#/lib/preferences";
import { WIDGET_TYPES, type WidgetType } from "#/lib/widget-catalog";
import {
	WIDGET_CATEGORIES,
	WIDGET_DETAILS,
	type WidgetCategory,
} from "#/lib/widget-details";
import { deleteCustomWidget, listCustomWidgets } from "#/server/home";

export type SavedWidget = {
	id: string;
	name: string;
	icon: string;
	widget: Widget;
};

export const customWidgetsKey = ["custom-widgets"] as const;

const ALL = (Object.keys(WIDGET_TYPES) as WidgetType[]).map(
	(type) => [type, { ...WIDGET_TYPES[type], ...WIDGET_DETAILS[type] }] as const,
);

function Card({
	icon,
	label,
	description,
	onClick,
	onDelete,
}: {
	icon: string;
	label: string;
	description: string;
	onClick: () => void;
	onDelete?: () => void;
}) {
	return (
		<div className="group/card relative">
			<button
				type="button"
				onClick={onClick}
				className="focus-ring flex h-full w-full flex-col items-start gap-1 rounded-xl border border-line p-2.5 text-left transition hover:border-accent hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
			>
				<span className="text-2xl leading-none">{icon}</span>
				<span className="text-sm font-medium">{label}</span>
				<span className="line-clamp-2 text-xs text-muted">{description}</span>
			</button>
			{onDelete && (
				<button
					type="button"
					aria-label={`Remove ${label} from My widgets`}
					onClick={onDelete}
					className="icon-btn absolute top-1 right-1 size-6 opacity-0 group-hover/card:opacity-100 pointer-coarse:opacity-100"
				>
					<X className="size-3.5" />
				</button>
			)}
		</div>
	);
}

/** Every widget, searchable and grouped, plus the user's saved ones. */
export function WidgetGallery({
	onPick,
	onPickSaved,
}: {
	onPick: (type: WidgetType) => void;
	onPickSaved: (saved: SavedWidget) => void;
}) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [category, setCategory] = useState<WidgetCategory | "all" | "mine">(
		"all",
	);
	const saved = useQuery({
		queryKey: customWidgetsKey,
		queryFn: () => run(call(listCustomWidgets)) as Promise<SavedWidget[]>,
		staleTime: 60_000,
	});
	const remove = useMutation({
		mutationFn: (id: string) => run(call(deleteCustomWidget, { id })),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: customWidgetsKey });
			toast.success("Removed from My widgets");
		},
	});
	const term = search.trim().toLowerCase();
	const matches = (text: string) => !term || text.toLowerCase().includes(term);
	const mine = (saved.data ?? []).filter((item) => matches(item.name));
	const widgets = ALL.filter(
		([, meta]) =>
			(category === "all" || meta.category === category) &&
			matches(`${meta.label} ${meta.description} ${meta.category}`),
	);
	const sections =
		category === "mine"
			? []
			: (Object.keys(WIDGET_CATEGORIES) as WidgetCategory[])
					.map((key) => ({
						key,
						items: widgets.filter(([, meta]) => meta.category === key),
					}))
					.filter((section) => section.items.length > 0);

	return (
		<div className="space-y-3">
			<label className="relative block">
				<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
				<input
					className="field pl-9"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder={`Search ${ALL.length} widgets…`}
					aria-label="Search widgets"
					autoFocus
				/>
			</label>
			<div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
				{(
					[
						["all", "All"],
						...(saved.data?.length ? [["mine", "⭐ My widgets"]] : []),
						...Object.entries(WIDGET_CATEGORIES),
					] as [typeof category, string][]
				).map(([key, label]) => (
					<button
						key={key}
						type="button"
						onClick={() => setCategory(key)}
						className={cn(
							"focus-ring shrink-0 rounded-full border px-3 py-1 text-xs transition",
							category === key
								? "border-accent bg-accent text-white"
								: "border-line hover:border-accent",
						)}
					>
						{label}
					</button>
				))}
			</div>
			{(category === "all" || category === "mine") && mine.length > 0 && (
				<section className="space-y-1.5">
					<h3 className="text-xs font-medium text-muted">⭐ My widgets</h3>
					<div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
						{mine.map((item) => (
							<Card
								key={item.id}
								icon={item.icon}
								label={item.name}
								description={
									WIDGET_TYPES[item.widget.type as WidgetType]?.label ??
									"Widget"
								}
								onClick={() => onPickSaved(item)}
								onDelete={() => remove.mutate(item.id)}
							/>
						))}
					</div>
				</section>
			)}
			{sections.map((section) => (
				<section key={section.key} className="space-y-1.5">
					<h3 className="text-xs font-medium text-muted">
						{WIDGET_CATEGORIES[section.key]}
					</h3>
					<div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
						{section.items.map(([type, meta]) => (
							<Card
								key={type}
								icon={meta.icon}
								label={meta.label}
								description={meta.description}
								onClick={() => onPick(type)}
							/>
						))}
					</div>
				</section>
			))}
			{sections.length === 0 && mine.length === 0 && (
				<p className="py-6 text-center text-sm text-muted">
					No widgets match “{search}”
				</p>
			)}
		</div>
	);
}

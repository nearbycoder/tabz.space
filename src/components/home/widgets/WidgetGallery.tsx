import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Search, Share2, X } from "lucide-react";
import { type ReactNode, useState } from "react";
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
import {
	deleteCustomWidget,
	installSharedWidget,
	listCustomWidgets,
	listSharedWidgets,
	publishWidget,
	unpublishWidget,
} from "#/server/home";

export type SavedWidget = {
	id: string;
	name: string;
	icon: string;
	widget: Widget;
};

export const customWidgetsKey = ["custom-widgets"] as const;
const sharedKey = ["shared-widgets"] as const;
const SHAREABLE = new Set(["custom-html", "json-api"]);

const ALL = (Object.keys(WIDGET_TYPES) as WidgetType[]).map(
	(type) => [type, { ...WIDGET_TYPES[type], ...WIDGET_DETAILS[type] }] as const,
);

function Card({
	icon,
	label,
	description,
	onClick,
	onDelete,
	onShare,
	footer,
}: {
	icon: string;
	label: string;
	description: string;
	onClick: () => void;
	onDelete?: () => void;
	onShare?: () => void;
	footer?: ReactNode;
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
				{footer}
			</button>
			{(onDelete || onShare) && (
				<span className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover/card:opacity-100 pointer-coarse:opacity-100">
					{onShare && (
						<button
							type="button"
							aria-label={`Share ${label} with the community`}
							title="Share with the community"
							onClick={onShare}
							className="icon-btn size-6"
						>
							<Share2 className="size-3.5" />
						</button>
					)}
					{onDelete && (
						<button
							type="button"
							aria-label={`Remove ${label}`}
							onClick={onDelete}
							className="icon-btn size-6"
						>
							<X className="size-3.5" />
						</button>
					)}
				</span>
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
	const [category, setCategory] = useState<
		WidgetCategory | "all" | "mine" | "community"
	>("all");
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
	const shared = useQuery({
		queryKey: [...sharedKey, search.trim()],
		queryFn: () =>
			run(call(listSharedWidgets, { search: search.trim() || undefined })),
		enabled: category === "community",
		staleTime: 60_000,
		placeholderData: (previous) => previous,
	});
	const publish = useMutation({
		mutationFn: (data: { id: string; description?: string }) =>
			run(call(publishWidget, data)),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: sharedKey });
			toast.success("Shared with the community");
		},
		onError: (error) => toast.error(error.message),
	});
	const unpublish = useMutation({
		mutationFn: (id: string) => run(call(unpublishWidget, { id })),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: sharedKey });
			toast.success("Removed from the community");
		},
	});
	const install = useMutation({
		mutationFn: (id: string) => run(call(installSharedWidget, { id })),
		onSuccess: (item) => {
			queryClient.invalidateQueries({ queryKey: customWidgetsKey });
			onPickSaved(item as SavedWidget);
		},
		onError: (error) => toast.error(error.message),
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
		category === "mine" || category === "community"
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
						["community", "🌍 Community"],
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
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
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
								onShare={
									SHAREABLE.has(item.widget.type)
										? () => {
												const description = window.prompt(
													`Share “${item.name}” with everyone on tabz? Add a short description:`,
													"",
												);
												if (description !== null)
													publish.mutate({
														id: item.id,
														description: description.trim() || undefined,
													});
											}
										: undefined
								}
							/>
						))}
					</div>
				</section>
			)}
			{category === "community" && (
				<section className="space-y-1.5">
					<p className="text-xs text-muted">
						Widgets shared by other people. They run sandboxed: they can show
						things and fetch public data, but can't see your links or this page.
						Share your own from ⭐ My widgets.
					</p>
					{shared.isPending ? (
						<div className="flex justify-center py-6 text-muted">
							<Loader2 className="size-5 animate-spin" />
						</div>
					) : (shared.data ?? []).length === 0 ? (
						<p className="py-6 text-center text-sm text-muted">
							{search
								? `No shared widgets match “${search}”`
								: "Nothing shared yet. Be the first!"}
						</p>
					) : (
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
							{(shared.data ?? []).map((item) => (
								<Card
									key={item.id}
									icon={item.icon}
									label={item.name}
									description={
										item.description ||
										WIDGET_TYPES[item.widget.type as WidgetType]?.label ||
										"Widget"
									}
									footer={
										<span className="mt-auto flex items-center gap-1 pt-1 text-[11px] text-muted">
											<Download className="size-3" /> {item.installs} · by{" "}
											{item.author}
										</span>
									}
									onClick={() => install.mutate(item.id)}
									onDelete={
										item.mine ? () => unpublish.mutate(item.id) : undefined
									}
								/>
							))}
						</div>
					)}
				</section>
			)}
			{sections.map((section) => (
				<section key={section.key} className="space-y-1.5">
					<h3 className="text-xs font-medium text-muted">
						{WIDGET_CATEGORIES[section.key]}
					</h3>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
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
			{category !== "community" &&
				sections.length === 0 &&
				mine.length === 0 && (
					<p className="py-6 text-center text-sm text-muted">
						No widgets match “{search}”
					</p>
				)}
		</div>
	);
}

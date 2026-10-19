import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Code2, Download, Loader2, Share2, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { call, run } from "#/lib/api";
import { cn } from "#/lib/cn";
import { homeKey } from "#/lib/home-query";
import { resolveSettings, type UserSettings } from "#/lib/preferences";
import {
	applyTheme,
	deleteTheme,
	listThemes,
	publishTheme,
} from "#/server/home";
import { Backdrop } from "./Backdrop";

const themesKey = (sort: string) => ["themes", sort];

/** Browse, apply and publish community themes. */
export function CommunityThemes() {
	const queryClient = useQueryClient();
	const [sort, setSort] = useState<"popular" | "new">("popular");
	const themes = useQuery({
		queryKey: themesKey(sort),
		queryFn: () => run(call(listThemes, { sort })),
	});
	const [name, setName] = useState("");
	const [busy, setBusy] = useState<string | null>(null);

	const refresh = () => queryClient.invalidateQueries({ queryKey: ["themes"] });

	const publish = async (event: FormEvent) => {
		event.preventDefault();
		setBusy("publish");
		try {
			await run(call(publishTheme, { name }));
			toast.success("Theme published. Thanks for sharing!");
			setName("");
			setSort("new");
			await refresh();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Couldn't publish");
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-1">
				{(["popular", "new"] as const).map((value) => (
					<button
						key={value}
						type="button"
						onClick={() => setSort(value)}
						className={cn(
							"focus-ring rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition",
							sort === value
								? "bg-accent text-white"
								: "text-muted hover:text-ink",
						)}
					>
						{value}
					</button>
				))}
			</div>
			{themes.isPending ? (
				<div className="flex justify-center py-6 text-muted">
					<Loader2 className="size-5 animate-spin" />
				</div>
			) : themes.data?.length === 0 ? (
				<p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
					No community themes yet. Make your tabz look great and be the first to
					publish!
				</p>
			) : (
				<div className="grid grid-cols-2 gap-2">
					{themes.data?.map((theme) => {
						const look: UserSettings = resolveSettings(theme.settings);
						return (
							<div
								key={theme.id}
								className="overflow-hidden rounded-xl border border-line"
							>
								<div className="relative h-16 bg-[var(--canvas)]">
									<span className="absolute inset-0 [&>div]:!absolute">
										<Backdrop
											background={{ ...look.background, animate: false }}
										/>
									</span>
									<span
										className="absolute right-2 bottom-2 size-4 rounded-full ring-2 ring-white/70"
										style={{ background: look.accent }}
									/>
									{look.customCss && (
										<span
											className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] text-white"
											title="Includes custom CSS"
										>
											<Code2 className="size-3" /> CSS
										</span>
									)}
								</div>
								<div className="flex items-center gap-1 p-2">
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{theme.name}</p>
										<p className="truncate text-[11px] text-muted">
											{theme.author} · {theme.installs} use
											{theme.installs === 1 ? "" : "s"}
										</p>
									</div>
									{theme.mine && (
										<button
											type="button"
											className="icon-btn size-7"
											aria-label={`Unpublish ${theme.name}`}
											onClick={async () => {
												await run(call(deleteTheme, { id: theme.id })).catch(
													() => {},
												);
												await refresh();
											}}
										>
											<Trash2 className="size-3.5" />
										</button>
									)}
									<button
										type="button"
										className="icon-btn size-7"
										aria-label={`Apply ${theme.name}`}
										title="Apply"
										disabled={busy === theme.id}
										onClick={async () => {
											setBusy(theme.id);
											try {
												await run(call(applyTheme, { id: theme.id }));
												await Promise.all([
													queryClient.invalidateQueries({ queryKey: homeKey }),
													refresh(),
												]);
												toast.success(`Applied “${theme.name}”`, {
													description: "Undo by picking another theme.",
												});
											} catch (error) {
												toast.error(
													error instanceof Error
														? error.message
														: "Couldn't apply",
												);
											} finally {
												setBusy(null);
											}
										}}
									>
										{busy === theme.id ? (
											<Loader2 className="size-3.5 animate-spin" />
										) : (
											<Download className="size-3.5" />
										)}
									</button>
								</div>
							</div>
						);
					})}
				</div>
			)}
			<form onSubmit={publish} className="flex gap-2">
				<input
					className="field"
					placeholder="Name your current look…"
					value={name}
					onChange={(event) => setName(event.target.value)}
					maxLength={40}
				/>
				<button
					type="submit"
					className="btn-outline shrink-0"
					disabled={busy === "publish" || name.trim().length < 2}
				>
					{busy === "publish" ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Share2 className="size-4" />
					)}{" "}
					Publish
				</button>
			</form>
			<p className="text-xs text-muted">
				Publishing shares your colors, background, font, shape and custom CSS
				(external links in CSS are removed). Never your links.
			</p>
		</div>
	);
}

const SNIPPETS: { label: string; css: string }[] = [
	{
		label: "Pill tiles",
		css: "[data-tile] a, [data-tile] > div > button { border-radius: 9999px; }",
	},
	{
		label: "Neon glow",
		css: ".glass { box-shadow: 0 0 24px color-mix(in srgb, var(--accent) 45%, transparent); }",
	},
	{ label: "Hide clock", css: "[data-clock] { display: none; }" },
	{
		label: "Big titles",
		css: "[data-group] h2 { font-size: 1.05rem; letter-spacing: -0.01em; }",
	},
	{
		label: "No group cards",
		css: "[data-group].glass { background: transparent; border-color: transparent; box-shadow: none; backdrop-filter: none; }",
	},
];

/** A small editor for the user's own CSS, applied live. */
export function CustomCssEditor({
	value,
	onChange,
}: {
	value: string;
	onChange: (css: string) => void;
}) {
	return (
		<div className="space-y-2">
			<textarea
				value={value}
				onChange={(event) => onChange(event.target.value)}
				spellCheck={false}
				maxLength={20_000}
				rows={6}
				placeholder={'/* e.g. */\n[data-group="Work"] { --accent: #f97316; }'}
				aria-label="Custom CSS"
				className="field resize-y font-mono text-xs leading-relaxed"
			/>
			<div className="flex flex-wrap gap-1">
				{SNIPPETS.map((snippet) => (
					<button
						key={snippet.label}
						type="button"
						className="rounded-lg border border-line px-2 py-1 text-xs text-muted transition hover:text-ink"
						onClick={() =>
							onChange(`${value.trim()}\n${snippet.css}\n`.trimStart())
						}
					>
						+ {snippet.label}
					</button>
				))}
			</div>
			<p className="text-xs text-muted">
				Hooks: <code className="font-mono">--accent</code>,{" "}
				<code className="font-mono">--canvas</code>,{" "}
				<code className="font-mono">--ink</code>,{" "}
				<code className="font-mono">.glass</code>,{" "}
				<code className="font-mono">[data-group="Name"]</code>,{" "}
				<code className="font-mono">[data-kind="widget"]</code>,{" "}
				<code className="font-mono">[data-tile]</code>,{" "}
				<code className="font-mono">[data-clock]</code>,{" "}
				<code className="font-mono">[data-board="Name"]</code>. Applies to your
				home page only.
			</p>
		</div>
	);
}

import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Favicon } from "#/components/ui/Favicon";
import { Modal } from "#/components/ui/Modal";
import { call, run } from "#/lib/api";
import { useSaveSettings } from "#/lib/home-query";
import { hostnameOf } from "#/lib/url";
import { monthlyReport } from "#/server/home";
import { useHomeContext } from "./context";

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const monthKey = (date = new Date()) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const shift = (month: string, delta: number) => {
	const [y, m] = month.split("-").map(Number);
	return monthKey(new Date(y, m - 1 + delta, 1));
};

const monthName = (month: string) => {
	const [y, m] = month.split("-").map(Number);
	return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
		month: "long",
		year: "numeric",
	});
};

const useReport = (month: string, enabled = true) =>
	useQuery({
		queryKey: ["report", month],
		queryFn: () => run(call(monthlyReport, { month, zone: zone() })),
		enabled,
		staleTime: 5 * 60_000,
	});

function Stat({
	label,
	value,
	note,
}: {
	label: string;
	value: string | number;
	note?: string;
}) {
	return (
		<div className="rounded-2xl bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] p-3">
			<p className="text-2xl font-semibold tabular-nums">{value}</p>
			<p className="text-xs text-muted">{label}</p>
			{note && <p className="mt-0.5 text-[11px] text-accent">{note}</p>}
		</div>
	);
}

const hourLabel = (hour: number) =>
	new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: "numeric" });

/** "Your month in tabz": visits, favorites and habits for one month. */
export function MonthlyReportDialog({
	month: initial,
	onClose,
}: {
	month?: string;
	onClose: () => void;
}) {
	const [month, setMonth] = useState(initial ?? monthKey());
	const report = useReport(month);
	const data = report.data;
	const current = monthKey();
	const change =
		data && data.previousVisits >= 5
			? Math.round(
					((data.visits - data.previousVisits) / data.previousVisits) * 100,
				)
			: null;
	const max = data ? Math.max(1, ...data.perDay) : 1;
	const facts = data
		? [
				data.busiestHour !== null &&
					(data.busiestHour >= 21 || data.busiestHour < 5
						? `🦉 Night owl: you're busiest around ${hourLabel(data.busiestHour)}.`
						: data.busiestHour < 12
							? `🌅 Early bird: most of your clicks happen around ${hourLabel(data.busiestHour)}.`
							: `☀️ Your peak hour is ${hourLabel(data.busiestHour)}.`),
				data.busiestWeekday &&
					`📅 ${data.busiestWeekday}s are your busiest day.`,
				data.topAddedHost &&
					data.added > 1 &&
					`📌 You saved the most from ${data.topAddedHost}.`,
				(data.changes.update ?? 0) + (data.changes.move ?? 0) > 0 &&
					`🧹 ${(data.changes.update ?? 0) + (data.changes.move ?? 0)} tidy-ups (edits and moves).`,
				data.broken > 0 &&
					`🩺 ${data.broken} broken link${data.broken === 1 ? "" : "s"} to clean up.`,
			].filter(Boolean)
		: [];

	return (
		<Modal open onClose={onClose} title="Your month in tabz">
			<div className="space-y-5">
				<div className="flex items-center justify-between">
					<button
						type="button"
						className="icon-btn size-8"
						aria-label="Previous month"
						onClick={() => setMonth(shift(month, -1))}
					>
						<ChevronLeft className="size-4" />
					</button>
					<p className="font-semibold">
						{monthName(month)}
						{month === current && (
							<span className="ml-1.5 text-xs font-normal text-muted">
								so far
							</span>
						)}
					</p>
					<button
						type="button"
						className="icon-btn size-8"
						aria-label="Next month"
						disabled={month >= current}
						onClick={() => setMonth(shift(month, 1))}
					>
						<ChevronRight className="size-4" />
					</button>
				</div>
				{report.isPending ? (
					<div className="flex justify-center py-12 text-muted">
						<Loader2 className="size-5 animate-spin" />
					</div>
				) : !data ? (
					<p className="py-8 text-center text-sm text-muted">
						{report.error?.message ?? "Couldn't load the report"}
					</p>
				) : (
					<>
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
							<Stat
								label="links opened"
								value={data.visits}
								note={
									change === null
										? undefined
										: `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% vs last month`
								}
							/>
							<Stat label="active days" value={data.activeDays} />
							<Stat label="links saved" value={data.added} />
							<Stat label="in your library" value={data.librarySize} />
						</div>
						<div>
							<p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
								Daily activity
							</p>
							<div
								className="flex h-20 items-end gap-[2px]"
								role="img"
								aria-label="Links opened per day"
							>
								{data.perDay.map((count, index) => (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: the index is the day of the month
										key={index}
										title={`${index + 1}: ${count}`}
										className="flex-1 rounded-t bg-accent transition-[height]"
										style={{
											height: `${Math.max(count ? 8 : 2, (count / max) * 100)}%`,
											opacity: count ? 1 : 0.2,
										}}
									/>
								))}
							</div>
						</div>
						{data.topLinks.length > 0 && (
							<div>
								<p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
									Most opened
								</p>
								<ol className="space-y-1.5">
									{data.topLinks.map((link, index) => (
										<li
											key={link.url}
											className="flex items-center gap-3 text-sm"
										>
											<span className="w-4 text-right text-xs text-muted tabular-nums">
												{index + 1}
											</span>
											<Favicon
												url={link.url}
												favicon={link.favicon}
												title={link.title}
												className="size-5 shrink-0 rounded"
											/>
											<span className="min-w-0 flex-1 truncate">
												{link.title}{" "}
												<span className="text-xs text-muted">
													{hostnameOf(link.url)}
												</span>
											</span>
											<span className="text-xs text-muted tabular-nums">
												{link.count}×
											</span>
										</li>
									))}
								</ol>
							</div>
						)}
						{facts.length > 0 && (
							<ul className="space-y-1 rounded-2xl border border-line p-3 text-sm">
								{facts.map((fact) => (
									<li key={String(fact)}>{fact}</li>
								))}
							</ul>
						)}
						{data.visits === 0 && data.added === 0 && (
							<p className="text-center text-sm text-muted">
								Quiet month. Open links from tabz and they'll show up here.
							</p>
						)}
					</>
				)}
			</div>
		</Modal>
	);
}

/** Early in a month, offers last month's report once. */
export function ReportBanner({ onOpen }: { onOpen: (month: string) => void }) {
	const { settings } = useHomeContext();
	const save = useSaveSettings();
	const [month, setMonth] = useState<string | null>(null);
	useEffect(() => {
		const today = new Date();
		if (today.getDate() <= 7) setMonth(shift(monthKey(today), -1));
	}, []);
	const due = month !== null && settings.reportSeen !== month;
	const report = useReport(month ?? "2000-01", due);
	if (!due || !report.data || report.data.visits + report.data.added === 0)
		return null;
	const [, m] = (month as string).split("-").map(Number);
	const name = new Date(2000, m - 1, 1).toLocaleDateString(undefined, {
		month: "long",
	});
	return (
		<div className="glass animate-pop mx-auto flex w-fit items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm">
			<button
				type="button"
				className="flex items-center gap-2"
				onClick={() => {
					save.mutate({ reportSeen: month as string });
					onOpen(month as string);
				}}
			>
				<BarChart3 className="size-4 text-accent" /> Your {name} in tabz is
				ready
				<span className="text-accent">View →</span>
			</button>
			<button
				type="button"
				className="icon-btn size-7"
				aria-label="Dismiss"
				onClick={() => save.mutate({ reportSeen: month as string })}
			>
				<X className="size-3.5" />
			</button>
		</div>
	);
}

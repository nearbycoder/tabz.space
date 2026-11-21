import { useQuery } from "@tanstack/react-query";
import { BarChart3, X } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { call, run } from "#/lib/api";
import { useSaveSettings } from "#/lib/home-query";
import { monthlyReport } from "#/server/home";
import { useHomeContext } from "./context";

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const monthKey = (date = new Date()) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const shift = (month: string, delta: number) => {
	const [y, m] = month.split("-").map(Number);
	return monthKey(new Date(y, m - 1 + delta, 1));
};

/** Early in a month, offers last month's report once. */
export const ReportBanner = memo(function ReportBanner({
	onOpen,
}: {
	onOpen: (month: string) => void;
}) {
	const { settings } = useHomeContext();
	const save = useSaveSettings();
	const [month, setMonth] = useState<string | null>(null);
	useEffect(() => {
		const today = new Date();
		if (today.getDate() <= 7) setMonth(shift(monthKey(today), -1));
	}, []);
	const due = month !== null && settings.reportSeen !== month;
	const report = useQuery({
		queryKey: ["report", month ?? "2000-01"],
		queryFn: () =>
			run(call(monthlyReport, { month: month ?? "2000-01", zone: zone() })),
		enabled: due,
		staleTime: 5 * 60_000,
	});
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
});

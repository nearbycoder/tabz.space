import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, RefreshCw } from "lucide-react";
import { call, run } from "#/lib/api";
import { cn } from "#/lib/cn";
import type { Widget } from "#/lib/preferences";
import { widgetKey } from "#/lib/widget-key";
import { getCalendar, getFeed, getQuotes, getWeather } from "#/server/home";

type Of<T extends Widget["type"]> = Extract<Widget, { type: T }>;

/** Loading / error states shared by the network-backed widgets. */
function Status({
	query,
	children,
}: {
	query: { isPending: boolean; error: Error | null; refetch: () => unknown };
	children: React.ReactNode;
}) {
	if (query.isPending)
		return (
			<div className="flex justify-center py-6 text-muted">
				<Loader2 className="size-5 animate-spin" />
			</div>
		);
	if (query.error)
		return (
			<div className="flex items-center justify-between gap-2 py-3 text-sm text-muted">
				<span>{query.error.message}</span>
				<button
					type="button"
					className="icon-btn size-7"
					aria-label="Retry"
					onClick={() => query.refetch()}
				>
					<RefreshCw className="size-3.5" />
				</button>
			</div>
		);
	return <>{children}</>;
}

// WMO weather codes → emoji + words.
const WEATHER: [number[], string, string, string?][] = [
	[[0], "☀️", "Clear", "🌙"],
	[[1], "🌤️", "Mostly clear", "🌙"],
	[[2], "⛅", "Partly cloudy", "☁️"],
	[[3], "☁️", "Cloudy"],
	[[45, 48], "🌫️", "Fog"],
	[[51, 53, 55, 56, 57], "🌦️", "Drizzle"],
	[[61, 63, 65, 66, 67, 80, 81, 82], "🌧️", "Rain"],
	[[71, 73, 75, 77, 85, 86], "🌨️", "Snow"],
	[[95, 96, 99], "⛈️", "Thunderstorms"],
];
const describe = (code: number, isDay = true) => {
	const match = WEATHER.find(([codes]) => codes.includes(code));
	return {
		icon: (!isDay && match?.[3]) || match?.[1] || "🌡️",
		label: match?.[2] ?? "—",
	};
};

export function WeatherWidget({ widget }: { widget: Of<"weather"> }) {
	const input = { lat: widget.lat, lon: widget.lon, unit: widget.unit };
	const query = useQuery({
		queryKey: widgetKey("weather", input),
		queryFn: () => run(call(getWeather, input)),
		staleTime: 10 * 60_000,
		refetchInterval: 15 * 60_000,
	});
	const data = query.data;
	const now = data ? describe(data.code, data.isDay) : null;
	return (
		<Status query={query}>
			{data && now && (
				<div className="space-y-3">
					<div className="flex items-center gap-3">
						<span className="text-5xl leading-none">{now.icon}</span>
						<div className="min-w-0">
							<p className="text-3xl font-semibold tabular-nums">
								{data.temperature}°
							</p>
							<p className="truncate text-xs text-muted">
								{now.label} · feels {data.feelsLike}°
							</p>
						</div>
					</div>
					<p className="flex items-center gap-1 truncate text-xs text-muted">
						<MapPin className="size-3 shrink-0" /> {widget.place}
					</p>
					<div className="grid grid-cols-4 gap-1 text-center text-xs">
						{data.days.map((day, index) => (
							<div
								key={day.date}
								className="rounded-xl bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] py-1.5"
							>
								<p className="text-muted">
									{index === 0
										? "Today"
										: new Date(`${day.date}T12:00:00`).toLocaleDateString(
												undefined,
												{ weekday: "short" },
											)}
								</p>
								<p className="my-0.5 text-lg leading-none">
									{describe(day.code).icon}
								</p>
								<p className="tabular-nums">
									{day.high}° <span className="text-muted">{day.low}°</span>
								</p>
							</div>
						))}
					</div>
				</div>
			)}
		</Status>
	);
}

const dayLabel = (ms: number) => {
	const date = new Date(ms);
	const today = new Date();
	const tomorrow = new Date(Date.now() + 86_400_000);
	if (date.toDateString() === today.toDateString()) return "Today";
	if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
	return date.toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
};

export function CalendarWidget({ widget }: { widget: Of<"calendar"> }) {
	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const input = { url: widget.url, days: widget.days, zone };
	const query = useQuery({
		queryKey: widgetKey("calendar", input),
		queryFn: () => run(call(getCalendar, input)),
		staleTime: 5 * 60_000,
		refetchInterval: 10 * 60_000,
	});
	const events = query.data ?? [];
	const byDay = new Map<string, typeof events>();
	for (const event of events) {
		// All-day events that started earlier still belong under today.
		const label = dayLabel(
			Math.max(event.start, event.allDay ? Date.now() : event.start),
		);
		byDay.set(label, [...(byDay.get(label) ?? []), event]);
	}
	return (
		<Status query={query}>
			{events.length === 0 ? (
				<p className="py-3 text-center text-sm text-muted">
					Nothing in the next {widget.days} days 🎉
				</p>
			) : (
				<div className="space-y-2.5">
					{[...byDay].map(([label, dayEvents]) => (
						<div key={label}>
							<p className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
								{label}
							</p>
							<ul className="space-y-1">
								{dayEvents.map((event) => {
									const live =
										!event.allDay &&
										event.start <= Date.now() &&
										event.end > Date.now();
									return (
										<li
											key={`${event.start}${event.title}`}
											className="flex gap-2 text-sm"
										>
											<span
												className={cn(
													"w-16 shrink-0 text-xs tabular-nums",
													live ? "font-semibold text-accent" : "text-muted",
												)}
											>
												{event.allDay
													? "All day"
													: live
														? "Now"
														: new Date(event.start).toLocaleTimeString(
																undefined,
																{ hour: "numeric", minute: "2-digit" },
															)}
											</span>
											<span className="min-w-0 flex-1">
												<span className="block truncate">{event.title}</span>
												{event.location && (
													<span className="block truncate text-xs text-muted">
														{event.location}
													</span>
												)}
											</span>
										</li>
									);
								})}
							</ul>
						</div>
					))}
				</div>
			)}
		</Status>
	);
}

/** Tiny line chart of recent closes. */
function Sparkline({ values, up }: { values: number[]; up: boolean }) {
	if (values.length < 2) return null;
	const min = Math.min(...values);
	const max = Math.max(...values);
	const points = values
		.map(
			(value, index) =>
				`${(index / (values.length - 1)) * 60},${18 - ((value - min) / (max - min || 1)) * 16}`,
		)
		.join(" ");
	return (
		<svg viewBox="0 0 60 20" className="h-5 w-14 shrink-0" aria-hidden="true">
			<polyline
				points={points}
				fill="none"
				strokeWidth="1.5"
				strokeLinejoin="round"
				className={up ? "stroke-emerald-500" : "stroke-red-500"}
			/>
		</svg>
	);
}

export function StocksWidget({ widget }: { widget: Of<"stocks"> }) {
	const input = { symbols: widget.symbols };
	const query = useQuery({
		queryKey: widgetKey("quotes", input),
		queryFn: () => run(call(getQuotes, input)),
		staleTime: 3 * 60_000,
		refetchInterval: 5 * 60_000,
	});
	return (
		<Status query={query}>
			<ul className="divide-y divide-line">
				{query.data?.map((quote) =>
					"error" in quote ? (
						<li
							key={quote.symbol}
							className="flex justify-between py-1.5 text-sm text-muted"
						>
							<span className="font-medium">{quote.symbol}</span> not found
						</li>
					) : (
						<li key={quote.symbol} className="flex items-center gap-2 py-1.5">
							<div className="min-w-0 flex-1">
								<p className="text-sm font-semibold">{quote.symbol}</p>
								{quote.name && (
									<p className="truncate text-[11px] text-muted">
										{quote.name}
									</p>
								)}
							</div>
							<Sparkline values={quote.closes} up={quote.change >= 0} />
							<div className="w-20 text-right">
								<p className="text-sm tabular-nums">
									{quote.price.toLocaleString(undefined, {
										maximumFractionDigits: quote.price < 10 ? 4 : 2,
									})}
								</p>
								<p
									className={cn(
										"text-[11px] tabular-nums",
										quote.change >= 0 ? "text-emerald-500" : "text-red-500",
									)}
								>
									{quote.change >= 0 ? "+" : ""}
									{quote.change.toFixed(2)}%
								</p>
							</div>
						</li>
					),
				)}
			</ul>
		</Status>
	);
}

const ago = (ms: number) => {
	const minutes = Math.round((Date.now() - ms) / 60_000);
	if (minutes < 60) return `${Math.max(1, minutes)}m`;
	if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
	return `${Math.round(minutes / 60 / 24)}d`;
};

export function FeedWidget({ widget }: { widget: Of<"feed"> }) {
	const input = { url: widget.url, count: widget.count };
	const query = useQuery({
		queryKey: widgetKey("feed", input),
		queryFn: () => run(call(getFeed, input)),
		staleTime: 10 * 60_000,
		refetchInterval: 15 * 60_000,
	});
	return (
		<Status query={query}>
			{query.data?.length === 0 ? (
				<p className="py-3 text-center text-sm text-muted">No posts found.</p>
			) : (
				<ul className="space-y-0.5">
					{query.data?.map((item) => (
						<li key={`${item.at}${item.title}`}>
							<a
								href={item.url}
								target="_blank"
								rel="noopener noreferrer"
								className="focus-ring flex items-baseline gap-2 rounded-lg px-1 py-1 text-sm hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]"
							>
								<span className="min-w-0 flex-1 truncate">{item.title}</span>
								<span className="shrink-0 text-[11px] text-muted tabular-nums">
									{ago(item.at)}
								</span>
							</a>
						</li>
					))}
				</ul>
			)}
		</Status>
	);
}

import { useEffect, useState } from "react";

const greetingFor = (hour: number) =>
	hour < 5
		? "Up late"
		: hour < 12
			? "Good morning"
			: hour < 18
				? "Good afternoon"
				: "Good evening";

/** The hour (0-23) in a time zone, or locally when none is given. */
const hourIn = (date: Date, timeZone?: string) =>
	timeZone
		? Number(
				new Intl.DateTimeFormat("en-US", {
					hour: "numeric",
					hourCycle: "h23",
					timeZone,
				}).format(date),
			)
		: date.getHours();

export function Clock({
	name,
	showClock,
	showGreeting,
	format,
	timeZone,
}: {
	name: string;
	showClock: boolean;
	showGreeting: boolean;
	format: "12h" | "24h";
	/** The user's saved zone: lets the server render the right time up front. */
	timeZone?: string;
}) {
	// With a known time zone the server renders the clock too (no empty gap
	// while loading); otherwise it appears after mount.
	const [now, setNow] = useState<Date | null>(() =>
		timeZone ? new Date() : null,
	);
	const [local, setLocal] = useState(false);
	useEffect(() => {
		setNow(new Date());
		setLocal(true);
		const timer = setInterval(() => setNow(new Date()), 10_000);
		return () => clearInterval(timer);
	}, []);
	// After mount, the browser's own zone is the source of truth.
	const zone = local ? undefined : timeZone;

	if (!showClock && !showGreeting) return null;
	const firstName = name.split(" ")[0];

	return (
		<div className="flex min-h-[7.5rem] flex-col items-center justify-end text-center">
			{now && showClock && (
				<div
					suppressHydrationWarning
					className="text-6xl font-semibold tracking-tight tabular-nums sm:text-7xl"
				>
					{now.toLocaleTimeString([], {
						hour: "numeric",
						minute: "2-digit",
						hour12: format === "12h",
						timeZone: zone,
					})}
				</div>
			)}
			{now && showGreeting && (
				<p suppressHydrationWarning className="mt-2 text-muted">
					{greetingFor(hourIn(now, zone))}
					{firstName ? `, ${firstName}` : ""} ·{" "}
					{now.toLocaleDateString([], {
						weekday: "long",
						month: "long",
						day: "numeric",
						timeZone: zone,
					})}
				</p>
			)}
		</div>
	);
}

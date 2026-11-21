import { memo, useEffect, useState } from "react";

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

export const Clock = memo(function Clock({
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
	const visible = showClock || showGreeting;
	// With a known time zone the server renders the clock too (no empty gap
	// while loading); otherwise it appears after mount.
	const [now, setNow] = useState<Date | null>(() =>
		timeZone ? new Date() : null,
	);
	const [local, setLocal] = useState(false);
	useEffect(() => {
		if (!visible) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const schedule = () => {
			clearTimeout(timer);
			if (document.hidden) return;
			const current = new Date();
			setNow(current);
			// Align the next redraw to the start of the next minute.
			const delay = 60_000 - (current.getTime() % 60_000) + 50;
			timer = setTimeout(schedule, delay);
		};
		setLocal(true);
		schedule();
		const onVisibility = () => {
			if (document.hidden) clearTimeout(timer);
			else schedule();
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [visible]);
	// After mount, the browser's own zone is the source of truth.
	const zone = local ? undefined : timeZone;
	// The server's text is kept as-is while the page comes alive (it may be
	// from the saved copy, hours old), and React assumes it matches; a new key
	// once mounted redraws it with the real time right away.
	const pass = local ? "local" : "server";

	if (!visible) return null;
	const firstName = name.split(" ")[0];

	return (
		<div className="flex min-h-[7.5rem] flex-col items-center justify-end text-center">
			{now && showClock && (
				<div
					key={`time-${pass}`}
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
				<p
					key={`greeting-${pass}`}
					suppressHydrationWarning
					className="mt-2 text-muted"
				>
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
});

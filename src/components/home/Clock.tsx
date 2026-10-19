import { useEffect, useState } from "react";

const greetingFor = (hour: number) =>
	hour < 5
		? "Up late"
		: hour < 12
			? "Good morning"
			: hour < 18
				? "Good afternoon"
				: "Good evening";

export function Clock({
	name,
	showClock,
	showGreeting,
	format,
}: {
	name: string;
	showClock: boolean;
	showGreeting: boolean;
	format: "12h" | "24h";
}) {
	// Rendered after mount so server and client never disagree about the time.
	const [now, setNow] = useState<Date | null>(null);
	useEffect(() => {
		setNow(new Date());
		const timer = setInterval(() => setNow(new Date()), 10_000);
		return () => clearInterval(timer);
	}, []);

	if (!showClock && !showGreeting) return null;
	const firstName = name.split(" ")[0];

	return (
		<div className="flex min-h-[7.5rem] flex-col items-center justify-end text-center">
			{now && showClock && (
				<div className="animate-pop text-6xl font-semibold tracking-tight tabular-nums sm:text-7xl">
					{now.toLocaleTimeString([], {
						hour: "numeric",
						minute: "2-digit",
						hour12: format === "12h",
					})}
				</div>
			)}
			{now && showGreeting && (
				<p className="animate-pop mt-2 text-muted">
					{greetingFor(now.getHours())}
					{firstName ? `, ${firstName}` : ""} ·{" "}
					{now.toLocaleDateString([], {
						weekday: "long",
						month: "long",
						day: "numeric",
					})}
				</p>
			)}
		</div>
	);
}

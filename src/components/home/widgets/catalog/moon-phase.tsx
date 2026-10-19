import { useNow, type WidgetProps } from "../kit";

const SYNODIC = 29.530588853;
/** A known new moon: 2000-01-06 18:14 UTC. */
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

const PHASES = [
	[0.0339, "🌑", "New moon"],
	[0.216, "🌒", "Waxing crescent"],
	[0.284, "🌓", "First quarter"],
	[0.466, "🌔", "Waxing gibbous"],
	[0.534, "🌕", "Full moon"],
	[0.716, "🌖", "Waning gibbous"],
	[0.784, "🌗", "Last quarter"],
	[0.966, "🌘", "Waning crescent"],
	[1, "🌑", "New moon"],
] as const;

export default function MoonPhase(_: WidgetProps<object>) {
	const now = useNow(3_600_000);
	if (!now) return <div className="h-36" />;
	const age =
		((((now.getTime() - NEW_MOON) / 86_400_000) % SYNODIC) + SYNODIC) % SYNODIC;
	const fraction = age / SYNODIC;
	const [, icon, name] =
		PHASES.find(([limit]) => fraction < limit) ?? PHASES[0];
	const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
	const daysTo = (target: number) => ((target - fraction + 1) % 1) * SYNODIC;
	const date = (days: number) =>
		new Date(now.getTime() + days * 86_400_000).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		});
	return (
		<div className="flex flex-col items-center gap-1 py-1 text-center">
			<span className="text-6xl leading-none">{icon}</span>
			<p className="font-medium">{name}</p>
			<p className="text-sm text-muted">
				{Math.round(illumination * 100)}% lit · day {Math.floor(age)} of 29
			</p>
			<div className="mt-1 flex gap-4 text-xs text-muted">
				<span>🌕 {date(daysTo(0.5))}</span>
				<span>🌑 {date(daysTo(0))}</span>
			</div>
		</div>
	);
}

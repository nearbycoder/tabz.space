import { Bar, Hint, useNow, type WidgetProps } from "../kit";

type Data = { place: string; lat: number; lon: number; zone?: string };

/* Sunrise/sunset from the SunCalc formulas (Vladimir Agafonkin, BSD). */
const RAD = Math.PI / 180;
const DAY = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const J0 = 0.0009;
const TILT = RAD * 23.4397;

function sunTimes(date: Date, lat: number, lon: number) {
	const toDays = (d: Date) => d.getTime() / DAY - 0.5 + J1970 - J2000;
	const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY);
	const lw = RAD * -lon;
	const phi = RAD * lat;
	const n = Math.round(toDays(date) - J0 - lw / (2 * Math.PI));
	const transit = (ht: number) => J0 + (ht + lw) / (2 * Math.PI) + n;
	const ds = transit(0);
	const M = RAD * (357.5291 + 0.98560028 * ds);
	const C =
		RAD *
		(1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
	const L = M + C + RAD * 102.9372 + Math.PI;
	const dec = Math.asin(Math.sin(TILT) * Math.sin(L));
	const solarJ = (d: number) =>
		J2000 + d + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
	const noon = solarJ(ds);
	const w = Math.acos(
		(Math.sin(-0.833 * RAD) - Math.sin(phi) * Math.sin(dec)) /
			(Math.cos(phi) * Math.cos(dec)),
	);
	if (Number.isNaN(w))
		return {
			polar: Math.sin(phi) * Math.sin(dec) > 0 ? "day" : "night",
		} as const;
	const set = solarJ(transit(w));
	return {
		sunrise: fromJulian(noon - (set - noon)),
		sunset: fromJulian(set),
		noon: fromJulian(noon),
	} as const;
}

/** Times in the city's own zone when we know it (stored when the city is picked). */
const timeFormat = (zone?: string) => {
	try {
		return new Intl.DateTimeFormat(undefined, {
			hour: "numeric",
			minute: "2-digit",
			timeZone: zone || undefined,
		});
	} catch {
		return new Intl.DateTimeFormat(undefined, {
			hour: "numeric",
			minute: "2-digit",
		});
	}
};

export default function SunTimes({ data }: WidgetProps<Data>) {
	const now = useNow(60_000);
	if (!data.place) return <Hint>Pick a city in the widget's settings</Hint>;
	if (!now) return <div className="h-32" />;
	const sun = sunTimes(now, data.lat, data.lon);
	if ("polar" in sun)
		return (
			<Hint>
				{sun.polar === "day"
					? "☀️ The sun doesn't set today"
					: "🌑 The sun doesn't rise today"}
			</Hint>
		);
	const format = timeFormat(data.zone);
	const time = (date: Date) => format.format(date);
	const length = sun.sunset.getTime() - sun.sunrise.getTime();
	const progress = (now.getTime() - sun.sunrise.getTime()) / length;
	return (
		<div className="space-y-3">
			<div className="flex justify-between text-center">
				<div>
					<p className="text-2xl">🌅</p>
					<p className="font-medium tabular-nums">{time(sun.sunrise)}</p>
					<p className="text-xs text-muted">Sunrise</p>
				</div>
				<div className="self-center text-center text-xs text-muted">
					{Math.floor(length / 3_600_000)}h{" "}
					{Math.round((length % 3_600_000) / 60_000)}m of daylight
					<br />
					noon {time(sun.noon)}
				</div>
				<div>
					<p className="text-2xl">🌇</p>
					<p className="font-medium tabular-nums">{time(sun.sunset)}</p>
					<p className="text-xs text-muted">Sunset</p>
				</div>
			</div>
			<Bar value={progress} />
			<p className="text-center text-xs text-muted">
				{data.place} · {data.zone ? "local time there" : "your time"}
			</p>
		</div>
	);
}

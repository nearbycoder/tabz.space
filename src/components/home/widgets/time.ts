/** Hour/minute/second in a time zone ("" = this device's), falling back to local time. */
export function timeIn(date: Date, zone: string) {
	try {
		const parts = Object.fromEntries(
			new Intl.DateTimeFormat("en-US", {
				timeZone: zone || undefined,
				hour: "numeric",
				minute: "numeric",
				second: "numeric",
				year: "numeric",
				month: "numeric",
				day: "numeric",
				hourCycle: "h23",
			})
				.formatToParts(date)
				.map((part) => [part.type, part.value]),
		);
		return {
			hour: Number(parts.hour) % 24,
			minute: Number(parts.minute),
			second: Number(parts.second),
			/** Calendar day number, for "tomorrow"/"yesterday" labels. */
			day:
				Date.UTC(
					Number(parts.year),
					Number(parts.month) - 1,
					Number(parts.day),
				) / 86_400_000,
		};
	} catch {
		return timeIn(date, "");
	}
}

/** "America/New_York" → "New York". */
export const cityOf = (zone: string) =>
	(zone.split("/").pop() ?? zone).replace(/_/g, " ");

export const allZones = () =>
	typeof Intl.supportedValuesOf === "function"
		? Intl.supportedValuesOf("timeZone")
		: [];

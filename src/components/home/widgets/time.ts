const formatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (zone: string) => {
	let format = formatters.get(zone);
	if (!format) {
		format = new Intl.DateTimeFormat("en-US", {
			timeZone: zone || undefined,
			hour: "numeric",
			minute: "numeric",
			second: "numeric",
			year: "numeric",
			month: "numeric",
			day: "numeric",
			hourCycle: "h23",
		});
		if (formatters.size >= 64)
			formatters.delete(formatters.keys().next().value as string);
		formatters.set(zone, format);
	}
	return format;
};

export type TimeParts = {
	hour: number;
	minute: number;
	second: number;
	/** Calendar day number, for "tomorrow"/"yesterday" labels. */
	day: number;
};

/** Hour/minute/second in a time zone ("" = this device's), falling back to local time. */
export function timeIn(date: Date, zone: string): TimeParts {
	try {
		let hour = 0;
		let minute = 0;
		let second = 0;
		let year = 1970;
		let month = 1;
		let day = 1;
		for (const part of formatterFor(zone).formatToParts(date)) {
			if (part.type === "hour") hour = Number(part.value);
			else if (part.type === "minute") minute = Number(part.value);
			else if (part.type === "second") second = Number(part.value);
			else if (part.type === "year") year = Number(part.value);
			else if (part.type === "month") month = Number(part.value);
			else if (part.type === "day") day = Number(part.value);
		}
		return {
			hour: hour % 24,
			minute,
			second,
			/** Calendar day number, for "tomorrow"/"yesterday" labels. */
			day: Date.UTC(year, month - 1, day) / 86_400_000,
		};
	} catch {
		return zone ? timeIn(date, "") : { hour: 0, minute: 0, second: 0, day: 0 };
	}
}

/** "America/New_York" → "New York". */
export const cityOf = (zone: string) =>
	(zone.split("/").pop() ?? zone).replace(/_/g, " ");

export const allZones = () =>
	typeof Intl.supportedValuesOf === "function"
		? Intl.supportedValuesOf("timeZone")
		: [];

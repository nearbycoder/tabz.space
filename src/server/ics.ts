/*
 * Minimal iCalendar (RFC 5545) reader for the calendar widget: VEVENTs with
 * time zones, all-day events, EXDATE, RECURRENCE-ID overrides and the common
 * RRULE shapes (DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL,
 * BYDAY, BYMONTHDAY).
 */

export type CalendarEvent = {
	title: string;
	location?: string;
	start: number;
	end: number;
	allDay: boolean;
};

type Parts = {
	y: number;
	m: number;
	d: number;
	h: number;
	mi: number;
	s: number;
};

// Outlook exports Windows zone names; map the common ones to IANA.
const WINDOWS_ZONES: Record<string, string> = {
	"Pacific Standard Time": "America/Los_Angeles",
	"Mountain Standard Time": "America/Denver",
	"Central Standard Time": "America/Chicago",
	"Eastern Standard Time": "America/New_York",
	"GMT Standard Time": "Europe/London",
	"W. Europe Standard Time": "Europe/Berlin",
	"Romance Standard Time": "Europe/Paris",
	"Central European Standard Time": "Europe/Warsaw",
	"India Standard Time": "Asia/Kolkata",
	"China Standard Time": "Asia/Shanghai",
	"Tokyo Standard Time": "Asia/Tokyo",
	"AUS Eastern Standard Time": "Australia/Sydney",
	UTC: "UTC",
};

const validZone = (zone: string | undefined, fallback: string) => {
	const candidate = zone ? (WINDOWS_ZONES[zone] ?? zone) : fallback;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: candidate });
		return candidate;
	} catch {
		return fallback;
	}
};

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Milliseconds a zone is ahead of UTC at a given instant. */
const zoneOffset = (utc: number, zone: string) => {
	let format = formatters.get(zone);
	if (!format) {
		format = new Intl.DateTimeFormat("en-US", {
			timeZone: zone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		formatters.set(zone, format);
	}
	const get = (type: string) =>
		Number(format?.formatToParts(utc).find((p) => p.type === type)?.value);
	const asUtc = Date.UTC(
		get("year"),
		get("month") - 1,
		get("day"),
		get("hour"),
		get("minute"),
		get("second"),
	);
	return asUtc - Math.floor(utc / 1000) * 1000;
};

/** Converts a wall-clock time in `zone` to a UTC instant (DST-aware). */
export const zonedToUtc = (p: Parts, zone: string) => {
	const guess = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
	const first = guess - zoneOffset(guess, zone);
	return guess - zoneOffset(first, zone);
};

/** The wall-clock parts of a UTC instant in `zone`. */
export const utcToZoned = (utc: number, zone: string): Parts => {
	const local = new Date(utc + zoneOffset(utc, zone));
	return {
		y: local.getUTCFullYear(),
		m: local.getUTCMonth() + 1,
		d: local.getUTCDate(),
		h: local.getUTCHours(),
		mi: local.getUTCMinutes(),
		s: local.getUTCSeconds(),
	};
};

type Property = { name: string; params: Record<string, string>; value: string };

const unfold = (text: string) => text.replace(/\r?\n[ \t]/g, "");

const parseLine = (line: string): Property | null => {
	const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
	if (colon < 0) return null;
	const [name, ...rawParams] = line.slice(0, colon).split(";");
	const params: Record<string, string> = {};
	for (const param of rawParams) {
		const [key, value = ""] = param.split("=");
		params[key.toUpperCase()] = value.replace(/^"|"$/g, "");
	}
	return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
};

const icsText = (value: string) =>
	value
		.replace(/\\n/gi, " ")
		.replace(/\\([,;\\])/g, "$1")
		.trim();

type Stamp = { parts: Parts; zone: string; allDay: boolean };

const parseStamp = (prop: Property, fallbackZone: string): Stamp | null => {
	const match = prop.value.match(
		/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/,
	);
	if (!match) return null;
	const [, y, m, d, h, mi, s, z] = match;
	const allDay = prop.params.VALUE === "DATE" || h === undefined;
	return {
		parts: {
			y: +y,
			m: +m,
			d: +d,
			h: allDay ? 0 : +h,
			mi: allDay ? 0 : +mi,
			s: allDay ? 0 : +(s ?? 0),
		},
		zone: z ? "UTC" : validZone(prop.params.TZID, fallbackZone),
		// All-day dates float in the viewer's zone.
		allDay,
	};
};

const instant = (stamp: Stamp, viewerZone: string) =>
	zonedToUtc(stamp.parts, stamp.allDay ? viewerZone : stamp.zone);

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_MS = 86_400_000;

/** Calendar-date arithmetic on plain Y/M/D (no zones involved). */
const dateKey = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
const fromKey = (key: number) => {
	const date = new Date(key);
	return {
		y: date.getUTCFullYear(),
		m: date.getUTCMonth() + 1,
		d: date.getUTCDate(),
	};
};
const daysInMonth = (y: number, m: number) =>
	new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Day-of-month for "2TU" / "-1FR" style rules, or null if it doesn't exist. */
const nthWeekday = (y: number, m: number, weekday: number, n: number) => {
	if (n > 0) {
		const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
		const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
		return day <= daysInMonth(y, m) ? day : null;
	}
	const lastDay = daysInMonth(y, m);
	const last = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
	const day = lastDay - ((last - weekday + 7) % 7) + (n + 1) * 7;
	return day >= 1 ? day : null;
};

/** Start dates (as Y/M/D keys) produced by an RRULE, in order. */
function* recurrenceDates(rule: Record<string, string>, start: Parts) {
	const freq = rule.FREQ;
	const interval = Math.max(1, Number(rule.INTERVAL ?? 1));
	const byDay = rule.BYDAY?.split(",").map((code) => {
		const match = code.match(/^([+-]?\d+)?([A-Z]{2})$/);
		return {
			n: match?.[1] ? Number(match[1]) : 0,
			day: DAY_CODES.indexOf(match?.[2] ?? ""),
		};
	});
	const byMonthDay = rule.BYMONTHDAY?.split(",").map(Number);
	const startKey = dateKey(start.y, start.m, start.d);
	for (let step = 0; step < 2000; step++) {
		if (freq === "DAILY") yield startKey + step * interval * DAY_MS;
		else if (freq === "WEEKLY") {
			const weekStart =
				startKey -
				new Date(startKey).getUTCDay() * DAY_MS +
				step * interval * 7 * DAY_MS;
			const days = byDay?.length
				? byDay.map((b) => b.day)
				: [new Date(startKey).getUTCDay()];
			for (const day of [...days].sort((a, b) => a - b))
				yield weekStart + day * DAY_MS;
		} else if (freq === "MONTHLY") {
			const total = start.m - 1 + step * interval;
			const y = start.y + Math.floor(total / 12);
			const m = (total % 12) + 1;
			const days = byMonthDay?.length
				? byMonthDay.map((d) => (d > 0 ? d : daysInMonth(y, m) + d + 1))
				: byDay?.length
					? byDay.map((b) => nthWeekday(y, m, b.day, b.n || 1))
					: [start.d];
			for (const d of days
				.filter(
					(d): d is number => d !== null && d >= 1 && d <= daysInMonth(y, m),
				)
				.sort((a, b) => a - b))
				yield dateKey(y, m, d);
		} else if (freq === "YEARLY") {
			const y = start.y + step * interval;
			if (start.d <= daysInMonth(y, start.m))
				yield dateKey(y, start.m, start.d);
		} else return;
	}
}

type RawEvent = {
	uid?: string;
	title: string;
	location?: string;
	start: Stamp;
	durationMs: number;
	rrule?: Record<string, string>;
	exdates: Set<number>;
	recurrenceId?: number;
};

/** Upcoming event occurrences overlapping [from, to), soonest first. */
export function upcomingEvents(
	text: string,
	options: { from: number; to: number; zone: string; limit?: number },
): CalendarEvent[] {
	const { from, to, zone } = options;
	const lines = unfold(text).split(/\r?\n/);
	const events: RawEvent[] = [];
	let current: Property[] | null = null;
	for (const line of lines) {
		if (line === "BEGIN:VEVENT") current = [];
		else if (line === "END:VEVENT" && current) {
			const prop = (name: string) => current?.find((p) => p.name === name);
			const startProp = prop("DTSTART");
			const start = startProp ? parseStamp(startProp, zone) : null;
			if (start && prop("STATUS")?.value !== "CANCELLED") {
				const endProp = prop("DTEND");
				const end = endProp ? parseStamp(endProp, zone) : null;
				const startMs = instant(start, zone);
				const durationMs = end
					? Math.max(0, instant(end, zone) - startMs)
					: start.allDay
						? DAY_MS
						: 0;
				const rrule = prop("RRULE")
					? Object.fromEntries(
							(prop("RRULE")?.value ?? "")
								.split(";")
								.map((pair) => pair.split("=") as [string, string]),
						)
					: undefined;
				const exdates = new Set<number>();
				for (const ex of current.filter((p) => p.name === "EXDATE"))
					for (const value of ex.value.split(",")) {
						const stamp = parseStamp({ ...ex, value }, zone);
						if (stamp) exdates.add(instant(stamp, zone));
					}
				const recurrenceProp = prop("RECURRENCE-ID");
				const recurrence = recurrenceProp
					? parseStamp(recurrenceProp, zone)
					: null;
				events.push({
					uid: prop("UID")?.value,
					title: icsText(prop("SUMMARY")?.value ?? "") || "Busy",
					location: prop("LOCATION")
						? icsText(prop("LOCATION")?.value ?? "") || undefined
						: undefined,
					start,
					durationMs,
					rrule,
					exdates,
					recurrenceId: recurrence ? instant(recurrence, zone) : undefined,
				});
			}
			current = null;
		} else if (current) {
			const prop = parseLine(line);
			if (prop) current.push(prop);
		}
	}

	// Moved/edited single occurrences replace the series' original slot.
	const overridden = new Set(
		events
			.filter((e) => e.recurrenceId !== undefined)
			.map((e) => `${e.uid}|${e.recurrenceId}`),
	);
	const out: CalendarEvent[] = [];
	const push = (event: RawEvent, startMs: number) => {
		if (startMs < to && startMs + Math.max(event.durationMs, 1) > from)
			out.push({
				title: event.title,
				location: event.location,
				start: startMs,
				end: startMs + event.durationMs,
				allDay: event.start.allDay,
			});
	};

	for (const event of events) {
		if (!event.rrule) {
			push(event, instant(event.start, zone));
			continue;
		}
		const until = event.rrule.UNTIL
			? (() => {
					const stamp = parseStamp(
						{ name: "UNTIL", params: {}, value: event.rrule.UNTIL },
						zone,
					);
					return stamp ? instant(stamp, zone) : Number.POSITIVE_INFINITY;
				})()
			: Number.POSITIVE_INFINITY;
		const count = event.rrule.COUNT
			? Number(event.rrule.COUNT)
			: Number.POSITIVE_INFINITY;
		const firstMs = instant(event.start, zone);
		const eventZone = event.start.allDay ? zone : event.start.zone;
		let seen = 0;
		for (const key of recurrenceDates(event.rrule, event.start.parts)) {
			const { y, m, d } = fromKey(key);
			const startMs = zonedToUtc({ ...event.start.parts, y, m, d }, eventZone);
			if (startMs < firstMs) continue;
			if (startMs > until || seen >= count || startMs >= to) break;
			seen++;
			if (
				event.exdates.has(startMs) ||
				overridden.has(`${event.uid}|${startMs}`)
			)
				continue;
			push(event, startMs);
		}
	}
	return out.sort((a, b) => a.start - b.start).slice(0, options.limit ?? 30);
}

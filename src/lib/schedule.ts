import type { BoardSchedule } from "./preferences";

/*
 * Time-based boards: a board with a schedule shows up on its own during that
 * window (e.g. "Work" on weekdays 9–5). Evaluated in the user's time zone so
 * server rendering and the browser agree.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

const formatters = new Map<string, Intl.DateTimeFormat>();

const localNow = (now: number, zone?: string) => {
	const key = zone ?? "";
	let format = formatters.get(key);
	if (!format) {
		try {
			format = new Intl.DateTimeFormat("en-US", {
				timeZone: zone,
				weekday: "short",
				hour: "2-digit",
				minute: "2-digit",
				hourCycle: "h23",
			});
		} catch {
			format = new Intl.DateTimeFormat("en-US", {
				weekday: "short",
				hour: "2-digit",
				minute: "2-digit",
				hourCycle: "h23",
			});
		}
		formatters.set(key, format);
	}
	const parts = format.formatToParts(now);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
	return {
		day: WEEKDAYS.indexOf(get("weekday")),
		minutes: Number(get("hour")) * 60 + Number(get("minute")),
	};
};

const toMinutes = (time: string) => {
	const [h, m] = time.split(":").map(Number);
	return h * 60 + m;
};

export function scheduleMatches(
	schedule: BoardSchedule,
	now: number,
	zone?: string,
) {
	const { day, minutes } = localNow(now, zone);
	const from = toMinutes(schedule.from);
	const to = toMinutes(schedule.to);
	if (from === to) return schedule.days.includes(day);
	if (from < to)
		return schedule.days.includes(day) && minutes >= from && minutes < to;
	// Overnight, e.g. 22:00–02:00: the early hours belong to the previous day.
	return (
		(schedule.days.includes(day) && minutes >= from) ||
		(schedule.days.includes((day + 6) % 7) && minutes < to)
	);
}

/** The first non-vault board whose schedule covers `now`, if any. */
export function scheduledBoardId(
	boards: {
		id: string;
		vault: boolean;
		layout: { schedule?: BoardSchedule | null };
	}[],
	now: number,
	zone?: string,
) {
	return (
		boards.find(
			(board) =>
				!board.vault &&
				board.layout.schedule &&
				scheduleMatches(board.layout.schedule, now, zone),
		)?.id ?? null
	);
}

export const describeSchedule = (schedule: BoardSchedule) => {
	const days = [...schedule.days].sort();
	const label =
		days.length === 7
			? "Every day"
			: days.join() === "1,2,3,4,5"
				? "Weekdays"
				: days.join() === "0,6"
					? "Weekends"
					: days.map((d) => WEEKDAYS[d]).join(", ");
	return schedule.from === schedule.to
		? label
		: `${label}, ${schedule.from}–${schedule.to}`;
};

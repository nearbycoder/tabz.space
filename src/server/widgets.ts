import { Effect } from "effect";
import { z } from "zod";
import { FetchError, InvalidInput } from "#/lib/effect/errors";
import {
	type CalendarEvent,
	upcomingEvents,
	utcToZoned,
	zonedToUtc,
} from "./ics";
import { fetchFeed, fetchPageMetadata, fetchText } from "./metadata";

/*
 * Data behind the home-page widgets. Everything is fetched server-side (so
 * private calendar URLs and feeds don't need CORS) and cached briefly in
 * memory, shared across users.
 */

const cache = new Map<string, { at: number; value: unknown }>();

const cached = <A, E>(key: string, ttlMs: number, load: Effect.Effect<A, E>) =>
	Effect.suspend(() => {
		const hit = cache.get(key);
		if (hit && Date.now() - hit.at < ttlMs)
			return Effect.succeed(hit.value as A);
		return load.pipe(
			Effect.tap((value) =>
				Effect.sync(() => {
					if (cache.size > 2000) cache.clear();
					cache.set(key, { at: Date.now(), value });
				}),
			),
		);
	});

const getJson = <T>(url: string) =>
	Effect.tryPromise({
		try: async (signal) => {
			const response = await fetch(url, {
				signal,
				headers: {
					"user-agent":
						"Mozilla/5.0 (compatible; TabzBot/1.0; +https://tabz.space)",
				},
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return (await response.json()) as T;
		},
		catch: (error) => new FetchError({ url, reason: String(error) }),
	}).pipe(Effect.timeout("8 seconds"));

const unavailable = (what: string) => () =>
	new InvalidInput({ message: `${what} is unavailable right now` });

/* ---------------------------------- weather --------------------------------- */

export const geocodeInput = z.object({
	name: z.string().trim().min(2).max(80),
});

export const geocode = (data: z.infer<typeof geocodeInput>) =>
	cached(
		`geo:${data.name.toLowerCase()}`,
		24 * 60 * 60_000,
		getJson<{
			results?: {
				name: string;
				admin1?: string;
				country?: string;
				latitude: number;
				longitude: number;
			}[];
		}>(
			`https://geocoding-api.open-meteo.com/v1/search?count=6&name=${encodeURIComponent(data.name)}`,
		),
	).pipe(
		Effect.map((body) =>
			(body.results ?? []).map((place) => ({
				name: [place.name, place.admin1, place.country]
					.filter(Boolean)
					.join(", "),
				lat: place.latitude,
				lon: place.longitude,
			})),
		),
		Effect.mapError(unavailable("Place search")),
	);

export const weatherInput = z.object({
	lat: z.number().min(-90).max(90),
	lon: z.number().min(-180).max(180),
	unit: z.enum(["c", "f"]),
});

type OpenMeteo = {
	current: {
		temperature_2m: number;
		weather_code: number;
		is_day: number;
		apparent_temperature: number;
	};
	daily: {
		time: string[];
		temperature_2m_max: number[];
		temperature_2m_min: number[];
		weather_code: number[];
	};
};

export const weather = (data: z.infer<typeof weatherInput>) => {
	const lat = data.lat.toFixed(2);
	const lon = data.lon.toFixed(2);
	const unit = data.unit === "f" ? "&temperature_unit=fahrenheit" : "";
	return cached(
		`wx:${lat},${lon},${data.unit}`,
		15 * 60_000,
		getJson<OpenMeteo>(
			`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}${unit}&current=temperature_2m,apparent_temperature,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=4`,
		),
	).pipe(
		Effect.map((body) => ({
			temperature: Math.round(body.current.temperature_2m),
			feelsLike: Math.round(body.current.apparent_temperature),
			code: body.current.weather_code,
			isDay: body.current.is_day === 1,
			days: body.daily.time.map((date, index) => ({
				date,
				high: Math.round(body.daily.temperature_2m_max[index]),
				low: Math.round(body.daily.temperature_2m_min[index]),
				code: body.daily.weather_code[index],
			})),
		})),
		Effect.mapError(unavailable("Weather")),
	);
};

/* ---------------------------------- stocks ---------------------------------- */

export const quotesInput = z.object({
	symbols: z
		.array(
			z
				.string()
				.trim()
				.min(1)
				.max(20)
				.regex(/^[\w.^=-]+$/),
		)
		.min(1)
		.max(12),
});

type YahooChart = {
	chart: {
		result?: {
			meta: {
				symbol: string;
				currency?: string;
				regularMarketPrice: number;
				chartPreviousClose?: number;
				shortName?: string;
			};
			indicators: { quote: { close: (number | null)[] }[] };
		}[];
	};
};

/** Quotes from Yahoo Finance's public chart endpoint (no key needed). */
const quote = (symbol: string) =>
	cached(
		`q:${symbol}`,
		5 * 60_000,
		getJson<YahooChart>(
			`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`,
		),
	).pipe(
		Effect.map((body) => {
			const result = body.chart.result?.[0];
			if (!result) return { symbol, error: true as const };
			const closes =
				result.indicators.quote[0]?.close.filter(
					(c): c is number => c !== null,
				) ?? [];
			const price = result.meta.regularMarketPrice;
			const previous =
				closes.length > 1
					? closes[closes.length - 2]
					: result.meta.chartPreviousClose;
			return {
				symbol: result.meta.symbol,
				name: result.meta.shortName,
				currency: result.meta.currency,
				price,
				change: previous ? ((price - previous) / previous) * 100 : 0,
				closes,
			};
		}),
		Effect.catch(() => Effect.succeed({ symbol, error: true as const })),
	);

export const quotes = (data: z.infer<typeof quotesInput>) =>
	Effect.forEach(data.symbols, (symbol) => quote(symbol.toUpperCase()), {
		concurrency: 4,
	});

/* --------------------------------- calendar --------------------------------- */

export const calendarInput = z.object({
	url: z
		.string()
		.trim()
		.max(2048)
		.regex(/^(https?|webcal):\/\//i),
	days: z.number().int().min(1).max(31),
	/** The viewer's IANA time zone, for all-day and floating events. */
	zone: z.string().max(64),
});

const validZone = (zone: string) => {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: zone });
		return zone;
	} catch {
		return "UTC";
	}
};

export const calendar = (data: z.infer<typeof calendarInput>) => {
	const url = data.url.replace(/^webcal:/i, "https:");
	const zone = validZone(data.zone);
	return cached(
		`ics:${url}`,
		10 * 60_000,
		fetchText(new URL(url), "text/calendar,*/*;q=0.5", /./).pipe(
			Effect.timeout("10 seconds"),
		),
	).pipe(
		Effect.flatMap(({ body }) =>
			Effect.try((): CalendarEvent[] => {
				if (!body.includes("BEGIN:VCALENDAR"))
					throw new Error("not a calendar");
				const today = utcToZoned(Date.now(), zone);
				const from = zonedToUtc({ ...today, h: 0, mi: 0, s: 0 }, zone);
				return (
					upcomingEvents(body, {
						from,
						to: from + data.days * 86_400_000,
						zone,
						limit: 40,
					})
						// Hide events that already ended today.
						.filter((event) => event.allDay || event.end > Date.now())
						.slice(0, 25)
				);
			}),
		),
		Effect.catch(() =>
			Effect.fail(
				new InvalidInput({
					message: "Couldn't read that calendar. Check the iCal (.ics) link.",
				}),
			),
		),
	);
};

/* ----------------------------------- feeds ---------------------------------- */

export const feedInput = z.object({
	url: z
		.string()
		.trim()
		.max(2048)
		.regex(/^https?:\/\//i),
	count: z.number().int().min(1).max(20),
});

/** Latest items from a feed URL, or from the feed a web page advertises. */
export const feed = (data: z.infer<typeof feedInput>) =>
	cached(
		`feed:${data.url}`,
		15 * 60_000,
		fetchFeed(data.url).pipe(
			Effect.flatMap((items) =>
				items.length
					? Effect.succeed(items)
					: fetchPageMetadata(data.url).pipe(
							Effect.flatMap((meta) =>
								meta.feedUrl ? fetchFeed(meta.feedUrl) : Effect.succeed([]),
							),
						),
			),
		),
	).pipe(
		Effect.map((items) => items.slice(0, data.count)),
		Effect.catch(() =>
			Effect.fail(new InvalidInput({ message: "Couldn't read that feed" })),
		),
	);

import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Search } from "lucide-react";
import { useState } from "react";
import { Field, Segmented } from "#/components/ui/controls";
import { call, run } from "#/lib/api";
import { cn } from "#/lib/cn";
import { WIDGET_TYPES, type Widget, type WidgetType } from "#/lib/preferences";
import { geocodePlace } from "#/server/home";

export const defaultWidget = (type: WidgetType): Widget => {
	switch (type) {
		case "notes":
			return { type, text: "" };
		case "todo":
			return { type, items: [] };
		case "pomodoro":
			return { type, work: 25, rest: 5 };
		case "weather":
			return { type, place: "", lat: 0, lon: 0, unit: "c" };
		case "calendar":
			return { type, url: "", days: 7 };
		case "stocks":
			return { type, symbols: ["AAPL", "MSFT", "BTC-USD"] };
		case "feed":
			return { type, url: "", count: 6 };
	}
};

/** Whether the widget has everything it needs to be saved. */
export const widgetReady = (widget: Widget) => {
	switch (widget.type) {
		case "weather":
			return Boolean(widget.place);
		case "calendar":
		case "feed":
			return /^(https?|webcal):\/\/\S+\.\S+/i.test(widget.url);
		case "stocks":
			return widget.symbols.length > 0;
		default:
			return true;
	}
};

export function WidgetTypePicker({
	value,
	onChange,
}: {
	value: WidgetType;
	onChange: (type: WidgetType) => void;
}) {
	return (
		<div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
			{(Object.keys(WIDGET_TYPES) as WidgetType[]).map((type) => (
				<button
					key={type}
					type="button"
					onClick={() => onChange(type)}
					className={cn(
						"focus-ring flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] transition",
						type === value
							? "border-accent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
							: "border-line hover:border-accent/50",
					)}
				>
					<span className="text-xl leading-none">
						{WIDGET_TYPES[type].icon}
					</span>
					{WIDGET_TYPES[type].label}
				</button>
			))}
		</div>
	);
}

function PlaceSearch({
	widget,
	onChange,
}: {
	widget: Extract<Widget, { type: "weather" }>;
	onChange: (widget: Widget) => void;
}) {
	const [text, setText] = useState("");
	const [submitted, setSubmitted] = useState("");
	const places = useQuery({
		queryKey: ["geocode", submitted],
		queryFn: () => run(call(geocodePlace, { name: submitted })),
		enabled: submitted.length >= 2,
	});
	return (
		<div className="space-y-2">
			{widget.place && (
				<p className="flex items-center gap-1.5 text-sm">
					<MapPin className="size-3.5 text-accent" /> {widget.place}
				</p>
			)}
			<div className="flex gap-2">
				<input
					className="field"
					value={text}
					onChange={(event) => setText(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							setSubmitted(text.trim());
						}
					}}
					placeholder={widget.place ? "Change city…" : "City, e.g. Lisbon"}
				/>
				<button
					type="button"
					className="btn-outline shrink-0"
					onClick={() => setSubmitted(text.trim())}
				>
					{places.isFetching ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Search className="size-4" />
					)}
				</button>
			</div>
			{places.data && (
				<ul className="max-h-40 overflow-y-auto rounded-xl border border-line">
					{places.data.length === 0 && (
						<li className="px-3 py-2 text-sm text-muted">No places found</li>
					)}
					{places.data.map((place) => (
						<li key={`${place.lat},${place.lon}`}>
							<button
								type="button"
								className="w-full px-3 py-2 text-left text-sm hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]"
								onClick={() => {
									onChange({
										...widget,
										place: place.name,
										lat: place.lat,
										lon: place.lon,
									});
									setSubmitted("");
									setText("");
								}}
							>
								{place.name}
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

/** Settings for the widget types that have any. */
export function WidgetConfig({
	widget,
	onChange,
}: {
	widget: Widget;
	onChange: (widget: Widget) => void;
}) {
	switch (widget.type) {
		case "pomodoro":
			return (
				<div className="grid grid-cols-2 gap-3">
					<Field label="Focus (min)">
						<Segmented
							value={widget.work}
							onChange={(work) => onChange({ ...widget, work })}
							options={[15, 25, 50].map((value) => ({
								value,
								label: String(value),
							}))}
						/>
					</Field>
					<Field label="Break (min)">
						<Segmented
							value={widget.rest}
							onChange={(rest) => onChange({ ...widget, rest })}
							options={[5, 10, 15].map((value) => ({
								value,
								label: String(value),
							}))}
						/>
					</Field>
				</div>
			);
		case "weather":
			return (
				<div className="space-y-3">
					<Field label="Location">
						<PlaceSearch widget={widget} onChange={onChange} />
					</Field>
					<Field label="Units">
						<Segmented
							value={widget.unit}
							onChange={(unit) => onChange({ ...widget, unit })}
							options={[
								{ value: "c", label: "°C" },
								{ value: "f", label: "°F" },
							]}
						/>
					</Field>
				</div>
			);
		case "calendar":
			return (
				<div className="space-y-3">
					<Field
						label="Calendar link (iCal / .ics)"
						hint="Google Calendar: Settings → your calendar → “Secret address in iCal format”. Outlook and iCloud have “Publish calendar”. Anyone with this link can see the calendar, so only share boards with people you trust."
					>
						<input
							className="field"
							value={widget.url}
							onChange={(event) =>
								onChange({ ...widget, url: event.target.value.trim() })
							}
							placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
							inputMode="url"
						/>
					</Field>
					<Field label="Show the next">
						<Segmented
							value={widget.days}
							onChange={(days) => onChange({ ...widget, days })}
							options={[1, 3, 7, 14].map((value) => ({
								value,
								label: value === 1 ? "Today" : `${value} days`,
							}))}
						/>
					</Field>
				</div>
			);
		case "stocks":
			return (
				<Field
					label="Symbols"
					hint="Comma separated. Stocks (AAPL), indexes (^GSPC), crypto (BTC-USD), currencies (EURUSD=X)."
				>
					<input
						className="field font-mono uppercase"
						defaultValue={widget.symbols.join(", ")}
						onChange={(event) =>
							onChange({
								...widget,
								symbols: event.target.value
									.split(/[,\s]+/)
									.map((symbol) => symbol.trim().toUpperCase())
									.filter((symbol) => /^[\w.^=-]+$/.test(symbol))
									.slice(0, 12),
							})
						}
					/>
				</Field>
			);
		case "feed":
			return (
				<div className="space-y-3">
					<Field
						label="Website or feed URL"
						hint="Paste a site's address; tabz finds its RSS or Atom feed."
					>
						<input
							className="field"
							value={widget.url}
							onChange={(event) =>
								onChange({ ...widget, url: event.target.value.trim() })
							}
							placeholder="https://www.theverge.com"
							inputMode="url"
						/>
					</Field>
					<Field label="Posts">
						<Segmented
							value={widget.count}
							onChange={(count) => onChange({ ...widget, count })}
							options={[3, 6, 10].map((value) => ({
								value,
								label: String(value),
							}))}
						/>
					</Field>
				</div>
			);
		default:
			return null;
	}
}

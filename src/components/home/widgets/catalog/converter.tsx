import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";
import type { WidgetProps } from "../kit";

type Data = { category: string };

/** Factor to the category's base unit. */
const UNITS: Record<string, Record<string, number>> = {
	length: {
		mm: 0.001,
		cm: 0.01,
		m: 1,
		km: 1000,
		in: 0.0254,
		ft: 0.3048,
		yd: 0.9144,
		mi: 1609.344,
	},
	weight: {
		mg: 0.001,
		g: 1,
		kg: 1000,
		oz: 28.349523125,
		lb: 453.59237,
		st: 6350.29318,
	},
	volume: {
		ml: 0.001,
		l: 1,
		tsp: 0.00492892,
		tbsp: 0.0147868,
		"fl oz": 0.0295735,
		cup: 0.2365882,
		pt: 0.473176,
		qt: 0.946353,
		gal: 3.785411784,
	},
	speed: { "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704, knot: 0.514444 },
	area: {
		"cm²": 0.0001,
		"m²": 1,
		"km²": 1e6,
		"ft²": 0.09290304,
		acre: 4046.8564224,
		ha: 10000,
	},
	data: {
		B: 1,
		KB: 1e3,
		MB: 1e6,
		GB: 1e9,
		TB: 1e12,
		KiB: 1024,
		MiB: 1024 ** 2,
		GiB: 1024 ** 3,
	},
	time: {
		ms: 0.001,
		s: 1,
		min: 60,
		h: 3600,
		day: 86400,
		week: 604800,
		year: 31557600,
	},
	temperature: { "°C": 1, "°F": 1, K: 1 },
};

const toCelsius = (value: number, unit: string) =>
	unit === "°F"
		? ((value - 32) * 5) / 9
		: unit === "K"
			? value - 273.15
			: value;
const fromCelsius = (value: number, unit: string) =>
	unit === "°F" ? (value * 9) / 5 + 32 : unit === "K" ? value + 273.15 : value;

export default function Converter({ data, save, readOnly }: WidgetProps<Data>) {
	const category = data.category in UNITS ? data.category : "length";
	const names = Object.keys(UNITS[category]);
	const [units, setUnits] = useState<[string, string]>([names[0], names[1]]);
	const [from, to] =
		names.includes(units[0]) && names.includes(units[1])
			? units
			: [names[0], names[1]];
	const [value, setValue] = useState("1");
	const amount = Number.parseFloat(value.replace(",", "."));
	const result = Number.isFinite(amount)
		? category === "temperature"
			? fromCelsius(toCelsius(amount, from), to)
			: (amount * UNITS[category][from]) / UNITS[category][to]
		: null;
	const select = (
		current: string,
		onChange: (unit: string) => void,
		label: string,
	) => (
		<select
			className="field w-24 shrink-0"
			value={current}
			onChange={(event) => onChange(event.target.value)}
			aria-label={label}
		>
			{names.map((name) => (
				<option key={name} value={name}>
					{name}
				</option>
			))}
		</select>
	);
	return (
		<div className="space-y-2">
			<select
				className="field capitalize"
				value={category}
				onChange={(event) =>
					!readOnly && save({ category: event.target.value }, { now: true })
				}
				aria-label="Category"
			>
				{Object.keys(UNITS).map((name) => (
					<option key={name} value={name}>
						{name}
					</option>
				))}
			</select>
			<div className="flex gap-1.5">
				<input
					className="field tabular-nums"
					value={value}
					onChange={(event) => setValue(event.target.value)}
					inputMode="decimal"
					aria-label="Value"
				/>
				{select(from, (unit) => setUnits([unit, to]), "From")}
			</div>
			<div className="flex items-center gap-1.5">
				<button
					type="button"
					className="icon-btn"
					aria-label="Swap units"
					onClick={() => setUnits([to, from])}
				>
					<ArrowLeftRight className="size-4" />
				</button>
				<p className="field flex-1 truncate font-medium tabular-nums">
					{result === null
						? "–"
						: Number.parseFloat(result.toPrecision(8)).toLocaleString(
								undefined,
								{ maximumFractionDigits: 8 },
							)}
				</p>
				{select(to, (unit) => setUnits([from, unit]), "To")}
			</div>
		</div>
	);
}

import { useState } from "react";
import { Status, useJson, type WidgetProps } from "../kit";

type Data = { base: string; targets: string[] };

const code = (value: string) =>
	value
		.trim()
		.toUpperCase()
		.replace(/[^A-Z]/g, "")
		.slice(0, 3);

export default function Currency({ data }: WidgetProps<Data>) {
	const base = code(data.base) || "USD";
	const targets = data.targets
		.map(code)
		.filter((target) => target.length === 3 && target !== base)
		.slice(0, 10);
	const [amount, setAmount] = useState("1");
	const query = useJson<{ rates: Record<string, number>; date: string }>(
		`https://api.frankfurter.app/latest?from=${base}${targets.length ? `&to=${targets.join(",")}` : ""}`,
		{ ttl: 3600, refresh: 60 },
	);
	const value = Number.parseFloat(amount.replace(",", ".")) || 0;
	return (
		<div className="space-y-2">
			<label className="flex items-center gap-2">
				<input
					className="field text-lg font-medium tabular-nums"
					value={amount}
					onChange={(event) => setAmount(event.target.value)}
					inputMode="decimal"
					aria-label={`Amount in ${base}`}
				/>
				<span className="font-medium">{base}</span>
			</label>
			<Status query={query}>
				<ul className="divide-y divide-line">
					{Object.entries(query.data?.rates ?? {}).map(([target, rate]) => (
						<li key={target} className="flex justify-between py-1.5 text-sm">
							<span className="text-muted">{target}</span>
							<span className="tabular-nums">
								{new Intl.NumberFormat(undefined, {
									style: "currency",
									currency: target,
								}).format(value * rate)}
							</span>
						</li>
					))}
				</ul>
				{query.data?.date && (
					<p className="pt-1 text-right text-[11px] text-muted">
						ECB rates, {query.data.date}
					</p>
				)}
			</Status>
		</div>
	);
}

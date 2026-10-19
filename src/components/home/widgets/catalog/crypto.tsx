import { cn } from "#/lib/cn";
import { Hint, Status, useJson, type WidgetProps } from "../kit";

type Data = { coins: string[]; currency: string };

export default function Crypto({ data }: WidgetProps<Data>) {
	const coins = data.coins
		.map((coin) => coin.trim().toLowerCase())
		.filter((coin) => /^[a-z0-9-]+$/.test(coin))
		.slice(0, 12);
	const currency = data.currency || "usd";
	const query = useJson<Record<string, Record<string, number>>>(
		coins.length
			? `https://api.coingecko.com/api/v3/simple/price?ids=${coins.join(",")}&vs_currencies=${currency}&include_24hr_change=true`
			: null,
		{ ttl: 120, refresh: 5 },
	);
	if (!coins.length) return <Hint>Add coins in the widget's settings</Hint>;
	const money = new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: currency.toUpperCase(),
		maximumSignificantDigits: 6,
	});
	return (
		<Status query={query}>
			<ul className="divide-y divide-line">
				{coins.map((coin) => {
					const price = query.data?.[coin]?.[currency];
					const change = query.data?.[coin]?.[`${currency}_24h_change`];
					return (
						<li
							key={coin}
							className="flex items-center justify-between gap-2 py-1.5 text-sm"
						>
							<span className="capitalize">{coin.replace(/-/g, " ")}</span>
							<span className="flex items-baseline gap-2 tabular-nums">
								{price === undefined ? (
									<span className="text-muted">not found</span>
								) : (
									money.format(price)
								)}
								{change !== undefined && (
									<span
										className={cn(
											"w-14 text-right text-xs",
											change >= 0 ? "text-emerald-500" : "text-rose-500",
										)}
									>
										{change >= 0 ? "+" : ""}
										{change.toFixed(1)}%
									</span>
								)}
							</span>
						</li>
					);
				})}
			</ul>
		</Status>
	);
}

import { Copy, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Toggle } from "#/components/ui/controls";
import { copyText, randomInt, type WidgetProps } from "../kit";

type Data = { length: number; symbols: boolean; plain?: boolean };

const LETTERS =
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?/~";
const LOOKALIKES = /[Il1O0o]/g;

export default function Password({ data, save, readOnly }: WidgetProps<Data>) {
	const alphabet =
		(data.plain ? LETTERS.replace(LOOKALIKES, "") : LETTERS) +
		(data.symbols ? SYMBOLS : "");
	const length = Math.min(64, Math.max(8, data.length || 20));
	const generate = useCallback(
		() =>
			Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join(
				"",
			),
		[alphabet, length],
	);
	const [password, setPassword] = useState("");
	useEffect(() => setPassword(generate()), [generate]);
	const bits = Math.round(length * Math.log2(alphabet.length));
	const update = (patch: Partial<Data>) =>
		!readOnly && save({ ...data, ...patch }, { now: true });
	return (
		<div className="space-y-2">
			<div className="flex items-center gap-1 rounded-xl border border-line p-1 pl-3">
				<code className="min-w-0 flex-1 truncate font-mono text-sm">
					{password}
				</code>
				<button
					type="button"
					className="icon-btn"
					aria-label="New password"
					onClick={() => setPassword(generate())}
				>
					<RefreshCw className="size-4" />
				</button>
				<button
					type="button"
					className="icon-btn"
					aria-label="Copy password"
					onClick={() => copyText(password, "Password copied")}
				>
					<Copy className="size-4" />
				</button>
			</div>
			<label className="block space-y-1">
				<span className="flex justify-between text-xs text-muted">
					Length{" "}
					<span className="tabular-nums">
						{length} · {bits} bits
					</span>
				</span>
				<input
					type="range"
					min={8}
					max={64}
					value={length}
					onChange={(event) => update({ length: Number(event.target.value) })}
					className="w-full accent-[var(--accent)]"
				/>
			</label>
			<Toggle
				label="Symbols"
				checked={data.symbols}
				onChange={(symbols) => update({ symbols })}
			/>
			<Toggle
				label="Avoid look-alikes (l, 1, O, 0)"
				checked={Boolean(data.plain)}
				onChange={(plain) => update({ plain })}
			/>
		</div>
	);
}

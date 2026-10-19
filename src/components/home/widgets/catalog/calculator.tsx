import { Delete } from "lucide-react";
import { useState } from "react";
import { cn } from "#/lib/cn";
import type { WidgetProps } from "../kit";

/* A small expression parser (no eval): + − × ÷ ^ %, parentheses, functions. */

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };
const FUNCTIONS: Record<string, (x: number) => number> = {
	sqrt: Math.sqrt,
	sin: Math.sin,
	cos: Math.cos,
	tan: Math.tan,
	log: Math.log10,
	ln: Math.log,
	abs: Math.abs,
	round: Math.round,
};

export function evaluate(input: string): number {
	const tokens =
		input
			.replace(/×/g, "*")
			.replace(/÷/g, "/")
			.replace(/−/g, "-")
			.match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z]+|\*\*|[-+*/^%()]/gi) ?? [];
	let index = 0;
	const peek = () => tokens[index];
	const take = () => tokens[index++];
	const expect = (token: string) => {
		if (take() !== token) throw new Error(`Expected ${token}`);
	};
	const expression = (): number => {
		let value = term();
		while (peek() === "+" || peek() === "-")
			value = take() === "+" ? value + term() : value - term();
		return value;
	};
	const term = (): number => {
		let value = power();
		while (peek() === "*" || peek() === "/" || peek() === "%") {
			const op = take();
			const right = power();
			value =
				op === "*" ? value * right : op === "/" ? value / right : value % right;
		}
		return value;
	};
	const power = (): number => {
		const base = unary();
		if (peek() === "^" || peek() === "**") {
			take();
			return base ** power();
		}
		return base;
	};
	const unary = (): number => {
		if (peek() === "-") {
			take();
			return -unary();
		}
		if (peek() === "+") {
			take();
			return unary();
		}
		return atom();
	};
	const atom = (): number => {
		const token = take();
		if (token === undefined) throw new Error("Incomplete");
		if (token === "(") {
			const value = expression();
			expect(")");
			return value;
		}
		if (/^[\d.]/.test(token)) return Number.parseFloat(token);
		const name = token.toLowerCase();
		if (name in CONSTANTS) return CONSTANTS[name];
		if (name in FUNCTIONS) {
			expect("(");
			const value = expression();
			expect(")");
			return FUNCTIONS[name](value);
		}
		throw new Error(`Unknown ${token}`);
	};
	const value = expression();
	if (index < tokens.length) throw new Error("Unexpected input");
	return value;
}

const format = (value: number) =>
	Number.isFinite(value)
		? String(Number.parseFloat(value.toPrecision(12)))
		: "Error";

const KEYS = [
	"(",
	")",
	"%",
	"÷",
	"7",
	"8",
	"9",
	"×",
	"4",
	"5",
	"6",
	"−",
	"1",
	"2",
	"3",
	"+",
	"0",
	".",
	"^",
	"=",
];

export default function Calculator(_: WidgetProps<object>) {
	const [input, setInput] = useState("");
	const [history, setHistory] = useState<string[]>([]);
	let preview = "";
	try {
		preview = input ? format(evaluate(input)) : "";
	} catch {
		preview = "";
	}
	const equals = () => {
		if (!preview || preview === "Error") return;
		setHistory((items) => [`${input} = ${preview}`, ...items].slice(0, 3));
		setInput(preview);
	};
	const press = (key: string) =>
		key === "=" ? equals() : setInput((value) => value + key);
	return (
		<div className="space-y-2">
			{history.map((line) => (
				<p key={line} className="truncate text-right text-xs text-muted">
					{line}
				</p>
			))}
			<input
				className="field text-right font-mono text-lg"
				value={input}
				onChange={(event) => setInput(event.target.value)}
				onKeyDown={(event) => event.key === "Enter" && equals()}
				placeholder="0"
				aria-label="Expression"
				inputMode="decimal"
			/>
			<p className="h-4 text-right text-sm text-muted tabular-nums">
				{preview && preview !== input && `= ${preview}`}
			</p>
			<div className="grid grid-cols-4 gap-1">
				<button
					type="button"
					className="btn-ghost col-span-2 h-9"
					onClick={() => setInput("")}
				>
					Clear
				</button>
				<button
					type="button"
					className="btn-ghost col-span-2 h-9"
					aria-label="Backspace"
					onClick={() => setInput((value) => value.slice(0, -1))}
				>
					<Delete className="size-4" />
				</button>
				{KEYS.map((key) => (
					<button
						key={key}
						type="button"
						onClick={() => press(key)}
						className={cn(
							"focus-ring h-9 rounded-lg text-sm font-medium transition active:scale-95",
							key === "="
								? "bg-accent text-white"
								: /\d|\./.test(key)
									? "bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
									: "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent",
						)}
					>
						{key}
					</button>
				))}
			</div>
		</div>
	);
}

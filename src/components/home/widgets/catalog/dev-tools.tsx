import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { copyText, type WidgetProps } from "../kit";

type Tool = "uuid" | "base64" | "url" | "json" | "sha256";
type Data = { tool: Tool };

const TOOLS: [Tool, string][] = [
	["uuid", "UUID"],
	["base64", "Base64"],
	["url", "URL"],
	["json", "JSON"],
	["sha256", "SHA-256"],
];

const toBase64 = (text: string) =>
	btoa(String.fromCharCode(...new TextEncoder().encode(text)));
const fromBase64 = (text: string) =>
	new TextDecoder().decode(
		Uint8Array.from(atob(text.trim()), (char) => char.charCodeAt(0)),
	);

async function convert(
	tool: Tool,
	input: string,
	reverse: boolean,
): Promise<string> {
	switch (tool) {
		case "uuid":
			return Array.from({ length: 5 }, () => crypto.randomUUID()).join("\n");
		case "base64":
			return reverse ? fromBase64(input) : toBase64(input);
		case "url":
			return reverse ? decodeURIComponent(input) : encodeURIComponent(input);
		case "json":
			return reverse
				? JSON.stringify(JSON.parse(input))
				: JSON.stringify(JSON.parse(input), null, 2);
		case "sha256": {
			const digest = await crypto.subtle.digest(
				"SHA-256",
				new TextEncoder().encode(input),
			);
			return Array.from(new Uint8Array(digest), (byte) =>
				byte.toString(16).padStart(2, "0"),
			).join("");
		}
	}
}

export default function DevTools({ data, save, readOnly }: WidgetProps<Data>) {
	const tool = TOOLS.some(([id]) => id === data.tool) ? data.tool : "uuid";
	const [input, setInput] = useState("");
	const [reverse, setReverse] = useState(false);
	const [output, setOutput] = useState("");
	const [nonce, setNonce] = useState(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: nonce regenerates the UUIDs
	useEffect(() => {
		let cancelled = false;
		if (tool !== "uuid" && !input) return setOutput("");
		convert(tool, input, reverse).then(
			(value) => !cancelled && setOutput(value),
			() => !cancelled && setOutput("⚠ Can't convert that"),
		);
		return () => {
			cancelled = true;
		};
	}, [tool, input, reverse, nonce]);
	const reversible = tool === "base64" || tool === "url" || tool === "json";
	return (
		<div className="space-y-2">
			<div className="flex flex-wrap gap-1">
				{TOOLS.map(([id, label]) => (
					<button
						key={id}
						type="button"
						onClick={() => !readOnly && save({ tool: id }, { now: true })}
						className={`focus-ring rounded-full border px-2.5 py-1 text-xs transition ${id === tool ? "border-accent text-accent" : "border-line hover:border-accent"}`}
					>
						{label}
					</button>
				))}
			</div>
			{tool !== "uuid" && (
				<textarea
					className="field resize-none font-mono text-xs"
					rows={3}
					value={input}
					onChange={(event) => setInput(event.target.value)}
					placeholder="Input"
					aria-label="Input"
				/>
			)}
			{reversible && (
				<label className="flex items-center gap-2 text-xs text-muted">
					<input
						type="checkbox"
						checked={reverse}
						onChange={(event) => setReverse(event.target.checked)}
					/>
					{tool === "json" ? "Minify instead of format" : "Decode"}
				</label>
			)}
			<div className="relative">
				<pre className="max-h-40 min-h-10 overflow-auto rounded-lg bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] p-2 pr-9 font-mono text-xs break-all whitespace-pre-wrap">
					{output}
				</pre>
				{output && (
					<button
						type="button"
						className="icon-btn absolute top-1 right-1 size-7"
						aria-label="Copy"
						onClick={() => copyText(output)}
					>
						<Copy className="size-3.5" />
					</button>
				)}
			</div>
			{tool === "uuid" && (
				<button
					type="button"
					className="btn-ghost w-full text-xs"
					onClick={() => setNonce((value) => value + 1)}
				>
					New UUIDs
				</button>
			)}
		</div>
	);
}

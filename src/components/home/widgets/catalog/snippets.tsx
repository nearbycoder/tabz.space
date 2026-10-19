import { Copy } from "lucide-react";
import { copyText, Hint, type WidgetProps } from "../kit";

type Data = { items: string[] };

/** "Label | text" or just text. */
const parse = (line: string) => {
	const [label, ...rest] = line.split("|");
	return rest.length
		? { label: label.trim(), text: rest.join("|").trim() }
		: { label: line.trim(), text: line.trim() };
};

export default function Snippets({ data }: WidgetProps<Data>) {
	if (!data.items.length)
		return <Hint>Add snippets in the widget's settings</Hint>;
	return (
		<ul className="space-y-0.5">
			{data.items.map(parse).map((snippet) => (
				<li key={`${snippet.label}|${snippet.text}`}>
					<button
						type="button"
						onClick={() => copyText(snippet.text, `Copied “${snippet.label}”`)}
						className="focus-ring group/snip flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]"
					>
						<span className="min-w-0 flex-1 truncate">{snippet.label}</span>
						<Copy className="size-3.5 shrink-0 text-muted opacity-0 group-hover/snip:opacity-100" />
					</button>
				</li>
			))}
		</ul>
	);
}

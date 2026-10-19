import type { ReactNode } from "react";
import type { WidgetProps } from "../kit";

type Data = { text: string };

/*
 * A small, safe Markdown renderer: builds React elements (never raw HTML),
 * and links only to http(s) and mailto addresses.
 */

const INLINE =
	/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function inline(text: string): ReactNode[] {
	return text.split(INLINE).map((part, index) => {
		const key = `${index}-${part}`;
		if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
			return <strong key={key}>{part.slice(2, -2)}</strong>;
		if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
			return (
				<code
					key={key}
					className="rounded bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] px-1 font-mono text-[0.85em]"
				>
					{part.slice(1, -1)}
				</code>
			);
		const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
		if (link)
			return /^(https?:|mailto:)/i.test(link[2]) ? (
				<a
					key={key}
					href={link[2]}
					target="_blank"
					rel="noreferrer"
					className="text-accent underline-offset-2 hover:underline"
				>
					{link[1]}
				</a>
			) : (
				link[1]
			);
		if (
			(part.startsWith("*") && part.endsWith("*")) ||
			(part.startsWith("_") && part.endsWith("_"))
		)
			return part.length > 2 ? <em key={key}>{part.slice(1, -1)}</em> : part;
		return part;
	});
}

export function renderMarkdown(source: string) {
	const blocks: ReactNode[] = [];
	const lines = source.replace(/\r/g, "").split("\n");
	let index = 0;
	while (index < lines.length) {
		const line = lines[index];
		const key = `block-${index}`;
		if (line.startsWith("```")) {
			const code: string[] = [];
			index++;
			while (index < lines.length && !lines[index].startsWith("```"))
				code.push(lines[index++]);
			index++;
			blocks.push(
				<pre
					key={key}
					className="overflow-x-auto rounded-lg bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] p-2 font-mono text-xs"
				>
					{code.join("\n")}
				</pre>,
			);
			continue;
		}
		const heading = line.match(/^(#{1,3})\s+(.*)$/);
		if (heading) {
			const size = ["text-lg", "text-base", "text-sm"][heading[1].length - 1];
			blocks.push(
				<p key={key} className={`${size} font-semibold`}>
					{inline(heading[2])}
				</p>,
			);
			index++;
			continue;
		}
		const listMatch = /^\s*([-*+]|\d+[.)])\s+/;
		if (listMatch.test(line)) {
			const ordered = /^\s*\d/.test(line);
			const items: ReactNode[] = [];
			while (index < lines.length && listMatch.test(lines[index])) {
				const text = lines[index].replace(listMatch, "");
				const task = text.match(/^\[( |x)\]\s+(.*)$/i);
				items.push(
					<li key={index}>
						{task ? (
							<>
								<span className="mr-1">{task[1].trim() ? "☑" : "☐"}</span>
								{inline(task[2])}
							</>
						) : (
							inline(text)
						)}
					</li>,
				);
				index++;
			}
			blocks.push(
				ordered ? (
					<ol key={key} className="list-decimal space-y-0.5 pl-5">
						{items}
					</ol>
				) : (
					<ul key={key} className="list-disc space-y-0.5 pl-5">
						{items}
					</ul>
				),
			);
			continue;
		}
		if (line.startsWith(">")) {
			blocks.push(
				<blockquote
					key={key}
					className="border-l-2 border-accent pl-3 text-muted"
				>
					{inline(line.replace(/^>\s?/, ""))}
				</blockquote>,
			);
			index++;
			continue;
		}
		if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
			blocks.push(<hr key={key} className="border-line" />);
			index++;
			continue;
		}
		if (line.trim()) {
			const paragraph: string[] = [];
			while (
				index < lines.length &&
				lines[index].trim() &&
				!/^(#{1,3}\s|```|>|\s*([-*+]|\d+[.)])\s)/.test(lines[index])
			)
				paragraph.push(lines[index++]);
			blocks.push(<p key={key}>{inline(paragraph.join(" "))}</p>);
			continue;
		}
		index++;
	}
	return blocks;
}

export default function Markdown({ data }: WidgetProps<Data>) {
	return (
		<div className="space-y-2 text-sm leading-relaxed break-words">
			{renderMarkdown(data.text)}
		</div>
	);
}

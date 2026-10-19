import { Hint, type WidgetProps } from "../kit";

type Data = { url: string; height: number };

export default function Embed({ data }: WidgetProps<Data>) {
	if (!/^https:\/\//i.test(data.url))
		return <Hint>Add an https:// link in the widget's settings</Hint>;
	return (
		<iframe
			src={data.url}
			title="Embedded page"
			loading="lazy"
			// The page keeps its own origin; it can't reach tabz or navigate this tab.
			sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
			referrerPolicy="no-referrer"
			className="w-full rounded-xl border border-line bg-white"
			style={{ height: Math.min(1200, Math.max(120, data.height || 360)) }}
		/>
	);
}

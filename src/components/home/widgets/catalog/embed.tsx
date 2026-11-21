import { Hint, type WidgetProps } from "../kit";

type Data = { url: string; height: number };

export default function Embed({ data }: WidgetProps<Data>) {
	let safeUrl: string | null = null;
	if (/^https:\/\//i.test(data.url)) {
		try {
			const parsed = new URL(data.url);
			if (
				typeof window === "undefined" ||
				parsed.origin !== window.location.origin
			)
				safeUrl = parsed.toString();
		} catch {}
	}
	if (!safeUrl)
		return <Hint>Add an external https:// link in the widget's settings</Hint>;
	return (
		<iframe
			src={safeUrl}
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

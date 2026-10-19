import { Hint, type WidgetProps } from "../kit";

type Data = { url: string };

/** Watch, short, youtu.be and playlist links → a privacy-friendly embed URL. */
export function youtubeEmbed(raw: string) {
	try {
		const url = new URL(raw);
		const host = url.hostname.replace(/^(www|m|music)\./, "");
		const list = url.searchParams.get("list");
		let id: string | null = null;
		if (host === "youtu.be") id = url.pathname.slice(1);
		else if (host === "youtube.com" || host === "youtube-nocookie.com") {
			id =
				url.searchParams.get("v") ??
				url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/)?.[1] ??
				null;
		} else return null;
		if (id && /^[\w-]{6,}$/.test(id))
			return `https://www.youtube-nocookie.com/embed/${id}${list ? `?list=${encodeURIComponent(list)}` : ""}`;
		if (list)
			return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}`;
	} catch {}
	return null;
}

export default function YouTube({ data }: WidgetProps<Data>) {
	const src = youtubeEmbed(data.url);
	if (!src)
		return (
			<Hint>
				Paste a YouTube video or playlist link in the widget's settings
			</Hint>
		);
	return (
		<iframe
			src={src}
			title="YouTube video"
			loading="lazy"
			allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
			allowFullScreen
			referrerPolicy="strict-origin-when-cross-origin"
			className="aspect-video w-full rounded-xl"
		/>
	);
}

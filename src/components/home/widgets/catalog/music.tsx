import { Hint, type WidgetProps } from "../kit";

type Data = { url: string };

function musicEmbed(raw: string): { src: string; height: number } | null {
	try {
		const url = new URL(raw);
		const host = url.hostname.replace(/^www\./, "");
		if (host === "open.spotify.com") {
			const match = url.pathname.match(
				/(track|album|playlist|episode|show|artist)\/(\w+)/,
			);
			if (match)
				return {
					src: `https://open.spotify.com/embed/${match[1]}/${match[2]}`,
					height: match[1] === "track" || match[1] === "episode" ? 152 : 352,
				};
		}
		if (host === "music.apple.com" || host === "podcasts.apple.com")
			return {
				src: `https://embed.${host}${url.pathname}${url.search}`,
				height: url.searchParams.has("i") ? 175 : 450,
			};
		if (host === "soundcloud.com")
			return {
				src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.href)}&visual=false&color=%236366f1`,
				height: url.pathname.includes("/sets/") ? 350 : 166,
			};
	} catch {}
	return null;
}

export default function Music({ data }: WidgetProps<Data>) {
	const embed = musicEmbed(data.url);
	if (!embed)
		return (
			<Hint>
				Paste a Spotify, Apple Music or SoundCloud link in the widget's settings
			</Hint>
		);
	return (
		<iframe
			src={embed.src}
			title="Music player"
			loading="lazy"
			allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
			className="w-full rounded-xl"
			style={{ height: embed.height }}
		/>
	);
}

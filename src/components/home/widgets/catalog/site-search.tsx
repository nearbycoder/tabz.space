import { Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { WidgetProps } from "../kit";

type Data = { site: string };

const SITES: Record<string, [label: string, url: string]> = {
	youtube: ["YouTube", "https://www.youtube.com/results?search_query="],
	github: ["GitHub", "https://github.com/search?q="],
	wikipedia: ["Wikipedia", "https://en.wikipedia.org/w/index.php?search="],
	reddit: ["Reddit", "https://www.reddit.com/search/?q="],
	stackoverflow: ["Stack Overflow", "https://stackoverflow.com/search?q="],
	mdn: ["MDN", "https://developer.mozilla.org/en-US/search?q="],
	npm: ["npm", "https://www.npmjs.com/search?q="],
	amazon: ["Amazon", "https://www.amazon.com/s?k="],
	maps: ["Google Maps", "https://www.google.com/maps/search/"],
	imdb: ["IMDb", "https://www.imdb.com/find/?q="],
	spotify: ["Spotify", "https://open.spotify.com/search/"],
	x: ["X", "https://x.com/search?q="],
	hn: ["Hacker News", "https://hn.algolia.com/?q="],
	translate: [
		"Google Translate",
		"https://translate.google.com/?op=translate&text=",
	],
};

export default function SiteSearch({
	data,
	save,
	readOnly,
}: WidgetProps<Data>) {
	const site = data.site in SITES ? data.site : "youtube";
	const [query, setQuery] = useState("");
	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!query.trim()) return;
		window.open(
			SITES[site][1] + encodeURIComponent(query.trim()),
			"_blank",
			"noopener",
		);
		setQuery("");
	};
	return (
		<form onSubmit={submit} className="space-y-1.5">
			<select
				className="field"
				value={site}
				onChange={(event) =>
					!readOnly && save({ site: event.target.value }, { now: true })
				}
				aria-label="Site"
			>
				{Object.entries(SITES).map(([id, [label]]) => (
					<option key={id} value={id}>
						{label}
					</option>
				))}
			</select>
			<div className="flex gap-1.5">
				<input
					className="field"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={`Search ${SITES[site][0]}…`}
					aria-label={`Search ${SITES[site][0]}`}
				/>
				<button
					type="submit"
					className="btn-primary shrink-0"
					aria-label="Search"
				>
					<Search className="size-4" />
				</button>
			</div>
		</form>
	);
}

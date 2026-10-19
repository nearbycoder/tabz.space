import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { freshKey, pad, Status, useJson, type WidgetProps } from "../kit";

type Data = { mode: "featured" | "random" };
type Summary = {
	titles?: { normalized?: string };
	extract?: string;
	thumbnail?: { source?: string };
	content_urls?: { desktop?: { page?: string } };
};

const FIELDS = [
	"titles.normalized",
	"extract",
	"thumbnail.source",
	"content_urls.desktop.page",
];

export default function Wikipedia({ data }: WidgetProps<Data>) {
	const [nonce, setNonce] = useState(freshKey);
	const today = new Date();
	const random = data.mode === "random";
	const query = useJson<Summary | { tfa?: Summary }>(
		random
			? `https://en.wikipedia.org/api/rest_v1/page/random/summary?n=${nonce}`
			: `https://api.wikimedia.org/feed/v1/wikipedia/en/featured/${today.getFullYear()}/${pad(today.getMonth() + 1)}/${pad(today.getDate())}`,
		{
			pick: random ? FIELDS : FIELDS.map((field) => `tfa.${field}`),
			ttl: random ? 30 : 21_600,
			refresh: random ? 0 : 360,
		},
	);
	const article = (
		query.data && "tfa" in query.data ? query.data.tfa : query.data
	) as Summary | undefined;
	return (
		<Status query={query}>
			{article?.titles ? (
				<div className="space-y-2">
					{article.thumbnail?.source && (
						<img
							src={article.thumbnail.source}
							alt=""
							loading="lazy"
							className="max-h-40 w-full rounded-xl object-cover"
						/>
					)}
					<a
						href={article.content_urls?.desktop?.page}
						target="_blank"
						rel="noreferrer"
						className="block font-medium hover:underline"
					>
						{article.titles.normalized}
					</a>
					<p className="line-clamp-5 text-sm text-muted">{article.extract}</p>
					{random && (
						<button
							type="button"
							className="btn-ghost text-xs"
							onClick={() => setNonce(freshKey())}
						>
							<RefreshCw className="size-3.5" /> Another article
						</button>
					)}
				</div>
			) : (
				<p className="py-3 text-center text-sm text-muted">No article today</p>
			)}
		</Status>
	);
}

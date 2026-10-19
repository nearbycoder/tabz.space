import { CircleDot, GitFork, Star } from "lucide-react";
import { Hint, useJson, type WidgetProps } from "../kit";

type Data = { repos: string[] };
type Repo = {
	full_name: string;
	description: string | null;
	stargazers_count: number;
	forks_count: number;
	open_issues_count: number;
	html_url: string;
	language: string | null;
};

const compact = (value: number) =>
	new Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);

function RepoRow({ name }: { name: string }) {
	const query = useJson<Repo>(`https://api.github.com/repos/${name}`, {
		pick: [
			"full_name",
			"description",
			"stargazers_count",
			"forks_count",
			"open_issues_count",
			"html_url",
			"language",
		],
		ttl: 1800,
		refresh: 30,
	});
	const repo = query.data;
	return (
		<a
			href={repo?.html_url ?? `https://github.com/${name}`}
			target="_blank"
			rel="noreferrer"
			className="block rounded-lg px-1.5 py-1.5 hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]"
		>
			<p className="truncate text-sm font-medium">{name}</p>
			{query.error ? (
				<p className="text-xs text-muted">Couldn't load this repo</p>
			) : (
				<>
					{repo?.description && (
						<p className="truncate text-xs text-muted">{repo.description}</p>
					)}
					<p className="mt-0.5 flex gap-3 text-xs text-muted tabular-nums">
						<span className="flex items-center gap-1">
							<Star className="size-3" />
							{repo ? compact(repo.stargazers_count) : "–"}
						</span>
						<span className="flex items-center gap-1">
							<GitFork className="size-3" />
							{repo ? compact(repo.forks_count) : "–"}
						</span>
						<span className="flex items-center gap-1">
							<CircleDot className="size-3" />
							{repo ? compact(repo.open_issues_count) : "–"}
						</span>
						{repo?.language && <span>{repo.language}</span>}
					</p>
				</>
			)}
		</a>
	);
}

export default function GithubRepo({ data }: WidgetProps<Data>) {
	const repos = data.repos
		.map((repo) => repo.trim().replace(/^https?:\/\/github\.com\//, ""))
		.filter((repo) => /^[\w.-]+\/[\w.-]+$/.test(repo));
	if (!repos.length)
		return <Hint>Add repositories (owner/name) in the widget's settings</Hint>;
	return (
		<div className="space-y-0.5">
			{repos.slice(0, 8).map((repo) => (
				<RepoRow key={repo} name={repo} />
			))}
		</div>
	);
}

import { Shuffle, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Favicon } from "#/components/ui/Favicon";
import { useHomeAction } from "#/lib/home-query";
import { allLinks } from "#/lib/smart";
import { hostnameOf } from "#/lib/url";
import { deleteBookmark } from "#/server/home";
import { useHomeContext } from "./context";
import type { LinkItem } from "./types";

const HIDDEN_KEY = "tabz:rediscover:hidden";
const MONTH = 30 * 24 * 60 * 60_000;

/** Small seeded PRNG so the picks stay the same all day. */
const seeded = (seed: number) => () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const ago = (value: Date | string) => {
	const days = Math.round(
		(Date.now() - new Date(value).getTime()) / 86_400_000,
	);
	if (days < 60) return `${days} days ago`;
	if (days < 365) return `${Math.round(days / 30)} months ago`;
	return `${Math.round(days / 365)} year${days < 730 ? "" : "s"} ago`;
};

/** Links you saved but haven't opened in a month or more, three a day. */
export function Rediscover() {
	const { boards, settings, isIncognito, openLink } = useHomeContext();
	const [today, setToday] = useState<string | null>(null);
	const [hidden, setHidden] = useState(true);
	const [round, setRound] = useState(0);
	const remove = useHomeAction(deleteBookmark, {
		undoable: () => "Moved to trash",
	});

	// Day-dependent, so only decided in the browser.
	useEffect(() => {
		const day = new Date().toDateString();
		setToday(day);
		setHidden(localStorage.getItem(HIDDEN_KEY) === day);
	}, []);

	const picks = useMemo(() => {
		if (!today) return [];
		const pool = allLinks(boards).filter(
			(link) =>
				!isIncognito(link) &&
				Date.now() - new Date(link.lastVisitedAt ?? link.createdAt).getTime() >
					MONTH,
		);
		let seed = round;
		for (const char of today) seed = (seed * 31 + char.charCodeAt(0)) | 0;
		const random = seeded(seed);
		return pool
			.map((link) => ({ link, order: random() }))
			.sort((a, b) => a.order - b.order)
			.slice(0, 3)
			.map(({ link }) => link);
	}, [boards, isIncognito, today, round]);

	if (!settings.showRediscover || hidden || picks.length === 0) return null;

	return (
		<section
			className="glass animate-pop mx-auto mt-6 w-full max-w-3xl rounded-3xl p-4"
			aria-label="Rediscover"
		>
			<header className="mb-3 flex items-center gap-2">
				<Sparkles className="size-4 text-accent" />
				<h2 className="text-sm font-semibold">Rediscover</h2>
				<span className="hidden text-xs text-muted sm:inline">
					Saved a while ago, not opened since
				</span>
				<button
					type="button"
					className="icon-btn ml-auto size-7"
					aria-label="Shuffle"
					title="Shuffle"
					onClick={() => setRound((n) => n + 1)}
				>
					<Shuffle className="size-3.5" />
				</button>
				<button
					type="button"
					className="icon-btn size-7"
					aria-label="Hide for today"
					title="Hide for today"
					onClick={() => {
						localStorage.setItem(HIDDEN_KEY, today ?? "");
						setHidden(true);
					}}
				>
					<X className="size-3.5" />
				</button>
			</header>
			<ul className="grid gap-2 sm:grid-cols-3">
				{picks.map((link: LinkItem) => (
					<li key={link.id} className="group/pick relative">
						<button
							type="button"
							onClick={() => openLink(link, { newTab: true })}
							className="focus-ring flex w-full items-center gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] p-3 text-left transition hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)]"
						>
							<Favicon
								url={link.url}
								icon={link.icon}
								favicon={link.meta.favicon}
								title={link.title}
								className="size-8 shrink-0 rounded-lg text-xl"
							/>
							<span className="min-w-0">
								<span className="block truncate text-sm font-medium">
									{link.title}
								</span>
								<span className="block truncate text-xs text-muted">
									{hostnameOf(link.url)} ·{" "}
									{ago(link.lastVisitedAt ?? link.createdAt)}
								</span>
							</span>
						</button>
						<button
							type="button"
							aria-label={`Move ${link.title} to trash`}
							title="Not useful anymore? Move to trash"
							onClick={() => remove.mutate({ id: link.id })}
							className="icon-btn absolute top-1 right-1 size-6 opacity-0 group-hover/pick:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-60"
						>
							<Trash2 className="size-3" />
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}

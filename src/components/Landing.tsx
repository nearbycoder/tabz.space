import { Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Bot,
	LayoutGrid,
	Puzzle,
	Search,
	Sparkles,
} from "lucide-react";
import { Logo } from "./Logo";

const demo = [
	{
		name: "Daily",
		color: "#6366f1",
		items: [
			"mail.google.com",
			"calendar.google.com",
			"youtube.com",
			"reddit.com",
		],
	},
	{
		name: "Build",
		color: "#10b981",
		items: ["github.com", "railway.com", "developer.mozilla.org", "vercel.com"],
	},
	{
		name: "Read",
		color: "#f59e0b",
		items: [
			"news.ycombinator.com",
			"wikipedia.org",
			"theverge.com",
			"arstechnica.com",
		],
	},
];

const features = [
	{
		icon: LayoutGrid,
		title: "Your grid, your way",
		body: "Boards, groups, tiles, cards or lists. Drag anything anywhere.",
	},
	{
		icon: Search,
		title: "Search + jump",
		body: "One box searches the web or your bookmarks. Press / from anywhere.",
	},
	{
		icon: Puzzle,
		title: "One-click save",
		body: "The browser extension adds the page you're on in a second.",
	},
	{
		icon: Sparkles,
		title: "Make it yours",
		body: "Themes, accents, backgrounds, clock, greeting — all optional.",
	},
	{
		icon: Bot,
		title: "Works with your AI",
		body: "Connect Claude, Cursor or any MCP client. Sign in once, no API keys.",
	},
];

export function Landing() {
	return (
		<div className="relative min-h-dvh overflow-hidden">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(at 15% 0%, #6366f140 0, transparent 45%), radial-gradient(at 85% 10%, #ec489930 0, transparent 45%), radial-gradient(at 50% 100%, #0ea5e925 0, transparent 50%)",
				}}
			/>
			<header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
				<Logo className="text-lg" />
				<nav className="flex items-center gap-2">
					<Link to="/sign-in" className="btn-ghost">
						Sign in
					</Link>
					<Link to="/sign-up" className="btn-primary">
						Get started
					</Link>
				</nav>
			</header>

			<main className="relative mx-auto max-w-6xl px-6 pb-24">
				<section className="mx-auto max-w-2xl pt-16 text-center sm:pt-24">
					<h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
						The home page your browser should have shipped with.
					</h1>
					<p className="mx-auto mt-5 max-w-lg text-lg text-muted text-pretty">
						Tabz is a calm, fast start page for everything you open every day.
						Organize bookmarks into beautiful grids and get anywhere in a
						keystroke.
					</p>
					<div className="mt-8 flex justify-center gap-3">
						<Link to="/sign-up" className="btn-primary px-5 py-2.5 text-base">
							Create your space <ArrowRight className="size-4" />
						</Link>
					</div>
				</section>

				<section className="glass mx-auto mt-16 max-w-4xl rounded-3xl p-5 shadow-2xl shadow-black/10 sm:p-8">
					<div className="glass mx-auto mb-6 flex max-w-lg items-center gap-3 rounded-2xl px-4 py-3 text-muted">
						<Search className="size-4" /> Search Google or your tabz…
					</div>
					<div className="grid gap-4 sm:grid-cols-3">
						{demo.map((group) => (
							<div
								key={group.name}
								className="rounded-2xl border border-line bg-surface-2 p-4"
							>
								<div className="mb-3 flex items-center gap-2 text-sm font-medium">
									<span
										className="size-2 rounded-full"
										style={{ background: group.color }}
									/>
									{group.name}
								</div>
								<div className="grid grid-cols-4 gap-2">
									{group.items.map((host) => (
										<div
											key={host}
											className="grid aspect-square place-items-center rounded-xl bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]"
										>
											<img
												src={`https://www.google.com/s2/favicons?sz=64&domain_url=${host}`}
												alt=""
												className="size-6"
												loading="lazy"
											/>
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				</section>

				<section className="mx-auto mt-20 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{features.map(({ icon: Icon, title, body }) => (
						<div key={title} className="flex gap-4">
							<div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
								<Icon className="size-5" />
							</div>
							<div>
								<h3 className="font-medium">{title}</h3>
								<p className="mt-1 text-sm text-muted">{body}</p>
							</div>
						</div>
					))}
				</section>
			</main>
		</div>
	);
}

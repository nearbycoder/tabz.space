import { Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Bot,
	Check,
	Command,
	Lock,
	MonitorSmartphone,
	Play,
	Puzzle,
	Share2,
	Sparkles,
	WifiOff,
	Zap,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "#/lib/cn";
import { Logo } from "./Logo";

/*
 * The signed-out home page. Real screenshots of the app; only the hero image
 * loads up front, the rest lazily, and the demo video only when scrolled to.
 */

const MEDIA = "/landing";

function Shot({
	src,
	alt,
	width,
	height,
	eager,
	className,
}: {
	src: string;
	alt: string;
	width: number;
	height: number;
	eager?: boolean;
	className?: string;
}) {
	return (
		<img
			src={`${MEDIA}/${src}`}
			alt={alt}
			width={width}
			height={height}
			loading={eager ? "eager" : "lazy"}
			decoding="async"
			fetchPriority={eager ? "high" : "auto"}
			className={cn("block h-auto w-full", className)}
		/>
	);
}

/** A browser window around a screenshot. */
function Frame({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"overflow-hidden rounded-2xl border border-white/10 bg-[#0f1015] shadow-2xl shadow-black/30 ring-1 ring-black/5",
				className,
			)}
		>
			<div className="flex h-8 items-center gap-1.5 border-b border-white/10 bg-[#17181e] px-3">
				<span className="size-2.5 rounded-full bg-[#ff5f57]" />
				<span className="size-2.5 rounded-full bg-[#febc2e]" />
				<span className="size-2.5 rounded-full bg-[#28c840]" />
				<span className="ml-3 rounded-md bg-black/30 px-2.5 py-0.5 text-[11px] text-white/50">
					tabz.space
				</span>
			</div>
			{children}
		</div>
	);
}

/** The demo video, fetched only once it's about to scroll into view. */
function DemoVideo() {
	const ref = useRef<HTMLVideoElement>(null);
	const [load, setLoad] = useState(false);
	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setLoad(true);
					observer.disconnect();
				}
			},
			{ rootMargin: "400px" },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	return (
		<video
			ref={ref}
			src={load ? `${MEDIA}/demo.mp4` : undefined}
			poster={`${MEDIA}/hero.webp`}
			width={1280}
			height={800}
			autoPlay
			muted
			loop
			playsInline
			preload="none"
			aria-label="tabz demo: searching, the command palette, switching boards and adding a widget"
			className="block h-auto w-full"
		/>
	);
}

function Feature({
	eyebrow,
	title,
	body,
	points,
	children,
	flip,
}: {
	eyebrow: string;
	title: string;
	body: string;
	points: string[];
	children: ReactNode;
	flip?: boolean;
}) {
	return (
		<section
			className={cn(
				"grid items-center gap-10 lg:gap-14",
				// The screenshot always gets the wider column.
				flip ? "lg:grid-cols-[3fr_2fr]" : "lg:grid-cols-[2fr_3fr]",
			)}
		>
			<div className={cn(flip && "lg:order-2")}>
				<p className="text-sm font-medium text-accent">{eyebrow}</p>
				<h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
					{title}
				</h2>
				<p className="mt-4 text-lg text-muted text-pretty">{body}</p>
				<ul className="mt-6 space-y-2.5">
					{points.map((point) => (
						<li key={point} className="flex gap-2.5 text-sm">
							<Check className="mt-0.5 size-4 shrink-0 text-accent" />
							<span>{point}</span>
						</li>
					))}
				</ul>
			</div>
			<div className={cn(flip && "lg:order-1")}>{children}</div>
		</section>
	);
}

const more = [
	{
		icon: Lock,
		title: "A vault no one can see",
		body: "A hidden space, end-to-end encrypted in your browser and opened with a PIN. It even has a decoy.",
	},
	{
		icon: WifiOff,
		title: "Instant, even offline",
		body: "New tabs open from a copy on your device in milliseconds, then quietly refresh.",
	},
	{
		icon: Sparkles,
		title: "Tidies itself",
		body: "Smart groups fill themselves, dead links get flagged, and sites with new posts get a badge.",
	},
	{
		icon: Share2,
		title: "Share boards",
		body: "Publish a board with a link, or invite people to edit it with you.",
	},
	{
		icon: Puzzle,
		title: "Save from anywhere",
		body: "Extensions for Chrome, Edge, Brave and Firefox, your phone's share sheet, email and an API.",
	},
	{
		icon: Bot,
		title: "Works with your AI",
		body: "Connect Claude or any MCP client to search and organize your links. No API keys.",
	},
];

export function Landing() {
	return (
		<div className="relative min-h-dvh overflow-hidden">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 top-0 h-[1100px]"
				style={{
					background:
						"radial-gradient(900px 520px at 80% 0%, rgb(139 92 246 / .28), transparent 65%), radial-gradient(700px 500px at 10% 10%, rgb(99 102 241 / .22), transparent 60%), radial-gradient(600px 400px at 55% 60%, rgb(236 72 153 / .12), transparent 60%)",
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
				{/* Hero */}
				<section className="mx-auto max-w-3xl pt-12 text-center sm:pt-20">
					<p className="glass mx-auto inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted">
						<Zap className="size-3.5 text-accent" /> 71 widgets, ⌘K search and a
						private vault
					</p>
					<h1 className="mt-6 text-5xl font-semibold tracking-tight text-balance sm:text-7xl">
						Your home{" "}
						<span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
							on the web.
						</span>
					</h1>
					<p className="mx-auto mt-6 max-w-xl text-lg text-muted text-pretty sm:text-xl">
						A beautiful, instant start page for everything you open every day:
						your bookmarks, boards and widgets, one keystroke away.
					</p>
					<div className="mt-9 flex flex-wrap justify-center gap-3">
						<Link to="/sign-up" className="btn-primary px-5 py-2.5 text-base">
							Create your space <ArrowRight className="size-4" />
						</Link>
						<a href="#demo" className="btn-outline px-5 py-2.5 text-base">
							<Play className="size-4" /> Watch the demo
						</a>
					</div>
					<p className="mt-5 text-sm text-muted">
						Free · Set up in a minute · Chrome, Edge, Brave &amp; Firefox
					</p>
				</section>

				<div className="relative mx-auto mt-14 max-w-5xl sm:mt-16">
					<div
						aria-hidden
						className="absolute -inset-x-10 -inset-y-6 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,rgb(139_92_246/.35),transparent)] blur-2xl"
					/>
					<Frame>
						<Shot
							src="hero.webp"
							alt="A tabz board with links, weather, a to-do list and reading list over a mountain wallpaper"
							width={1280}
							height={800}
							eager
						/>
					</Frame>
				</div>

				{/* Features */}
				<div className="mt-28 space-y-28 sm:mt-36 sm:space-y-36">
					<Feature
						eyebrow="Search"
						title="Find anything in a keystroke"
						body="Press ⌘K or / and type. Every link, folder and board, plus the text of the pages you've saved, or straight to the web."
						points={[
							"Jump to boards and run actions from the keyboard",
							"Searches inside the pages you've saved",
							"The search box is ready the moment a tab opens",
						]}
					>
						<Frame>
							<Shot
								src="command-palette.webp"
								alt="The command palette searching links across boards"
								width={1280}
								height={800}
							/>
						</Frame>
					</Feature>

					<Feature
						flip
						eyebrow="Widgets"
						title="71 widgets, right next to your links"
						body="Weather, calendar, habits, a kanban board, Hacker News, GitHub repos, crypto, world clocks, a focus timer, ambient sound and dozens more."
						points={[
							"Each widget loads only when it's on screen, so tabz stays fast",
							"Build your own with HTML, CSS and JavaScript, in a sandbox",
							"Or point the no-code JSON widget at any API",
						]}
					>
						<div className="space-y-4">
							<Frame>
								<Shot
									src="widgets.webp"
									alt="A board of widgets: kanban, Hacker News, focus timer, notes, GitHub repos and crypto prices"
									width={1280}
									height={800}
								/>
							</Frame>
							<div className="grid grid-cols-2 gap-4">
								<div className="overflow-hidden rounded-2xl border border-white/10 shadow-xl shadow-black/20">
									<Shot
										src="widget-gallery.webp"
										alt="The widget gallery"
										width={560}
										height={700}
									/>
								</div>
								<div className="overflow-hidden rounded-2xl border border-white/10 shadow-xl shadow-black/20">
									<Shot
										src="custom-widget.webp"
										alt="Building a custom widget with a live preview"
										width={560}
										height={700}
									/>
								</div>
							</div>
						</div>
					</Feature>

					<Feature
						eyebrow="Make it yours"
						title="Light, dark and everything in between"
						body="Photo wallpapers, gradients and patterns, theme presets, fonts, corner styles, glass or solid panels, community themes and custom CSS."
						points={[
							"Boards for work, home and weekends, switching by time of day",
							"Folders inside folders, as deep as you like",
							"Tiles, cards, lists or live previews, with drag and drop everywhere",
						]}
					>
						<Frame>
							<Shot
								src="light.webp"
								alt="tabz in light mode with a photo frame, a Spotify player and recipes"
								width={1280}
								height={800}
							/>
						</Frame>
					</Feature>

					<Feature
						flip
						eyebrow="Everywhere"
						title="Made for your phone too"
						body="Add tabz to your Home Screen for an app that opens instantly: swipe between boards, save links from any app's share sheet, and reach everything with your thumb."
						points={[
							"Works offline, and opens without a flash",
							"Touch-friendly sheets and a dock",
							"Your boards sync across every device",
						]}
					>
						<div className="flex items-start justify-center gap-4 sm:gap-6">
							{(
								[
									[
										"mobile-home.webp",
										"tabz on a phone: clock, search and links",
									],
									[
										"mobile-widgets.webp",
										"tabz on a phone: kanban, Hacker News and a focus timer",
									],
								] as const
							).map(([src, alt], index) => (
								<div
									key={src}
									className={cn(
										"w-[46%] max-w-[260px] overflow-hidden rounded-[2rem] border-4 border-black/80 shadow-2xl shadow-black/30 ring-1 ring-white/10",
										index === 1 && "mt-10",
									)}
								>
									<Shot src={src} alt={alt} width={430} height={932} />
								</div>
							))}
						</div>
					</Feature>
				</div>

				{/* Demo */}
				<section id="demo" className="mt-32 scroll-mt-10 sm:mt-40">
					<div className="mx-auto max-w-2xl text-center">
						<h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
							See it in action
						</h2>
						<p className="mt-3 text-lg text-muted">
							Search, jump around with ⌘K, switch boards and add a widget, in
							about 30 seconds.
						</p>
					</div>
					<Frame className="mx-auto mt-10 max-w-5xl">
						<DemoVideo />
					</Frame>
				</section>

				{/* Everything else */}
				<section className="mt-32 sm:mt-40">
					<h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
						And a lot more
					</h2>
					<div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{more.map(({ icon: Icon, title, body }) => (
							<div key={title} className="glass rounded-2xl p-5">
								<div className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent">
									<Icon className="size-5" />
								</div>
								<h3 className="mt-4 font-medium">{title}</h3>
								<p className="mt-1.5 text-sm text-muted">{body}</p>
							</div>
						))}
					</div>
				</section>

				{/* Call to action */}
				<section className="glass relative mx-auto mt-32 max-w-4xl overflow-hidden rounded-3xl px-6 py-14 text-center sm:mt-40">
					<div
						aria-hidden
						className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_300px_at_50%_0%,rgb(139_92_246/.25),transparent)]"
					/>
					<div className="relative">
						<div className="mx-auto flex w-fit items-center gap-3 text-muted">
							<Command className="size-5" />
							<MonitorSmartphone className="size-5" />
							<Lock className="size-5" />
						</div>
						<h2 className="mt-5 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
							Make every new tab feel like home.
						</h2>
						<p className="mt-3 text-lg text-muted">
							Free, and set up in under a minute.
						</p>
						<Link
							to="/sign-up"
							className="btn-primary mt-8 inline-flex px-6 py-3 text-base"
						>
							Create your space <ArrowRight className="size-4" />
						</Link>
					</div>
				</section>
			</main>
			<footer className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-sm text-muted">
				<Logo className="text-sm" />
				<nav className="flex gap-5">
					<Link to="/sign-in" className="hover:text-ink">
						Sign in
					</Link>
					<Link to="/sign-up" className="hover:text-ink">
						Get started
					</Link>
					<a
						href="https://github.com/nearbycoder/tabz.space"
						className="hover:text-ink"
						target="_blank"
						rel="noreferrer"
					>
						GitHub
					</a>
				</nav>
			</footer>
		</div>
	);
}

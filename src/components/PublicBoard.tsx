import { ChevronRight, Copy, Folder, Loader2 } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Backdrop } from "#/components/home/Backdrop";
import { Favicon } from "#/components/ui/Favicon";
import { call, run } from "#/lib/api";
import { cn } from "#/lib/cn";
import { hostnameOf } from "#/lib/url";
import { copyPublicBoard } from "#/server/home";
import type { PublicBoard } from "#/server/sharing";
import { Logo } from "./Logo";

type Item = PublicBoard["groups"][number]["items"][number];

function LinkRow({ item }: { item: Item }) {
	return (
		<a
			href={item.url}
			target="_blank"
			rel="noopener noreferrer"
			title={item.description ?? item.url}
			className="focus-ring flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
		>
			<Favicon
				url={item.url}
				icon={item.icon}
				favicon={item.favicon}
				title={item.title}
				color={item.color}
				className="size-5 shrink-0 rounded text-base"
			/>
			<span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
			<span className="hidden shrink-0 text-xs text-muted sm:inline">
				{hostnameOf(item.url)}
			</span>
		</a>
	);
}

function FolderRow({ item }: { item: Item }) {
	const [open, setOpen] = useState(false);
	return (
		<div>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				className="focus-ring flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
			>
				<span className="grid size-5 shrink-0 place-items-center text-accent">
					{item.icon ? item.icon : <Folder className="size-4" />}
				</span>
				<span className="min-w-0 flex-1 truncate text-sm font-medium">
					{item.title}
				</span>
				<span className="text-xs text-muted">{item.children.length}</span>
				<ChevronRight
					className={cn("size-4 text-muted transition", open && "rotate-90")}
				/>
			</button>
			{open && (
				<div className="ml-4 border-l border-line pl-2">
					{item.children.map((child) => (
						<LinkRow key={child.url + child.title} item={child} />
					))}
				</div>
			)}
		</div>
	);
}

const widths = {
	narrow: "max-w-3xl",
	wide: "max-w-6xl",
	full: "max-w-none",
} as const;

export function PublicBoardView({
	board,
	slug,
	signedIn,
	autoCopy,
}: {
	board: PublicBoard;
	slug: string;
	signedIn: boolean;
	autoCopy?: boolean;
}) {
	const [copying, setCopying] = useState(false);
	const started = useRef(false);

	const copy = async () => {
		if (!signedIn) {
			const back = `/b/${slug}?copy=1`;
			window.location.assign(`/sign-up?redirect=${encodeURIComponent(back)}`);
			return;
		}
		setCopying(true);
		try {
			await run(call(copyPublicBoard, { slug }));
			toast.success(`Copied “${board.name}” to your tabz`);
			window.location.assign("/");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Couldn't copy");
			setCopying(false);
		}
	};

	// Coming back from sign-up with ?copy=1 finishes the copy.
	// biome-ignore lint/correctness/useExhaustiveDependencies: run once on arrival
	useEffect(() => {
		if (autoCopy && signedIn && !started.current) {
			started.current = true;
			void copy();
		}
	}, []);

	const columns = Math.min(
		board.layout.columns,
		Math.max(1, board.groups.length),
	);

	return (
		<div
			className="relative min-h-dvh"
			style={{ "--accent": board.appearance.accent } as CSSProperties}
		>
			<Backdrop background={board.appearance.background} />
			<header
				className={cn(
					"relative mx-auto flex items-center gap-3 px-4 py-4 sm:px-6",
					widths[board.layout.width],
				)}
			>
				<a href="/" aria-label="tabz home">
					<Logo className="text-base" />
				</a>
				<button
					type="button"
					onClick={copy}
					disabled={copying}
					className="btn-primary ml-auto"
				>
					{copying ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Copy className="size-4" />
					)}
					Copy to my tabz
				</button>
			</header>
			<main
				className={cn(
					"relative mx-auto px-4 pb-16 sm:px-6",
					widths[board.layout.width],
				)}
			>
				<div className="py-8 text-center">
					<p className="text-5xl">{board.icon ?? "📋"}</p>
					<h1 className="mt-3 text-3xl font-semibold tracking-tight">
						{board.name}
					</h1>
					<p className="mt-1 text-sm text-muted">Shared by {board.owner}</p>
				</div>
				{board.groups.length === 0 ? (
					<p className="text-center text-muted">This board is empty.</p>
				) : (
					<div
						className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
						style={{ "--cols": columns } as CSSProperties}
					>
						{board.groups.map((group) => (
							<section
								key={group.name}
								className="glass min-w-0 rounded-3xl p-4"
							>
								<h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
									<span
										className="size-2 rounded-full"
										style={{ background: group.color ?? "var(--muted)" }}
									/>
									{group.name}
									<span className="text-xs font-normal text-muted">
										{group.items.length}
									</span>
								</h2>
								<div className="space-y-0.5">
									{group.items.map((item) =>
										item.kind === "folder" ? (
											<FolderRow key={item.title + item.url} item={item} />
										) : (
											<LinkRow key={item.url + item.title} item={item} />
										),
									)}
								</div>
							</section>
						))}
					</div>
				)}
				<p className="mt-10 text-center text-xs text-muted">
					Made with{" "}
					<a href="/" className="text-accent hover:underline">
						tabz.space
					</a>{" "}
					· a calm, customizable start page for your links
				</p>
			</main>
		</div>
	);
}

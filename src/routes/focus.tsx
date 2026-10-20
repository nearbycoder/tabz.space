import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "#/components/Logo";
import { snoozeFocus } from "#/lib/incognito";

/** Where the extension sends blocked sites during focus mode. */
export const Route = createFileRoute("/focus")({
	validateSearch: (search: Record<string, unknown>) => ({
		site: typeof search.site === "string" ? search.site.slice(0, 120) : "",
		from: typeof search.from === "string" ? search.from.slice(0, 2048) : "",
	}),
	head: () => ({
		meta: [
			{ title: "Focus time · tabz" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: FocusPage,
});

function FocusPage() {
	const { site, from } = Route.useSearch();
	const [failed, setFailed] = useState(false);
	const canReturn = /^https?:\/\//i.test(from);
	return (
		<main className="grid min-h-dvh place-items-center bg-canvas p-6 text-center text-ink">
			<div className="max-w-sm">
				<Logo className="mx-auto size-10" />
				<p className="mt-6 text-5xl">🎯</p>
				<h1 className="mt-4 text-2xl font-bold tracking-tight">Focus time</h1>
				<p className="mt-2 text-muted">
					{site ? (
						<>
							<span className="font-medium text-ink">{site}</span> is on your
							block list while you focus.
						</>
					) : (
						"This site is on your block list while you focus."
					)}
				</p>
				<div className="mt-6 flex flex-wrap justify-center gap-2">
					<a href="/" className="btn-primary">
						Back to tabz
					</a>
					{canReturn && (
						<button
							type="button"
							className="btn-outline"
							onClick={async () => {
								if (!(await snoozeFocus(from))) setFailed(true);
							}}
						>
							5 more minutes
						</button>
					)}
				</div>
				{failed && (
					<p className="mt-3 text-xs text-muted">
						Couldn't reach the tabz extension. Change focus times in tabz →
						Settings → Home.
					</p>
				)}
			</div>
		</main>
	);
}

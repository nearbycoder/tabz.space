import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { PublicBoardView } from "#/components/PublicBoard";
import { getPublicBoard } from "#/server/home";
import { getSession } from "#/server/session";

/** A board shared publicly: read-only, with "Copy to my tabz". */
export const Route = createFileRoute("/b/$slug")({
	validateSearch: z.object({ copy: z.coerce.boolean().optional() }),
	loader: async ({ params }) => {
		const [board, session] = await Promise.all([
			getPublicBoard({ data: { slug: params.slug } }).catch(() => null),
			getSession(),
		]);
		if (!board) throw notFound();
		return { board, signedIn: Boolean(session) };
	},
	head: ({ loaderData }) => {
		if (!loaderData) return {};
		const { board } = loaderData;
		type Item = (typeof board.groups)[number]["items"][number];
		const countLinks = (items: Item[]): number =>
			items.reduce(
				(n, item) =>
					n + (item.kind === "folder" ? countLinks(item.children) : 1),
				0,
			);
		const count = board.groups.reduce(
			(sum, group) => sum + countLinks(group.items),
			0,
		);
		const title =
			`${board.icon ?? ""} ${board.name} · shared by ${board.owner} on tabz`.trim();
		const description = `${count} links in ${board.groups.length} group${board.groups.length === 1 ? "" : "s"}. Copy them to your own tabz.space start page.`;
		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:type", content: "website" },
				{ name: "twitter:card", content: "summary" },
			],
		};
	},
	notFoundComponent: () => (
		<main className="grid min-h-dvh place-items-center p-6 text-center">
			<div>
				<p className="text-5xl">🔗</p>
				<h1 className="mt-3 text-xl font-semibold">
					This board isn't shared anymore
				</h1>
				<a href="/" className="btn-primary mt-5 inline-flex">
					Go to tabz
				</a>
			</div>
		</main>
	),
	component: () => {
		const { board, signedIn } = Route.useLoaderData();
		const { slug } = Route.useParams();
		const { copy } = Route.useSearch();
		return (
			<PublicBoardView
				board={board}
				slug={slug}
				signedIn={signedIn}
				autoCopy={copy}
			/>
		);
	},
});

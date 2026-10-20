import { createFileRoute, redirect } from "@tanstack/react-router";
import { Reader } from "#/components/Reader";
import { getArticle } from "#/server/home";
import { getSession } from "#/server/session";

/** Reader view of a saved link: clean text, read time, highlights; works offline. */
export const Route = createFileRoute("/read/$id")({
	loader: async ({ params }) => {
		if (!(await getSession())) throw redirect({ to: "/sign-in" });
		try {
			return { article: await getArticle({ data: { id: params.id } }) };
		} catch (error) {
			return {
				article: null,
				error: error instanceof Error ? error.message : "Couldn't open it",
			};
		}
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData?.article
					? `${loaderData.article.title} · tabz reader`
					: "Reader · tabz",
			},
			{ name: "robots", content: "noindex" },
		],
	}),
	component: ReaderPage,
});

function ReaderPage() {
	const data = Route.useLoaderData();
	if (!data.article)
		return (
			<main className="grid min-h-dvh place-items-center p-6 text-center">
				<div>
					<p className="text-5xl">📄</p>
					<h1 className="mt-3 text-xl font-semibold">
						{"error" in data ? data.error : "Couldn't open it"}
					</h1>
					<a href="/read" className="btn-primary mt-5 inline-flex">
						Back to your reading list
					</a>
				</div>
			</main>
		);
	return <Reader article={data.article} />;
}

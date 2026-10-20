import { createFileRoute, redirect } from "@tanstack/react-router";
import { ReadingList } from "#/components/ReadingList";
import { getReadingList } from "#/server/home";
import { getSession } from "#/server/session";

/** Everything saved to read later, with read times. */
export const Route = createFileRoute("/read/")({
	loader: async () => {
		if (!(await getSession())) throw redirect({ to: "/sign-in" });
		return { items: await getReadingList() };
	},
	head: () => ({
		meta: [
			{ title: "Read later · tabz" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: () => <ReadingList items={Route.useLoaderData().items} />,
});

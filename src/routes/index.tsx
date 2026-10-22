import { createFileRoute } from "@tanstack/react-router";
import { HomeScreen } from "#/components/home/HomeScreen";
import { Landing } from "#/components/Landing";
import { homeQuery, seedWidgets } from "#/lib/home-query";
import { getSession } from "#/server/session";

export const Route = createFileRoute("/")({
	loader: async ({ context }) => {
		const session = await getSession();
		if (session) {
			await Promise.all([
				context.queryClient.ensureQueryData(homeQuery),
				// Server render only: in the browser they're already in memory.
				typeof window === "undefined" && seedWidgets(context.queryClient),
			]);
		}
		return { session };
	},
	component: Index,
});

function Index() {
	const { session } = Route.useLoaderData();
	return session ? <HomeScreen session={session} /> : <Landing />;
}

import { createFileRoute } from "@tanstack/react-router";
import { HomeScreen } from "#/components/home/HomeScreen";
import { Landing } from "#/components/Landing";
import { homeQuery } from "#/lib/home-query";
import { getSession } from "#/server/session";

export const Route = createFileRoute("/")({
	loader: async ({ context }) => {
		const session = await getSession();
		if (session) await context.queryClient.ensureQueryData(homeQuery);
		return { session };
	},
	component: Index,
});

function Index() {
	const { session } = Route.useLoaderData();
	return session ? <HomeScreen session={session} /> : <Landing />;
}

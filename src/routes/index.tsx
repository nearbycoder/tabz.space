import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { homeQuery, seedWidgets } from "#/lib/home-query";
import { lazyNamed } from "#/lib/lazy";
import { getSession } from "#/server/session";

const HomeScreen = lazyNamed(
	() => import("#/components/home/HomeScreen"),
	"HomeScreen",
);
const Landing = lazyNamed(() => import("#/components/Landing"), "Landing");

export const Route = createFileRoute("/")({
	loader: async ({ context }) => {
		const session = await getSession();
		if (session) {
			await Promise.all([
				context.queryClient.ensureQueryData(homeQuery),
				// Server render only: in the browser they're already in memory.
				typeof window === "undefined" && seedWidgets(context.queryClient),
				typeof window !== "undefined" && HomeScreen.preload(),
			]);
		} else if (typeof window !== "undefined") {
			void Landing.preload();
		}
		return { session };
	},
	component: Index,
});

function Index() {
	const { session } = Route.useLoaderData();
	return (
		<Suspense fallback={null}>
			{session ? <HomeScreen session={session} /> : <Landing />}
		</Suspense>
	);
}

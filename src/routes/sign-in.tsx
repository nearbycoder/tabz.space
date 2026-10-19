import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthForm } from "#/components/AuthForm";
import { withRedirect } from "#/lib/search-params";
import { getAuthProviders, getSession } from "#/server/session";

export const Route = createFileRoute("/sign-in")({
	// Loose: OAuth authorization params (client_id, sig, …) must pass through untouched.
	validateSearch: withRedirect,
	loader: async () => {
		if (await getSession()) throw redirect({ to: "/" });
		return { providers: await getAuthProviders() };
	},
	component: () => {
		const { providers } = Route.useLoaderData();
		const search = Route.useSearch();
		return (
			<AuthForm
				mode="sign-in"
				providers={providers}
				redirectTo={search.redirect}
				search={search}
			/>
		);
	},
});

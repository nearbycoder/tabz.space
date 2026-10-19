import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { AuthForm } from "#/components/AuthForm";
import { getAuthProviders, getSession } from "#/server/session";

export const Route = createFileRoute("/sign-up")({
	// Loose: OAuth authorization params (client_id, sig, …) must pass through untouched.
	validateSearch: z.looseObject({ redirect: z.string().optional() }),
	loader: async () => {
		if (await getSession()) throw redirect({ to: "/" });
		return { providers: await getAuthProviders() };
	},
	component: () => {
		const { providers } = Route.useLoaderData();
		const search = Route.useSearch();
		return (
			<AuthForm
				mode="sign-up"
				providers={providers}
				redirectTo={search.redirect}
				search={search}
			/>
		);
	},
});

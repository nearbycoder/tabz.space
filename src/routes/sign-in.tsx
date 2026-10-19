import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { AuthForm } from "#/components/AuthForm";
import { getAuthProviders, getSession } from "#/server/session";

export const Route = createFileRoute("/sign-in")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	loader: async () => {
		if (await getSession()) throw redirect({ to: "/" });
		return { providers: await getAuthProviders() };
	},
	component: () => {
		const { providers } = Route.useLoaderData();
		const { redirect: to } = Route.useSearch();
		return <AuthForm mode="sign-in" providers={providers} redirectTo={to} />;
	},
});

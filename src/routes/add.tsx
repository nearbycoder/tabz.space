import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { QuickAdd } from "#/components/QuickAdd";
import { homeQuery } from "#/lib/home-query";
import { getSession } from "#/server/session";

/** Target of the browser extension and bookmarklet: /add?url=…&title=… */
export const Route = createFileRoute("/add")({
	validateSearch: z.object({
		url: z.string().optional(),
		title: z.string().optional(),
		// Android's share sheet often puts the link inside "text".
		text: z.string().optional(),
		popup: z.coerce.boolean().optional(),
	}),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, location }) => {
		if (!(await getSession())) {
			throw redirect({ to: "/sign-in", search: { redirect: location.href } });
		}
		await context.queryClient.ensureQueryData(homeQuery);
	},
	component: () => {
		const search = Route.useSearch();
		const url = search.url || search.text?.match(/https?:\/\/\S+/)?.[0] || "";
		return (
			<QuickAdd
				url={url}
				title={search.title ?? ""}
				popup={search.popup ?? false}
			/>
		);
	},
});

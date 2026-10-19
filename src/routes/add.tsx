import { createFileRoute, redirect } from "@tanstack/react-router";
import { QuickAdd } from "#/components/QuickAdd";
import { homeQuery } from "#/lib/home-query";
import { optionalFlag, optionalString } from "#/lib/search-params";
import { getSession } from "#/server/session";

/** Target of the browser extension and bookmarklet: /add?url=…&title=… */
export const Route = createFileRoute("/add")({
	validateSearch: (
		search: Record<string, unknown>,
	): { url?: string; title?: string; text?: string; popup?: boolean } => ({
		url: optionalString(search.url),
		title: optionalString(search.title),
		// Android's share sheet often puts the link inside "text".
		text: optionalString(search.text),
		popup: optionalFlag(search.popup),
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

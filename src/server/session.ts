import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth, enabledProviders } from "#/lib/auth";

export const getSession = createServerFn().handler(async () => {
	const session = await auth.api.getSession({
		headers: new Headers(getRequestHeaders() as HeadersInit),
	});
	return session
		? {
				id: session.user.id,
				name: session.user.name,
				email: session.user.email,
				username: session.user.username ?? null,
				image: session.user.image ?? null,
			}
		: null;
});

export type SessionInfo = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export const getAuthProviders = createServerFn().handler(
	() => enabledProviders,
);

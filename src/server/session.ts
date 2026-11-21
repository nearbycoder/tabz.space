import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { enabledProviders } from "#/lib/auth";
import { getRequestSession } from "./runtime";

export const getSession = createServerFn().handler(async () => {
	const session = await getRequestSession(
		new Headers(getRequestHeaders() as HeadersInit),
	);
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

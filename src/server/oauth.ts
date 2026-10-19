import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db";
import { oauthClient } from "#/db/auth-schema";
import { auth } from "#/lib/auth";

/** Details for the consent screen, only for a validly signed authorization request. */
export const getConsentRequest = createServerFn({ method: "POST" })
	.validator(z.object({ query: z.string().max(8192) }))
	.handler(async ({ data }) => {
		const { secret } = await auth.$context;
		if (!(await verifyOAuthQueryParams(data.query, secret))) return null;
		const params = new URLSearchParams(data.query);
		const clientId = params.get("client_id");
		if (!clientId) return null;
		const [client, session] = await Promise.all([
			db.query.oauthClient.findFirst({
				where: eq(oauthClient.clientId, clientId),
			}),
			auth.api.getSession({
				headers: new Headers(getRequestHeaders() as HeadersInit),
			}),
		]);
		return {
			client: {
				name: client?.name || clientId,
				icon: client?.icon ?? null,
				uri: client?.uri ?? null,
			},
			scopes: (params.get("scope") ?? "").split(" ").filter(Boolean),
			user: session
				? { name: session.user.name, email: session.user.email }
				: null,
		};
	});

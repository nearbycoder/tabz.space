import { createFileRoute } from "@tanstack/react-router";
import { VAULT_COOKIE } from "#/server/vault-token";

/**
 * Locks the vault by clearing its cookie. Called with navigator.sendBeacon
 * when the last tab using the vault closes, where server functions can't run.
 */
export const Route = createFileRoute("/api/vault/lock")({
	server: {
		handlers: {
			POST: () =>
				new Response(null, {
					status: 204,
					headers: {
						"set-cookie": `${VAULT_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
					},
				}),
		},
	},
});

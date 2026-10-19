import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createFileRoute } from "@tanstack/react-router";
import { auth, mcpResource } from "#/lib/auth";
import { createTabzMcpServer } from "#/server/mcp/tools";

// Serves both MCP 2026-07-28 and (statelessly) 2025-era clients.
const mcpHandler = createMcpHandler((ctx) =>
	createTabzMcpServer(String(ctx.authInfo?.extra?.userId)),
);

// Verifies the OAuth access token (signature, issuer, audience = this endpoint)
// and answers unauthenticated requests with the RFC 9728 challenge that starts
// the client's sign-in flow.
const handle = requireMcpAuth(
	auth,
	(request, claims) =>
		mcpHandler.fetch(request, {
			authInfo: {
				token: "",
				clientId: String(claims.azp ?? claims.client_id ?? ""),
				scopes: String(claims.scope ?? "")
					.split(" ")
					.filter(Boolean),
				expiresAt: claims.exp,
				extra: { userId: claims.sub },
			},
		}),
	{ resource: mcpResource },
);

export const Route = createFileRoute("/api/mcp")({
	server: {
		handlers: {
			POST: ({ request }) => handle(request),
			GET: ({ request }) => handle(request),
			DELETE: ({ request }) => handle(request),
		},
	},
});

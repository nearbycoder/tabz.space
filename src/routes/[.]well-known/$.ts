import {
	oauthProviderAuthServerMetadata,
	oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth";

const authServerMetadata = oauthProviderAuthServerMetadata(auth);
const openIdConfig = oauthProviderOpenIdConfigMetadata(auth);

/**
 * OAuth discovery documents live at the site root, outside Better Auth's
 * /api/auth mount. MCP clients probe both root and path-inserted forms
 * (e.g. /.well-known/oauth-protected-resource/api/mcp).
 */
function discovery(request: Request) {
	const { pathname } = new URL(request.url);
	if (pathname.startsWith("/.well-known/oauth-authorization-server"))
		return authServerMetadata(request);
	if (pathname.startsWith("/.well-known/openid-configuration"))
		return openIdConfig(request);
	// The mcp plugin answers these root paths itself from auth.handler.
	if (pathname.startsWith("/.well-known/oauth-protected-resource"))
		return auth.handler(request);
	return new Response("Not found", { status: 404 });
}

export const Route = createFileRoute("/.well-known/$")({
	server: { handlers: { GET: ({ request }) => discovery(request) } },
});

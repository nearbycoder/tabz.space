import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	// oauthProviderClient forwards the signed OAuth query from the current URL,
	// so signing in mid-authorization continues the MCP connect flow.
	plugins: [usernameClient(), oauthProviderClient()],
});

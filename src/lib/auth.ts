import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt, username } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "#/db";
import * as authSchema from "#/db/auth-schema";

const isProduction = process.env.NODE_ENV === "production";
const secret =
	process.env.BETTER_AUTH_SECRET ??
	(isProduction ? undefined : "tabz-space-dev-secret-change-me");

if (isProduction && !secret) {
	throw new Error("BETTER_AUTH_SECRET must be configured in production");
}

export const baseUrl = (
	process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

/** The MCP endpoint; issued access tokens are audience-bound to this URL. */
export const mcpResource = `${baseUrl}/api/mcp`;

const github =
	process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
		? {
				clientId: process.env.GITHUB_CLIENT_ID,
				clientSecret: process.env.GITHUB_CLIENT_SECRET,
			}
		: undefined;

export const enabledProviders = { github: Boolean(github) };

export const auth = betterAuth({
	secret,
	baseURL: baseUrl,
	trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(","),
	database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
	// The JWT plugin's session-to-JWT endpoint isn't needed; MCP tokens come from /oauth2/token.
	disabledPaths: ["/token"],
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,
	},
	socialProviders: github ? { github } : {},
	account: {
		accountLinking: { enabled: true, trustedProviders: ["github"] },
	},
	session: {
		expiresIn: 60 * 60 * 24 * 60,
		updateAge: 60 * 60 * 24,
		cookieCache: { enabled: true, maxAge: 5 * 60 },
	},
	rateLimit: { enabled: isProduction, window: 60, max: 100 },
	advanced: { useSecureCookies: isProduction },
	plugins: [
		username(),
		// Signs MCP access tokens and publishes /api/auth/jwks.
		jwt(),
		// OAuth 2.1 authorization server for MCP clients. Clients self-register
		// (CIMD for current clients, DCR for older ones), so connecting needs no setup.
		mcp({
			resource: mcpResource,
			loginPage: "/sign-in",
			consentPage: "/consent",
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			clientRegistrationDefaultApplicationType: "infer",
		}),
		cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
		// tanstackStartCookies must stay last so it can forward Set-Cookie headers.
		tanstackStartCookies(),
	],
});

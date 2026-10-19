import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
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
	baseURL: process.env.BETTER_AUTH_URL,
	trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(","),
	database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
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
	// tanstackStartCookies must stay last so it can forward Set-Cookie headers.
	plugins: [username(), tanstackStartCookies()],
});

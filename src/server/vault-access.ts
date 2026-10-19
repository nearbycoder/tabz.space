import { Context } from "effect";

/**
 * The caller's vault session: set (with its expiry) only by the web app after
 * a successful unlock. Everything else, including MCP, gets the locked default,
 * so vault boards behave as if they don't exist.
 */
export const VaultAccess = Context.Reference<{ expiresAt: number } | null>(
	"tabz/VaultAccess",
	{ defaultValue: () => null },
);

import { Context } from "effect";

/**
 * The caller's vault session: set (with its expiry) only by the web app after
 * a successful unlock. Everything else, including MCP, gets the locked default,
 * so vault boards behave as if they don't exist.
 */
export type VaultSlot = "main" | "decoy";

export const VaultAccess = Context.Reference<{
	expiresAt: number;
	/** Which password opened it; the decoy shows only decoy boards. */
	slot: VaultSlot;
} | null>("tabz/VaultAccess", { defaultValue: () => null });

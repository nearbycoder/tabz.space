import { constantTimeEqual, makeSignature } from "better-auth/crypto";

/*
 * Vault unlock tokens: "<userId>.<expiresAt>.<hmac>" in an httpOnly cookie,
 * signed with the auth secret. Stateless, so locking = clearing the cookie and
 * expiry is enforced on every request.
 */

export const VAULT_COOKIE = "tabz_vault";

const secret = () =>
	process.env.BETTER_AUTH_SECRET ?? "tabz-space-dev-secret-change-me";

export async function signVaultToken(userId: string, expiresAt: number) {
	const payload = `${userId}.${expiresAt}`;
	return `${payload}.${await makeSignature(`vault:${payload}`, secret())}`;
}

/** Returns the expiry when the token is valid for this user, otherwise null. */
export async function readVaultToken(
	token: string | undefined,
	userId: string,
) {
	if (!token) return null;
	const [tokenUser, rawExpiry, signature] = token.split(".");
	const expiresAt = Number(rawExpiry);
	if (
		tokenUser !== userId ||
		!signature ||
		!Number.isFinite(expiresAt) ||
		expiresAt <= Date.now()
	)
		return null;
	const expected = await makeSignature(
		`vault:${tokenUser}.${rawExpiry}`,
		secret(),
	);
	return constantTimeEqual(
		new TextEncoder().encode(expected),
		new TextEncoder().encode(signature),
	)
		? { expiresAt }
		: null;
}

export function cookieValue(headers: Headers, name: string) {
	for (const part of headers.get("cookie")?.split(";") ?? []) {
		const [key, ...rest] = part.trim().split("=");
		if (key === name) return decodeURIComponent(rest.join("="));
	}
	return undefined;
}

/*
 * End-to-end encryption for the vault. The vault password never leaves the
 * browser: PBKDF2 stretches it into 512 bits, split into an AES-GCM key that
 * stays here and an "auth key" the server stores a hash of to check unlocks.
 * Knowing the auth key doesn't help decrypt anything.
 */

const ITERATIONS = 310_000;
const encoder = new TextEncoder();

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) =>
	Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const toHex = (bytes: Uint8Array) =>
	[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const newSalt = () =>
	toBase64(crypto.getRandomValues(new Uint8Array(16)));

export async function deriveVaultKeys(password: string, salt: string) {
	const base = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password.normalize("NFKC")),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = new Uint8Array(
		await crypto.subtle.deriveBits(
			{
				name: "PBKDF2",
				hash: "SHA-256",
				salt: fromBase64(salt),
				iterations: ITERATIONS,
			},
			base,
			512,
		),
	);
	return {
		encryptionKey: toBase64(bits.slice(0, 32)),
		authKey: toHex(bits.slice(32)),
	};
}

export const importVaultKey = (raw: string) =>
	crypto.subtle.importKey("raw", fromBase64(raw), "AES-GCM", false, [
		"encrypt",
		"decrypt",
	]);

export async function seal(key: CryptoKey, value: unknown) {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const data = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			key,
			encoder.encode(JSON.stringify(value)),
		),
	);
	const out = new Uint8Array(iv.length + data.length);
	out.set(iv);
	out.set(data, iv.length);
	return `v1.${toBase64(out)}`;
}

export async function unseal<T>(key: CryptoKey, sealed: string): Promise<T> {
	const bytes = fromBase64(sealed.slice(3));
	const plain = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: bytes.slice(0, 12) },
		key,
		bytes.slice(12),
	);
	return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** What a sealed vault link or folder contains. */
export type SealedContents = {
	title: string;
	url?: string;
	description?: string | null;
	tags?: string[];
	icon?: string | null;
	favicon?: string;
};

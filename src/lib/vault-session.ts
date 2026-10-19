import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { HomeData } from "#/server/home";
import {
	importVaultKey,
	type SealedContents,
	seal,
	unseal,
} from "./vault-crypto";

/*
 * The unlocked vault key for this tab. Kept in memory plus sessionStorage (so
 * a reload doesn't need the password again until the vault auto-locks) and
 * never sent anywhere. Decrypted contents are cached by ciphertext.
 */

const STORAGE = "tabz:vault-key";

let key: CryptoKey | null = null;
let loadedFor: string | null = null;
let version = 0;
const listeners = new Set<() => void>();
const opened = new Map<string, SealedContents | null>();

const notify = () => {
	version++;
	for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

export async function setVaultKey(
	userId: string,
	raw: string,
	expiresAt: number,
) {
	sessionStorage.setItem(STORAGE, JSON.stringify({ userId, raw, expiresAt }));
	key = await importVaultKey(raw);
	loadedFor = userId;
	opened.clear();
	notify();
}

export function clearVaultKey() {
	sessionStorage.removeItem(STORAGE);
	key = null;
	opened.clear();
	notify();
}

async function recall(userId: string) {
	if (loadedFor === userId && key) return;
	loadedFor = userId;
	try {
		const saved = JSON.parse(sessionStorage.getItem(STORAGE) ?? "null") as {
			userId: string;
			raw: string;
			expiresAt: number;
		} | null;
		if (saved && saved.userId === userId && saved.expiresAt > Date.now()) {
			key = await importVaultKey(saved.raw);
			notify();
		} else sessionStorage.removeItem(STORAGE);
	} catch {
		sessionStorage.removeItem(STORAGE);
	}
}

export const getVaultKey = () => key;

const requireKey = () => {
	if (!key)
		throw new Error(
			"Your vault key isn't loaded in this tab. Lock and unlock the vault again.",
		);
	return key;
};

export const sealContents = (contents: SealedContents) =>
	seal(requireKey(), contents);

type Row = HomeData["boards"][number]["groups"][number]["bookmarks"][number];

const reveal = <T extends Omit<Row, "children">>(row: T): T => {
	const sealed = row.meta.sealed;
	if (!sealed) return row;
	const plain = opened.get(sealed);
	if (!plain) return row;
	return {
		...row,
		title: plain.title,
		url: plain.url ?? "",
		description: plain.description ?? null,
		tags: plain.tags ?? [],
		icon: plain.icon ?? null,
		meta: { ...row.meta, favicon: plain.favicon },
	};
};

/** Home data with vault items decrypted (placeholders until the key is ready). */
export function useDecryptedHome(data: HomeData): HomeData {
	const current = useSyncExternalStore(
		subscribe,
		() => version,
		() => 0,
	);
	useEffect(() => {
		if (data.vault.unlocked) void recall(data.userId);
	}, [data.userId, data.vault.unlocked]);

	// Decrypt anything new in the background (re-run when the key arrives).
	// biome-ignore lint/correctness/useExhaustiveDependencies: `current` bumps when the key loads
	useEffect(() => {
		if (!key || !data.vault.unlocked) return;
		const pending = data.boards
			.filter((board) => board.vault)
			.flatMap((board) =>
				board.groups.flatMap((group) =>
					group.bookmarks.flatMap((item) => [item, ...item.children]),
				),
			)
			.map((row) => row.meta.sealed)
			.filter(
				(sealed): sealed is string =>
					Boolean(sealed) && !opened.has(sealed as string),
			);
		if (pending.length === 0) return;
		const usedKey = key;
		void Promise.all(
			pending.map((sealed) =>
				unseal<SealedContents>(usedKey, sealed)
					.then((plain) => opened.set(sealed, plain))
					.catch(() => opened.set(sealed, null)),
			),
		).then(notify);
	}, [data, current]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `current` bumps when decryption finishes
	return useMemo(() => {
		if (!data.boards.some((board) => board.vault)) return data;
		return {
			...data,
			boards: data.boards.map((board) =>
				board.vault
					? {
							...board,
							groups: board.groups.map((group) => ({
								...group,
								bookmarks: group.bookmarks.map((item) => ({
									...reveal(item),
									children: item.children.map(reveal),
								})),
							})),
						}
					: board,
			),
		};
	}, [data, current]);
}

/** Whether this tab holds the vault key (vs. only the unlock cookie). */
export const useVaultKeyReady = () =>
	useSyncExternalStore(
		subscribe,
		() => key !== null,
		() => false,
	);

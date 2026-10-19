import { useEffect, useMemo, useSyncExternalStore } from "react";
import { flattenTree, mapTree } from "#/components/home/types";
import type { HomeData } from "#/server/home";
import { unlockVault } from "#/server/vault";
import { call, run } from "./api";
import {
	importVaultKey,
	type SealedContents,
	seal,
	unseal,
} from "./vault-crypto";

/*
 * The unlocked vault key for this tab. Kept in memory plus sessionStorage
 * (which survives a reload but not closing the tab) and never sent anywhere.
 * Decrypted contents are cached by ciphertext.
 *
 * The vault follows the tab: when the last tab using it closes, it locks
 * (the unlock cookie is cleared). A reloaded tab quietly unlocks again until
 * the original auto-lock time; new tabs borrow the key from an open one.
 */

const STORAGE = "tabz:vault-key";
const CHANNEL = "tabz-vault";

type Session = {
	userId: string;
	raw: string;
	expiresAt: number;
	/** Derived auth key, so a reload can re-open the vault without the password. */
	authKey?: string;
};

let key: CryptoKey | null = null;
let session: Session | null = null;
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

const readStored = (): Session | null => {
	try {
		const saved = JSON.parse(
			sessionStorage.getItem(STORAGE) ?? "null",
		) as Session | null;
		if (saved && saved.expiresAt > Date.now()) return saved;
	} catch {}
	sessionStorage.removeItem(STORAGE);
	return null;
};

const adopt = async (next: Session) => {
	sessionStorage.setItem(STORAGE, JSON.stringify(next));
	session = next;
	key = await importVaultKey(next.raw);
	loadedFor = next.userId;
	opened.clear();
	notify();
	// Let other tabs know right away, so closing one doesn't lock this one.
	post({ type: "here", tab: tabId });
};

export const setVaultKey = (
	userId: string,
	raw: string,
	expiresAt: number,
	authKey?: string,
) => adopt({ userId, raw, expiresAt, authKey });

const forget = () => {
	sessionStorage.removeItem(STORAGE);
	key = null;
	session = null;
	opened.clear();
	notify();
};

/** Forgets the key here and tells other tabs the vault was locked. */
export function clearVaultKey() {
	forget();
	channel?.postMessage({ type: "locked" });
}

/* ------------------------------ tab coordination ----------------------------- */

const tabId =
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: String(Math.random());
const peers = new Map<string, number>();
let channel: BroadcastChannel | null = null;

type Message =
	| { type: "here" | "bye" | "hello"; tab: string }
	| { type: "need-key"; tab: string; userId: string }
	| { type: "key"; to: string; session: Session }
	| { type: "locked" };

const post = (message: Message) => channel?.postMessage(message);

/** Starts talking to other tabs; safe to call repeatedly. */
export function startVaultSync() {
	if (channel || typeof BroadcastChannel === "undefined") return;
	channel = new BroadcastChannel(CHANNEL);
	channel.onmessage = ({ data }: MessageEvent<Message>) => {
		if (data.type === "here") peers.set(data.tab, Date.now());
		else if (data.type === "bye") peers.delete(data.tab);
		else if (data.type === "hello") {
			if (key) post({ type: "here", tab: tabId });
		} else if (data.type === "need-key") {
			if (
				key &&
				session?.userId === data.userId &&
				session.expiresAt > Date.now()
			)
				post({ type: "key", to: data.tab, session });
		} else if (data.type === "key") {
			if (data.to === tabId && !key) void adopt(data.session);
		} else if (data.type === "locked") {
			forget();
			window.dispatchEvent(new Event("tabz:vault-locked"));
		}
	};
	post({ type: "hello", tab: tabId });
	setInterval(() => {
		if (key) post({ type: "here", tab: tabId });
		for (const [tab, seen] of peers)
			if (Date.now() - seen > 25_000) peers.delete(tab);
	}, 10_000);
	window.addEventListener("pagehide", () => {
		post({ type: "bye", tab: tabId });
		// Last tab with the vault open: lock it. A reload re-opens it from
		// sessionStorage; closing the tab clears that too.
		if (key && peers.size === 0) navigator.sendBeacon("/api/vault/lock");
	});
}

/** Asks other open tabs for the key; resolves once one answers (or gives up). */
const keyFromPeers = (userId: string) =>
	new Promise<boolean>((resolve) => {
		if (!channel) return resolve(false);
		post({ type: "need-key", tab: tabId, userId });
		const started = Date.now();
		const check = setInterval(() => {
			if (key || Date.now() - started > 600) {
				clearInterval(check);
				resolve(Boolean(key));
			}
		}, 50);
	});

/**
 * Brings the vault back after a reload (or a return via Back) in a tab that
 * had it open: re-unlocks with the stored auth key until the original
 * auto-lock time. Resolves true when the vault was re-opened on the server.
 */
export async function resumeVault(userId: string) {
	const saved = readStored();
	if (!saved || saved.userId !== userId || !saved.authKey) return false;
	try {
		await run(
			call(unlockVault, { password: saved.authKey, until: saved.expiresAt }),
		);
		await adopt(saved);
		return true;
	} catch {
		forget();
		return false;
	}
}

async function recall(userId: string) {
	if (loadedFor === userId && key) return;
	loadedFor = userId;
	const saved = readStored();
	if (saved && saved.userId === userId) await adopt(saved);
	else await keyFromPeers(userId);
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
				board.groups.flatMap((group) => flattenTree(group.bookmarks)),
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
								bookmarks: mapTree(group.bookmarks, reveal),
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

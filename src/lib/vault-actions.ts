import type { QueryClient } from "@tanstack/react-query";
import type { HomeData } from "#/server/home";
import {
	getVaultInfo,
	setDecoy,
	setupVault,
	unlockVault,
	upgradeVault,
} from "#/server/vault";
import { call, run } from "./api";
import { homeKey, homeQuery } from "./home-query";
import {
	deriveVaultKeys,
	importVaultKey,
	newSalt,
	type SealedContents,
	seal,
	unseal,
} from "./vault-crypto";
import { setVaultKey } from "./vault-session";

/* Browser side of the vault: key derivation, unlocks, re-encryption. */

type Row = HomeData["boards"][number]["groups"][number]["bookmarks"][number];

/** Every link and folder in the (main or decoy) vault, as stored on the server. */
const vaultRows = (data: HomeData, decoy = false) =>
	data.boards
		.filter((board) => board.vault && board.decoy === decoy)
		.flatMap((board) =>
			board.groups.flatMap((group) =>
				group.bookmarks.flatMap((item) => [
					item as Omit<Row, "children">,
					...item.children,
				]),
			),
		);

export const contentsOf = (row: Omit<Row, "children">): SealedContents =>
	row.kind === "folder"
		? { title: row.title, icon: row.icon }
		: {
				title: row.title,
				url: row.url,
				description: row.description,
				tags: row.tags,
				icon: row.icon,
				favicon: row.meta.favicon,
			};

export async function unlockWithPassword(
	password: string,
	userId: string,
	queryClient: QueryClient,
) {
	const info = await run(call(getVaultInfo));
	if (info.salt) {
		const keys = await deriveVaultKeys(password, info.salt);
		const result = await run(call(unlockVault, { password: keys.authKey }));
		await setVaultKey(userId, keys.encryptionKey, result.expiresAt);
		return result;
	}
	// A vault from before end-to-end encryption: unlock the old way once, then
	// encrypt everything in it and switch to derived keys.
	const result = await run(call(unlockVault, { password }));
	const fresh = await queryClient.fetchQuery({ ...homeQuery, staleTime: 0 });
	const salt = newSalt();
	const keys = await deriveVaultKeys(password, salt);
	const key = await importVaultKey(keys.encryptionKey);
	const sealed = await Promise.all(
		vaultRows(fresh).map(async (row) => ({
			id: row.id,
			sealed: await seal(key, contentsOf(row)),
		})),
	);
	await run(call(upgradeVault, { authKey: keys.authKey, salt, sealed }));
	await setVaultKey(userId, keys.encryptionKey, result.expiresAt);
	return result;
}

export async function createVault(
	password: string,
	userId: string,
	autoLockMinutes: number,
) {
	const salt = newSalt();
	const keys = await deriveVaultKeys(password, salt);
	const result = await run(
		call(setupVault, { authKey: keys.authKey, salt, autoLockMinutes }),
	);
	await setVaultKey(userId, keys.encryptionKey, result.expiresAt);
	return result;
}

/** New password = new key: every vault item is re-encrypted before saving. */
export async function changeVaultPassword(options: {
	currentPassword: string;
	newPassword: string;
	autoLockMinutes: number;
	queryClient: QueryClient;
}) {
	const raw = options.queryClient.getQueryData<HomeData>(homeKey);
	if (!raw) throw new Error("Reload and try again");
	const info = await run(call(getVaultInfo));
	let currentAuthKey = options.currentPassword;
	let currentKey: CryptoKey | null = null;
	if (info.salt) {
		const keys = await deriveVaultKeys(options.currentPassword, info.salt);
		currentAuthKey = keys.authKey;
		currentKey = await importVaultKey(keys.encryptionKey);
	}
	const salt = newSalt();
	const next = await deriveVaultKeys(options.newPassword, salt);
	const nextKey = await importVaultKey(next.encryptionKey);
	const resealed = await Promise.all(
		vaultRows(raw).map(async (row) => {
			let contents = contentsOf(row);
			if (row.meta.sealed) {
				if (!currentKey) throw new Error("Unlock your vault first");
				contents = await unseal<SealedContents>(
					currentKey,
					row.meta.sealed,
				).catch(() => {
					throw new Error("Current vault password is wrong");
				});
			}
			return { id: row.id, sealed: await seal(nextKey, contents) };
		}),
	);
	const result = await run(
		call(setupVault, {
			authKey: next.authKey,
			salt,
			currentAuthKey,
			autoLockMinutes: options.autoLockMinutes,
			resealed,
		}),
	);
	await setVaultKey(raw.userId, next.encryptionKey, result.expiresAt);
	return result;
}

export async function setDecoyPassword(password: string | null) {
	if (password === null) return run(call(setDecoy, { authKey: null }));
	const info = await run(call(getVaultInfo));
	if (!info.salt)
		throw new Error("Unlock your vault once to finish setting it up");
	const keys = await deriveVaultKeys(password, info.salt);
	return run(call(setDecoy, { authKey: keys.authKey }));
}

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { HomeData } from "#/server/home";
import { lockVault } from "#/server/vault";
import { call, run } from "./api";
import { homeKey } from "./home-query";
import { clearVaultKey } from "./vault-session";

/** Drops vault boards from the cache right away, then locks on the server. */
export function useLockVault() {
	const queryClient = useQueryClient();
	return useCallback(async () => {
		queryClient.setQueryData<HomeData>(homeKey, (data) =>
			data
				? {
						...data,
						boards: data.boards.filter((b) => !b.vault),
						vault: { ...data.vault, unlocked: false, expiresAt: null },
					}
				: data,
		);
		clearVaultKey();
		await run(call(lockVault)).catch(() => {});
		await queryClient.invalidateQueries({ queryKey: homeKey });
	}, [queryClient]);
}

import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Lock, LockOpen, ShieldAlert } from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Field, Segmented } from "#/components/ui/controls";
import { call, run } from "#/lib/api";
import { cn } from "#/lib/cn";
import { homeKey, useSaveSettings } from "#/lib/home-query";
import type { UserSettings } from "#/lib/preferences";
import type { HomeData } from "#/server/home";
import {
	lockVault,
	resetVault,
	setupVault,
	unlockVault,
	updateVaultSettings,
} from "#/server/vault";

export type VaultState = HomeData["vault"];

/** Drops vault boards from the cache right away, then refetches. */
export function useLockVault() {
	const queryClient = useQueryClient();
	return useCallback(
		async (quiet = false) => {
			queryClient.setQueryData<HomeData>(homeKey, (data) =>
				data
					? {
							...data,
							boards: data.boards.filter((b) => !b.vault),
							vault: { ...data.vault, unlocked: false, expiresAt: null },
						}
					: data,
			);
			await run(call(lockVault)).catch(() => {});
			await queryClient.invalidateQueries({ queryKey: homeKey });
			if (!quiet) toast("Vault locked", { icon: "🔒" });
		},
		[queryClient],
	);
}

/** The secret-code prompt. */
export function VaultUnlockDialog({
	onClose,
	onUnlocked,
}: {
	onClose: () => void;
	onUnlocked: (boardId: string) => void;
}) {
	const queryClient = useQueryClient();
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [shake, setShake] = useState(0);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		setError(null);
		try {
			const result = await run(call(unlockVault, { password }));
			await queryClient.invalidateQueries({ queryKey: homeKey });
			toast("Vault unlocked", { icon: "🔓" });
			onUnlocked(result.boardId);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Couldn't unlock");
			setShake((n) => n + 1);
			setPassword("");
			setPending(false);
		}
	};

	return createPortal(
		<div className="fixed inset-0 z-[80] grid place-items-center p-4">
			<button
				type="button"
				aria-label="Close"
				className="absolute inset-0 bg-black/60 backdrop-blur-xl"
				onClick={onClose}
				onKeyDown={(event) => event.key === "Escape" && onClose()}
			/>
			<form
				key={shake}
				onSubmit={submit}
				className={cn(
					"glass animate-pop relative w-full max-w-xs rounded-[2rem] p-7 text-center shadow-2xl",
					shake > 0 && "animate-shake",
				)}
			>
				<div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-accent">
					<KeyRound className="size-6" />
				</div>
				<h2 className="text-lg font-semibold">Vault</h2>
				<p className="mt-1 text-sm text-muted">Enter your vault password</p>
				<input
					type="password"
					value={password}
					onChange={(event) => setPassword(event.target.value)}
					onKeyDown={(event) => event.key === "Escape" && onClose()}
					autoFocus
					autoComplete="off"
					aria-label="Vault password"
					className="field mt-5 text-center text-lg tracking-[0.3em]"
				/>
				{error && <p className="mt-3 text-sm text-red-500">{error}</p>}
				<button
					type="submit"
					className="btn-primary mt-5 w-full"
					disabled={pending || !password}
				>
					{pending ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<LockOpen className="size-4" />
					)}{" "}
					Unlock
				</button>
			</form>
		</div>,
		document.body,
	);
}

/** Vault tab in Customize: set up, tune auto-lock, change password, or reset. */
export function VaultSettings({
	vault,
	settings,
}: {
	vault: VaultState;
	settings: UserSettings;
}) {
	const queryClient = useQueryClient();
	const saveSettings = useSaveSettings();
	const lock = useLockVault();
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [currentPassword, setCurrentPassword] = useState("");
	const [code, setCode] = useState(settings.vaultCode);
	const [minutes, setMinutes] = useState(vault.autoLockMinutes);
	const [pending, setPending] = useState(false);
	const [resetText, setResetText] = useState("");

	const refresh = () => queryClient.invalidateQueries({ queryKey: homeKey });

	const savePassword = async (event: FormEvent) => {
		event.preventDefault();
		if (password !== confirmPassword) {
			toast.error("Passwords don't match");
			return;
		}
		setPending(true);
		try {
			await run(
				call(setupVault, {
					password,
					currentPassword: vault.configured ? currentPassword : undefined,
					autoLockMinutes: minutes,
				}),
			);
			if (code !== settings.vaultCode)
				saveSettings.mutate({ vaultCode: code.toLowerCase() });
			toast.success(
				vault.configured
					? "Vault password changed"
					: "Vault ready. It's unlocked now.",
			);
			setPassword("");
			setConfirmPassword("");
			setCurrentPassword("");
			await refresh();
		} catch (cause) {
			toast.error(cause instanceof Error ? cause.message : "Couldn't save");
		} finally {
			setPending(false);
		}
	};

	const codeValid = /^[a-z0-9]{3,24}$/i.test(code);

	return (
		<div className="space-y-6">
			<div className="rounded-2xl border border-line bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] p-4 text-sm">
				<p className="flex items-center gap-2 font-medium">
					<Lock className="size-4 text-accent" /> A hidden, password-protected
					space
				</p>
				<p className="mt-1 text-muted">
					Vault boards never load until you unlock them. They stay out of
					search, ⌘K, the most-visited strip, exports and AI assistants. Type
					your secret code anywhere on your home page to open it.
				</p>
			</div>

			<div className="space-y-3">
				<Field
					label="Secret code"
					hint="Letters or numbers you type anywhere on the page (not in a text box). Avoid E and N, which are shortcuts."
				>
					<div className="flex gap-2">
						<input
							className="field font-mono lowercase"
							value={code}
							onChange={(event) =>
								setCode(event.target.value.replace(/\s/g, ""))
							}
							maxLength={24}
						/>
						{vault.configured && (
							<button
								type="button"
								className="btn-outline"
								disabled={
									!codeValid || code.toLowerCase() === settings.vaultCode
								}
								onClick={() =>
									saveSettings.mutate({ vaultCode: code.toLowerCase() })
								}
							>
								Save
							</button>
						)}
					</div>
				</Field>
				<Field label="Auto-lock after">
					<Segmented
						value={minutes}
						onChange={(value) => {
							setMinutes(value);
							if (vault.configured && vault.unlocked)
								run(call(updateVaultSettings, { autoLockMinutes: value }))
									.then(() =>
										toast.success("Takes effect next time you unlock"),
									)
									.catch((cause) => toast.error(cause.message));
						}}
						options={[5, 15, 60, 240].map((value) => ({
							value,
							label: value < 60 ? `${value}m` : `${value / 60}h`,
						}))}
					/>
				</Field>
			</div>

			<form
				onSubmit={savePassword}
				className="space-y-3 border-t border-line pt-5"
			>
				<h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
					{vault.configured ? "Change password" : "Create vault"}
				</h3>
				{vault.configured && (
					<input
						className="field"
						type="password"
						placeholder="Current vault password"
						value={currentPassword}
						onChange={(event) => setCurrentPassword(event.target.value)}
						autoComplete="off"
						required
					/>
				)}
				<input
					className="field"
					type="password"
					placeholder="New vault password"
					value={password}
					onChange={(event) => setPassword(event.target.value)}
					minLength={4}
					autoComplete="new-password"
					required
				/>
				<input
					className="field"
					type="password"
					placeholder="Repeat it"
					value={confirmPassword}
					onChange={(event) => setConfirmPassword(event.target.value)}
					minLength={4}
					autoComplete="new-password"
					required
				/>
				<p className="text-xs text-muted">
					Use something different from your account password. There's no
					recovery: forgetting it means resetting the vault.
				</p>
				<button
					type="submit"
					className="btn-primary w-full"
					disabled={pending || !codeValid}
				>
					{pending && <Loader2 className="size-4 animate-spin" />}
					{vault.configured ? "Change password" : "Create vault"}
				</button>
			</form>

			{vault.configured && (
				<div className="space-y-3 border-t border-line pt-5">
					{vault.unlocked && (
						<button
							type="button"
							className="btn-outline w-full"
							onClick={() => lock()}
						>
							<Lock className="size-4" /> Lock vault now
						</button>
					)}
					<details className="rounded-xl border border-red-500/30 p-3 text-sm">
						<summary className="flex cursor-pointer items-center gap-2 text-red-500">
							<ShieldAlert className="size-4" /> Forgot the password?
						</summary>
						<p className="mt-2 text-muted">
							Resetting permanently deletes every vault board and everything in
							it.
						</p>
						<div className="mt-3 flex gap-2">
							<input
								className="field"
								placeholder="Type RESET"
								value={resetText}
								onChange={(event) => setResetText(event.target.value)}
							/>
							<button
								type="button"
								className="btn bg-red-500 text-white"
								disabled={resetText !== "RESET"}
								onClick={async () => {
									await run(call(resetVault, { confirm: "RESET" }));
									toast("Vault reset");
									setResetText("");
									await refresh();
								}}
							>
								Reset
							</button>
						</div>
					</details>
				</div>
			)}
		</div>
	);
}

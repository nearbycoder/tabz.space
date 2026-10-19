import { useQueryClient } from "@tanstack/react-query";
import {
	Delete,
	KeyRound,
	Loader2,
	Lock,
	LockOpen,
	ShieldAlert,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Field, Segmented } from "#/components/ui/controls";
import { call, run } from "#/lib/api";
import { cn } from "#/lib/cn";
import { homeKey, useSaveSettings } from "#/lib/home-query";
import type { UserSettings } from "#/lib/preferences";
import {
	changeVaultPassword,
	createVault,
	setDecoyPassword,
	unlockWithPassword,
} from "#/lib/vault-actions";
import { clearVaultKey } from "#/lib/vault-session";
import type { HomeData } from "#/server/home";
import { lockVault, resetVault, updateVaultSettings } from "#/server/vault";

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
			clearVaultKey();
			await run(call(lockVault)).catch(() => {});
			await queryClient.invalidateQueries({ queryKey: homeKey });
			if (!quiet) toast("Vault locked", { icon: "🔒" });
		},
		[queryClient],
	);
}

/** Tries a vault password or PIN; resolves to an error message, or null when it opened. */
function useVaultUnlock(onUnlocked: (boardId: string) => void) {
	const queryClient = useQueryClient();
	return async (secret: string) => {
		try {
			const userId = queryClient.getQueryData<HomeData>(homeKey)?.userId ?? "";
			const result = await unlockWithPassword(secret, userId, queryClient);
			await queryClient.invalidateQueries({ queryKey: homeKey });
			toast("Vault unlocked", { icon: "🔓" });
			onUnlocked(result.boardId);
			return null;
		} catch (cause) {
			return cause instanceof Error ? cause.message : "Couldn't unlock";
		}
	};
}

/** The unlock prompt: a keypad for PIN vaults, a password field otherwise. */
export function VaultUnlockDialog({
	onClose,
	onUnlocked,
}: {
	onClose: () => void;
	onUnlocked: (boardId: string) => void;
}) {
	const queryClient = useQueryClient();
	const pinLength =
		queryClient.getQueryData<HomeData>(homeKey)?.vault.pinLength;
	const attempt = useVaultUnlock(onUnlocked);
	// The reset option lives here because vault settings stay hidden until
	// the vault is open, and a forgotten PIN means it can't be opened.
	const [forgot, setForgot] = useState(false);
	if (forgot)
		return (
			<ResetPrompt
				what={pinLength ? "PIN" : "password"}
				onBack={() => setForgot(false)}
				onDone={onClose}
			/>
		);
	return pinLength ? (
		<PinPad
			length={pinLength}
			onSubmit={attempt}
			onClose={onClose}
			onForgot={() => setForgot(true)}
		/>
	) : (
		<PasswordPrompt
			onSubmit={attempt}
			onClose={onClose}
			onForgot={() => setForgot(true)}
		/>
	);
}

/** Forgot the PIN/password: wipe the vault (and everything in it) to start over. */
function ResetPrompt({
	what,
	onBack,
	onDone,
}: {
	what: string;
	onBack: () => void;
	onDone: () => void;
}) {
	const queryClient = useQueryClient();
	const [text, setText] = useState("");
	const [pending, setPending] = useState(false);
	return createPortal(
		<div className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[18dvh] sm:items-center sm:pt-4">
			<button
				type="button"
				aria-label="Close"
				className="absolute inset-0 bg-black/60 backdrop-blur-xl"
				onClick={onDone}
			/>
			<div className="glass animate-pop relative w-full max-w-xs rounded-[2rem] p-7 text-center shadow-2xl">
				<div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-red-500/15 text-red-500">
					<ShieldAlert className="size-6" />
				</div>
				<h2 className="text-lg font-semibold">Forgot your {what}?</h2>
				<p className="mt-2 text-sm text-muted">
					It can't be recovered: the vault is encrypted with it. Resetting
					permanently deletes every vault board and everything in it, so you can
					set up a new one.
				</p>
				<input
					className="field mt-5 text-center"
					placeholder="Type RESET"
					value={text}
					onChange={(event) => setText(event.target.value)}
					autoCapitalize="characters"
					autoComplete="off"
				/>
				<button
					type="button"
					className="btn mt-4 w-full bg-red-500 text-white"
					disabled={text !== "RESET" || pending}
					onClick={async () => {
						setPending(true);
						try {
							await run(call(resetVault, { confirm: "RESET" }));
							clearVaultKey();
							await queryClient.invalidateQueries({ queryKey: homeKey });
							toast("Vault reset. Set up a new one in Customize → Vault.");
							onDone();
						} catch (cause) {
							toast.error(
								cause instanceof Error ? cause.message : "Couldn't reset",
							);
							setPending(false);
						}
					}}
				>
					{pending && <Loader2 className="size-4 animate-spin" />} Reset vault
				</button>
				<button
					type="button"
					className="btn-ghost mt-2 w-full"
					onClick={onBack}
				>
					Back
				</button>
			</div>
		</div>,
		document.body,
	);
}

function PasswordPrompt({
	onSubmit,
	onClose,
	onForgot,
}: {
	onSubmit: (secret: string) => Promise<string | null>;
	onClose: () => void;
	onForgot: () => void;
}) {
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [shake, setShake] = useState(0);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		setError(null);
		const failure = await onSubmit(password);
		if (failure) {
			setError(failure);
			setShake((n) => n + 1);
			setPassword("");
			setPending(false);
		}
	};

	return createPortal(
		<div className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[18dvh] sm:items-center sm:pt-4">
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
				<button
					type="button"
					className="mt-3 text-xs text-muted hover:text-ink"
					onClick={onForgot}
				>
					Forgot password?
				</button>
			</form>
		</div>,
		document.body,
	);
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

/** Full-screen phone-style keypad; unlocks as soon as the last digit is in. */
function PinPad({
	length,
	onSubmit,
	onClose,
	onForgot,
}: {
	length: number;
	onSubmit: (pin: string) => Promise<string | null>;
	onClose: () => void;
	onForgot: () => void;
}) {
	const [pin, setPin] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [shake, setShake] = useState(0);

	const press = useCallback(
		(key: string) => {
			if (pending) return;
			setError(null);
			if (key === "back") setPin((value) => value.slice(0, -1));
			else if (/^\d$/.test(key))
				setPin((value) => (value.length < length ? value + key : value));
		},
		[pending, length],
	);

	// Submit once every digit is entered.
	useEffect(() => {
		if (pin.length !== length || pending) return;
		setPending(true);
		void onSubmit(pin).then((failure) => {
			if (!failure) return;
			setError(failure.replace(/vault password/i, "PIN"));
			setShake((n) => n + 1);
			navigator.vibrate?.(200);
			setPin("");
			setPending(false);
		});
	}, [pin, length, pending, onSubmit]);

	// A hardware keyboard works too.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
			else if (event.key === "Backspace") press("back");
			else if (/^\d$/.test(event.key)) press(event.key);
			else return;
			event.preventDefault();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [press, onClose]);

	return createPortal(
		<div
			role="dialog"
			aria-label="Enter vault PIN"
			className="animate-pop fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/75 px-6 pt-[env(safe-area-inset-top)] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white backdrop-blur-2xl select-none"
		>
			<button
				type="button"
				onClick={onClose}
				className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 rounded-full px-3 py-1.5 text-sm text-white/70 hover:text-white"
			>
				Cancel
			</button>
			<div className="grid size-14 place-items-center rounded-2xl bg-white/10">
				{pending ? (
					<Loader2 className="size-6 animate-spin" />
				) : (
					<Lock className="size-6" />
				)}
			</div>
			<h2 className="mt-4 text-lg font-semibold">Enter PIN</h2>
			<div
				key={shake}
				className={cn("mt-6 flex gap-4", shake > 0 && "animate-shake")}
				role="status"
				aria-label={`${pin.length} of ${length} digits entered`}
			>
				{Array.from({ length }, (_, index) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: one dot per digit position
						key={index}
						className={cn(
							"size-3.5 rounded-full border-2 border-white/80 transition",
							index < pin.length && "scale-110 bg-white",
						)}
					/>
				))}
			</div>
			<p className="mt-4 h-5 text-sm text-red-300">{error}</p>
			<div className="mt-4 grid grid-cols-3 gap-x-6 gap-y-4">
				{KEYS.map((key, index) =>
					key === "" ? (
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed keypad layout
						<span key={index} />
					) : (
						<button
							key={key}
							type="button"
							onClick={() => press(key)}
							disabled={pending}
							aria-label={key === "back" ? "Delete" : key}
							className="grid size-[4.75rem] place-items-center rounded-full bg-white/10 text-3xl font-light transition active:scale-95 active:bg-white/25 disabled:opacity-50 sm:size-20"
						>
							{key === "back" ? <Delete className="size-6" /> : key}
						</button>
					),
				)}
			</div>
			<button
				type="button"
				onClick={onForgot}
				className="mt-6 text-sm text-white/60 hover:text-white"
			>
				Forgot PIN?
			</button>
		</div>,
		document.body,
	);
}

const COMMON_PINS = new Set([
	"1234",
	"0000",
	"1111",
	"1212",
	"7777",
	"1004",
	"2000",
	"4444",
	"2222",
	"6969",
	"9999",
	"3333",
	"5555",
	"6666",
	"1122",
	"1313",
	"8888",
	"4321",
	"2001",
	"1010",
	"123456",
	"654321",
	"111111",
	"000000",
	"121212",
	"112233",
	"123123",
	"696969",
	"666666",
	"159753",
	"987654",
	"222222",
	"555555",
	"777777",
	"999999",
	"888888",
]);

/** Too easy to guess: repeated digits, straight runs or very common PINs. */
const isWeakPin = (pin: string) => {
	if (COMMON_PINS.has(pin) || /^(\d)\1+$/.test(pin)) return true;
	const steps = [...pin]
		.slice(1)
		.map((digit, index) => Number(digit) - Number(pin[index]));
	return (
		steps.every((step) => step === 1) || steps.every((step) => step === -1)
	);
};

/** A password field, or a numeric PIN field when `pinLength` is set. */
function SecretInput({
	pinLength,
	value,
	onChange,
	placeholder,
	autoComplete,
}: {
	pinLength: 4 | 6 | null;
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	autoComplete: string;
}) {
	return pinLength ? (
		<input
			className="field font-mono tracking-[0.5em]"
			type="password"
			inputMode="numeric"
			pattern={`\\d{${pinLength}}`}
			maxLength={pinLength}
			placeholder={placeholder}
			value={value}
			onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
			autoComplete={autoComplete}
			required
		/>
	) : (
		<input
			className="field"
			type="password"
			placeholder={placeholder}
			value={value}
			onChange={(event) => onChange(event.target.value)}
			minLength={4}
			autoComplete={autoComplete}
			required
		/>
	);
}

/** Checks a new password/PIN; returns a problem to show, or null. */
const checkSecret = (secret: string, pinLength: 4 | 6 | null) => {
	if (!pinLength) return secret.length < 4 ? "Use at least 4 characters" : null;
	if (!new RegExp(`^\\d{${pinLength}}$`).test(secret))
		return `Enter exactly ${pinLength} digits`;
	if (isWeakPin(secret))
		return "That PIN is too easy to guess. Try a less obvious one.";
	return null;
};

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
	// How the vault opens: a password, or a 4/6-digit PIN keypad.
	const [lockKind, setLockKind] = useState<"password" | 4 | 6>(
		vault.pinLength ?? "password",
	);
	const newPinLength = lockKind === "password" ? null : lockKind;
	const mustUnlock = vault.configured && vault.encrypted && !vault.unlocked;

	const refresh = () => queryClient.invalidateQueries({ queryKey: homeKey });

	const savePassword = async (event: FormEvent) => {
		event.preventDefault();
		const problem = checkSecret(password, newPinLength);
		if (problem) {
			toast.error(problem);
			return;
		}
		if (password !== confirmPassword) {
			toast.error(newPinLength ? "PINs don't match" : "Passwords don't match");
			return;
		}
		setPending(true);
		try {
			if (vault.configured)
				await changeVaultPassword({
					currentPassword,
					newPassword: password,
					autoLockMinutes: minutes,
					pinLength: newPinLength,
					queryClient,
				});
			else
				await createVault(
					password,
					queryClient.getQueryData<HomeData>(homeKey)?.userId ?? "",
					minutes,
					newPinLength,
				);
			if (code !== settings.vaultCode)
				saveSettings.mutate({ vaultCode: code.toLowerCase() });
			toast.success(
				vault.configured
					? newPinLength
						? "Vault PIN saved"
						: "Vault password changed"
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
					Vault boards never load until you unlock them, and their links are
					encrypted in your browser with a key made from your vault password:
					not even tabz can read them. They stay out of search, ⌘K, the
					most-visited strip, exports and AI assistants. Tap the clock 5 times
					quickly to open it (on any device) and 5 times again to lock it, or
					type your secret code anywhere on your home page.
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
					{vault.configured ? "Change password or PIN" : "Create vault"}
				</h3>
				<Field label="Unlock with">
					<Segmented
						value={lockKind}
						onChange={(value) => {
							setLockKind(value);
							setPassword("");
							setConfirmPassword("");
						}}
						options={[
							{ value: "password", label: "Password" },
							{ value: 4, label: "4-digit PIN" },
							{ value: 6, label: "6-digit PIN" },
						]}
					/>
				</Field>
				{vault.configured && (
					<SecretInput
						pinLength={vault.pinLength}
						placeholder={
							vault.pinLength ? "Current PIN" : "Current vault password"
						}
						value={currentPassword}
						onChange={setCurrentPassword}
						autoComplete="off"
					/>
				)}
				<SecretInput
					pinLength={newPinLength}
					placeholder={
						newPinLength
							? `New ${newPinLength}-digit PIN`
							: "New vault password"
					}
					value={password}
					onChange={setPassword}
					autoComplete="new-password"
				/>
				<SecretInput
					pinLength={newPinLength}
					placeholder="Repeat it"
					value={confirmPassword}
					onChange={setConfirmPassword}
					autoComplete="new-password"
				/>
				<p className="text-xs text-muted">
					{newPinLength
						? "A PIN opens with a keypad, handy on a phone, but it's easier to guess than a long password. Wrong tries are slowed down after 5, and 6 digits are much harder to guess than 4."
						: "Use something different from your account password."}{" "}
					There's no recovery: forgetting it means resetting the vault.
				</p>
				{mustUnlock && (
					<p className="text-xs text-amber-500">
						Unlock your vault first: changing how it opens re-encrypts
						everything in it.
					</p>
				)}
				<button
					type="submit"
					className="btn-primary w-full"
					disabled={pending || !codeValid || mustUnlock}
				>
					{pending && <Loader2 className="size-4 animate-spin" />}
					{vault.configured
						? newPinLength
							? "Save PIN"
							: "Change password"
						: "Create vault"}
				</button>
			</form>

			{vault.configured && vault.unlocked && vault.encrypted && (
				<DecoySettings pinLength={vault.pinLength} />
			)}

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
							<ShieldAlert className="size-4" /> Forgot the password or PIN?
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

/** A second password that opens a separate, harmless vault. */
function DecoySettings({ pinLength }: { pinLength: 4 | 6 | null }) {
	const [open, setOpen] = useState(false);
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [pending, setPending] = useState(false);

	const save = async (event: FormEvent) => {
		event.preventDefault();
		const problem = checkSecret(password, pinLength);
		if (problem) {
			toast.error(problem);
			return;
		}
		if (password !== confirm) {
			toast.error(pinLength ? "PINs don't match" : "Passwords don't match");
			return;
		}
		setPending(true);
		try {
			await setDecoyPassword(password);
			toast.success("Decoy password set");
			setPassword("");
			setConfirm("");
			setOpen(false);
		} catch (cause) {
			toast.error(cause instanceof Error ? cause.message : "Couldn't save");
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="space-y-3 border-t border-line pt-5">
			<h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
				Decoy {pinLength ? "PIN" : "password"}
			</h3>
			<p className="text-sm text-muted">
				If someone makes you open your vault, type this instead. It opens a
				separate vault you fill with harmless links, and nothing shows that the
				real one exists. Changing your real password removes the decoy.
			</p>
			{open ? (
				<form onSubmit={save} className="space-y-2">
					<SecretInput
						pinLength={pinLength}
						placeholder={
							pinLength ? `Decoy ${pinLength}-digit PIN` : "Decoy password"
						}
						value={password}
						onChange={setPassword}
						autoComplete="new-password"
					/>
					<SecretInput
						pinLength={pinLength}
						placeholder="Repeat it"
						value={confirm}
						onChange={setConfirm}
						autoComplete="new-password"
					/>
					<div className="flex gap-2">
						<button
							type="submit"
							className="btn-primary flex-1"
							disabled={pending}
						>
							{pending && <Loader2 className="size-4 animate-spin" />} Save
							decoy
						</button>
						<button
							type="button"
							className="btn-ghost"
							onClick={async () => {
								await setDecoyPassword(null).catch(() => {});
								toast("Decoy password removed");
								setOpen(false);
							}}
						>
							Remove
						</button>
					</div>
				</form>
			) : (
				<button
					type="button"
					className="btn-outline w-full"
					onClick={() => setOpen(true)}
				>
					Set a decoy {pinLength ? "PIN" : "password"}
				</button>
			)}
		</div>
	);
}

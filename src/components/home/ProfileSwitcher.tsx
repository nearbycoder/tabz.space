import { Check, ChevronDown, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "#/lib/cn";
import type { ProfileInfo } from "#/lib/profiles";
import { useHomeContext } from "./context";
import { useProfileActions } from "./profile-actions";

/** A profile's emoji, or its initial when it has none. */
export function ProfileIcon({
	profile,
	className,
}: {
	profile: ProfileInfo;
	className?: string;
}) {
	return profile.icon ? (
		<span className={className}>{profile.icon}</span>
	) : (
		<span
			className={cn(
				"grid size-5 place-items-center rounded-full bg-accent text-[11px] font-semibold text-white",
				className,
			)}
		>
			{profile.name.trim().charAt(0).toUpperCase()}
		</span>
	);
}

/** Header menu for switching profiles (or ⌥⇧P); shown once there are two. */
export function ProfileSwitcher() {
	const { profiles, profile, switchProfile } = useHomeContext();
	const { create } = useProfileActions();
	const [open, setOpen] = useState(false);
	const [adding, setAdding] = useState(false);
	const [name, setName] = useState("");
	const root = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const away = (event: MouseEvent) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false);
		};
		const onEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", away);
		document.addEventListener("keydown", onEscape);
		return () => {
			document.removeEventListener("mousedown", away);
			document.removeEventListener("keydown", onEscape);
		};
	}, [open]);

	const close = () => {
		setOpen(false);
		setAdding(false);
		setName("");
	};

	return (
		<div ref={root} className="relative shrink-0">
			<button
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				title="Switch profile (Alt+Shift+P)"
				onClick={() => (open ? close() : setOpen(true))}
				className="glass focus-ring flex h-10 items-center gap-1.5 rounded-2xl px-3 text-sm font-medium"
			>
				<ProfileIcon profile={profile} />
				<span className="hidden max-w-32 truncate sm:inline">
					{profile.name}
				</span>
				<ChevronDown className="size-3.5 text-muted" />
			</button>
			{open && (
				<div
					role="menu"
					className="glass absolute top-full left-0 z-50 mt-2 w-60 rounded-2xl bg-surface-2 p-1.5 shadow-xl"
				>
					{profiles.map((item) => (
						<button
							key={item.id}
							type="button"
							role="menuitemradio"
							aria-checked={item.id === profile.id}
							onClick={() => {
								switchProfile(item.id);
								close();
							}}
							className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
						>
							<ProfileIcon profile={item} />
							<span className="flex-1 truncate">{item.name}</span>
							{item.id === profile.id && (
								<Check className="size-4 text-accent" />
							)}
						</button>
					))}
					<div className="my-1 h-px bg-line" />
					{adding ? (
						<form
							className="flex gap-1.5 p-1"
							onSubmit={(event) => {
								event.preventDefault();
								if (!name.trim()) return;
								create.mutate({ name: name.trim() });
								close();
							}}
						>
							<input
								autoFocus
								className="field h-8 flex-1 text-sm"
								placeholder="Work"
								maxLength={40}
								value={name}
								onChange={(event) => setName(event.target.value)}
								aria-label="Profile name"
							/>
							<button type="submit" className="btn-primary h-8 px-3 text-xs">
								Add
							</button>
						</form>
					) : (
						<button
							type="button"
							onClick={() => setAdding(true)}
							className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-muted hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] hover:text-ink"
						>
							<Plus className="size-4" /> New profile
						</button>
					)}
					<p className="px-2.5 pt-1 pb-0.5 text-[11px] text-muted">
						Next profile: ⌥⇧P (Alt+Shift+P), or P when you're not typing.
					</p>
				</div>
			)}
		</div>
	);
}

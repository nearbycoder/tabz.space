import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useHomeContext } from "./context";
import { ProfileIcon } from "./ProfileSwitcher";
import { useProfileActions } from "./profile-actions";

/** Customize → Home: make, rename and remove profiles. */
export function ProfilesSettings() {
	const { profiles, profile: active, switchProfile } = useHomeContext();
	const { create, rename, remove } = useProfileActions();
	const [name, setName] = useState("");
	const real = profiles.length > 1;

	return (
		<div className="space-y-3">
			<p className="text-xs text-muted">
				Separate sets of boards for different parts of your life, like Personal
				and Work. Switch with the menu next to your boards or press ⌥⇧P
				(Alt+Shift+P).
				{!real && " Your current boards become your Personal profile."}
			</p>
			{real && (
				<ul className="space-y-1.5">
					{profiles.map((profile) => (
						<li key={profile.id} className="flex items-center gap-2">
							<input
								className="field h-9 w-12 text-center"
								defaultValue={profile.icon ?? ""}
								placeholder={profile.name.charAt(0).toUpperCase()}
								maxLength={8}
								aria-label={`Icon for ${profile.name}`}
								onBlur={(event) => {
									const icon = event.target.value.trim() || null;
									if (icon !== profile.icon)
										rename.mutate({ id: profile.id, icon });
								}}
							/>
							<input
								className="field h-9 flex-1"
								defaultValue={profile.name}
								maxLength={40}
								aria-label="Profile name"
								onBlur={(event) => {
									const value = event.target.value.trim();
									if (value && value !== profile.name)
										rename.mutate({ id: profile.id, name: value });
									else event.target.value = profile.name;
								}}
							/>
							{profile.id === active.id ? (
								<span className="w-16 text-center text-xs text-muted">
									Showing
								</span>
							) : (
								<button
									type="button"
									className="btn-ghost w-16 text-xs"
									onClick={() => switchProfile(profile.id)}
								>
									Show
								</button>
							)}
							<button
								type="button"
								className="icon-btn size-9"
								aria-label={`Remove ${profile.name}`}
								title="Remove (its boards move to another profile)"
								onClick={() => {
									if (
										window.confirm(
											`Remove ${profile.name}? Its boards move to ${
												profiles.find((p) => p.id !== profile.id)?.name
											}; nothing is deleted.`,
										)
									)
										remove.mutate({ id: profile.id });
								}}
							>
								<Trash2 className="size-4" />
							</button>
						</li>
					))}
				</ul>
			)}
			<form
				className="flex gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (!name.trim()) return;
					create.mutate({ name: name.trim() });
					setName("");
				}}
			>
				<input
					className="field h-9 flex-1"
					placeholder={real ? "Another profile" : "Work"}
					maxLength={40}
					value={name}
					onChange={(event) => setName(event.target.value)}
					aria-label="New profile name"
				/>
				<button
					type="submit"
					className="btn-primary h-9"
					disabled={!name.trim() || create.isPending}
				>
					Add profile
				</button>
			</form>
			{!real && (
				<p className="flex items-center gap-1.5 text-xs text-muted">
					<ProfileIcon profile={active} /> Everything you have now is in{" "}
					{active.name}.
				</p>
			)}
		</div>
	);
}

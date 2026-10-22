/*
 * Profiles split one account's boards into separate sets (Personal, Work, …);
 * the page shows the active one's. See server/profiles.ts.
 */

export type ProfileInfo = { id: string; name: string; icon: string | null };

/** Before a second profile exists, all boards form this one unnamed profile. */
export const IMPLICIT_PROFILE: ProfileInfo = {
	id: "",
	name: "Personal",
	icon: "🏠",
};

export const profileList = (profiles: ProfileInfo[]) =>
	profiles.length ? profiles : [IMPLICIT_PROFILE];

export const activeProfileOf = (
	profiles: ProfileInfo[],
	activeId: string | null,
) => profiles.find((profile) => profile.id === activeId) ?? profiles[0];

type Placed = { profileId?: string | null; vault: boolean };

/** The profile a board shows in: its own, or the first if it has none (or a stale one). */
export const profileOfBoard = (board: Placed, profiles: ProfileInfo[]) =>
	board.profileId && profiles.some((profile) => profile.id === board.profileId)
		? board.profileId
		: profiles[0].id;

/** Vault boards show in every profile while the vault is open. */
export const inProfile = (
	board: Placed,
	profileId: string,
	profiles: ProfileInfo[],
) => board.vault || profileOfBoard(board, profiles) === profileId;

/** The next profile after `current`, wrapping around (the `p` shortcut). */
export const nextProfile = (profiles: ProfileInfo[], current: string) =>
	profiles[
		(profiles.findIndex((profile) => profile.id === current) + 1) %
			profiles.length
	];

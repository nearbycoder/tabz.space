import { createContext, useContext } from "react";
import type { UserSettings } from "#/lib/preferences";
import type { ProfileInfo } from "#/lib/profiles";
import type { DialogState, HomeBoard, LinkItem } from "./types";

type HomeContextValue = {
	settings: UserSettings;
	/** The active profile's boards (plus open vault boards). */
	boards: HomeBoard[];
	/** Every profile, in order; one implicit profile until a second is made. */
	profiles: ProfileInfo[];
	profile: ProfileInfo;
	switchProfile: (id: string) => void;
	editing: boolean;
	openDialog: (dialog: DialogState) => void;
	/** Records a visit; `leaving` = this tab is navigating away (skip UI updates). */
	onVisit: (bookmark: LinkItem, options?: { leaving?: boolean }) => void;
	/** Whether a link opens privately (its own flag, its folder's, or the global setting). */
	isIncognito: (bookmark: LinkItem) => boolean;
	/** Opens a link the right way: private window, new tab or same tab. */
	openLink: (bookmark: LinkItem, options?: { newTab?: boolean }) => void;
	/** Opens many links: private ones in an incognito window, the rest as tabs. */
	openAll: (bookmarks: LinkItem[]) => void;
	/** The current board is shared with you as view-only. */
	readOnly: boolean;
};

export const HomeContext = createContext<HomeContextValue | null>(null);

export function useHomeContext() {
	const value = useContext(HomeContext);
	if (!value) throw new Error("useHomeContext must be used inside HomeScreen");
	return value;
}

/**
 * What a tile needs, without the library itself. Its identity survives
 * refetches (unlike `boards`), so after an edit only the tiles that changed
 * re-render instead of every tile on the board.
 */
export type TileContextValue = Pick<
	HomeContextValue,
	| "settings"
	| "editing"
	| "openDialog"
	| "onVisit"
	| "isIncognito"
	| "openLink"
	| "readOnly"
>;

export const TileContext = createContext<TileContextValue | null>(null);

/** Only reads TileContext: subscribing to HomeContext too would re-render every tile on each library change. */
export function useTileContext(): TileContextValue {
	const value = useContext(TileContext);
	if (!value) throw new Error("useTileContext must be used inside HomeScreen");
	return value;
}

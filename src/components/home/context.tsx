import { createContext, useContext } from "react";
import type { UserSettings } from "#/lib/preferences";
import type { DialogState, HomeBoard, LinkItem } from "./types";

type HomeContextValue = {
	settings: UserSettings;
	boards: HomeBoard[];
	editing: boolean;
	openDialog: (dialog: DialogState) => void;
	onVisit: (bookmark: LinkItem) => void;
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

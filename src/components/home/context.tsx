import { createContext, useContext } from "react";
import type { UserSettings } from "#/lib/preferences";
import type { DialogState, HomeBoard, LinkItem } from "./types";

type HomeContextValue = {
	settings: UserSettings;
	boards: HomeBoard[];
	editing: boolean;
	openDialog: (dialog: DialogState) => void;
	onVisit: (bookmark: LinkItem) => void;
};

export const HomeContext = createContext<HomeContextValue | null>(null);

export function useHomeContext() {
	const value = useContext(HomeContext);
	if (!value) throw new Error("useHomeContext must be used inside HomeScreen");
	return value;
}

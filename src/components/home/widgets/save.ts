import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { call, run } from "#/lib/api";
import { homeKey } from "#/lib/home-query";
import type { Widget } from "#/lib/preferences";
import { type HomeData, saveWidget } from "#/server/home";

/**
 * Updates a widget in the cache right away and saves it to the server after a
 * short pause, so typing in a note doesn't send a request per keystroke.
 */
export function useWidgetSaver(groupId: string, delay = 600) {
	const queryClient = useQueryClient();
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const latest = useRef<Widget | null>(null);

	const flush = useCallback(() => {
		clearTimeout(timer.current);
		const widget = latest.current;
		latest.current = null;
		if (widget)
			run(call(saveWidget, { id: groupId, widget })).catch((error) =>
				toast.error(error instanceof Error ? error.message : "Couldn't save"),
			);
	}, [groupId]);

	// Never lose the last edit when the widget unmounts or the tab closes.
	useEffect(() => {
		window.addEventListener("pagehide", flush);
		return () => {
			window.removeEventListener("pagehide", flush);
			flush();
		};
	}, [flush]);

	return useCallback(
		(widget: Widget, options: { now?: boolean } = {}) => {
			queryClient.setQueryData<HomeData>(homeKey, (data) =>
				data
					? {
							...data,
							boards: data.boards.map((board) => ({
								...board,
								groups: board.groups.map((group) =>
									group.id === groupId
										? { ...group, options: { ...group.options, widget } }
										: group,
								),
							})),
						}
					: data,
			);
			latest.current = widget;
			clearTimeout(timer.current);
			if (options.now) flush();
			else timer.current = setTimeout(flush, delay);
		},
		[queryClient, groupId, delay, flush],
	);
}

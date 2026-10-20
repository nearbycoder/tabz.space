import {
	queryOptions,
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { call, run } from "#/lib/api";
import type { UserSettings } from "#/lib/preferences";
import { getHome, type HomeData, saveSettings, undo } from "#/server/home";

export const homeKey = ["home"] as const;

export const homeQuery = queryOptions({
	queryKey: homeKey,
	queryFn: () => run(call(getHome)),
});

export const useHome = () => useSuspenseQuery(homeQuery).data;

type Options<I, O> = {
	/** Applied to the cache immediately; rolled back if the server rejects. */
	optimistic?: (data: HomeData, input: I) => HomeData;
	onSuccess?: (output: O, input: I) => void;
	success?: string;
	/** Show the success toast with an Undo button (reverts via the activity log). */
	undoable?: string | ((input: I) => string);
};

/** Reverts the latest change and refreshes. */
export function useUndo() {
	const queryClient = useQueryClient();
	return async (id?: string) => {
		try {
			const result = await run(call(undo, { id }));
			toast(`Undid: ${result.label}`, { icon: "↩️" });
		} catch (error) {
			toast(error instanceof Error ? error.message : "Nothing to undo");
		} finally {
			await queryClient.invalidateQueries({ queryKey: homeKey });
		}
	};
}

/** A home mutation: Effect-powered request + optimistic cache update + refetch. */
export function useHomeAction<I, O>(
	fn: (options: { data: I }) => Promise<O>,
	options: Options<I, O> = {},
) {
	const queryClient = useQueryClient();
	const undoLast = useUndo();
	return useMutation({
		mutationFn: (input: I) => run(call(fn, input)),
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: homeKey });
			const previous = queryClient.getQueryData<HomeData>(homeKey);
			if (previous && options.optimistic) {
				queryClient.setQueryData(homeKey, options.optimistic(previous, input));
			}
			return { previous };
		},
		onError: (error, _input, context) => {
			if (context?.previous)
				queryClient.setQueryData(homeKey, context.previous);
			toast.error(error.message);
		},
		onSuccess: (output, input) => {
			if (options.undoable) {
				const label =
					typeof options.undoable === "function"
						? options.undoable(input)
						: options.undoable;
				toast(label, {
					action: { label: "Undo", onClick: () => undoLast() },
					duration: 6000,
				});
			} else if (options.success) toast.success(options.success);
			options.onSuccess?.(output, input);
		},
		onSettled: () => {
			nudgeBrowserSync();
			return queryClient.invalidateQueries({ queryKey: homeKey });
		},
	});
}

export function useSaveSettings() {
	return useHomeAction(saveSettings, {
		optimistic: (data, input: Partial<UserSettings>) => ({
			...data,
			settings: { ...data.settings, ...input },
		}),
	});
}

let nudge: ReturnType<typeof setTimeout> | undefined;

/**
 * After a change, tell the extension (if any) to pick up edits meant for the
 * browser's bookmarks now rather than at its next check.
 */
function nudgeBrowserSync() {
	if (typeof window === "undefined") return;
	clearTimeout(nudge);
	nudge = setTimeout(
		() =>
			window.postMessage(
				{ source: "tabz-page", type: "sync-browser" },
				location.origin,
			),
		1500,
	);
}

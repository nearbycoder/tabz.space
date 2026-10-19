import {
	queryOptions,
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { call, run } from "#/lib/api";
import type { UserSettings } from "#/lib/preferences";
import { getHome, type HomeData, saveSettings } from "#/server/home";

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
};

/** A home mutation: Effect-powered request + optimistic cache update + refetch. */
export function useHomeAction<I, O>(
	fn: (options: { data: I }) => Promise<O>,
	options: Options<I, O> = {},
) {
	const queryClient = useQueryClient();
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
			if (options.success) toast.success(options.success);
			options.onSuccess?.(output, input);
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: homeKey }),
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

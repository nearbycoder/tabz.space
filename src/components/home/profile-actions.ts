import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { call, run } from "#/lib/api";
import { homeKey, useHomeAction } from "#/lib/home-query";
import {
	createProfile,
	deleteProfile,
	placeBoard,
	saveSettings,
	updateProfile,
} from "#/server/home";

/** Making, renaming and removing profiles, and moving boards between them. */
export function useProfileActions() {
	const queryClient = useQueryClient();
	// Creating also switches to the new profile; the page updates once, with
	// the profile and its starter board both in place.
	const create = useMutation({
		mutationFn: async (input: { name: string; icon?: string | null }) => {
			const { profile, boardId } = await run(call(createProfile, input));
			await run(
				call(saveSettings, {
					activeProfileId: profile.id,
					activeBoardId: boardId,
				}),
			);
			await queryClient.invalidateQueries({ queryKey: homeKey });
			return profile;
		},
		onSuccess: (profile) => toast.success(`Switched to ${profile.name}`),
		onError: (error) => toast.error(error.message),
	});
	const rename = useHomeAction(updateProfile, {
		optimistic: (data, { id, ...patch }) => ({
			...data,
			profiles: data.profiles.map((profile) =>
				profile.id === id ? { ...profile, ...patch } : profile,
			),
		}),
	});
	// Its boards fall back to the first remaining profile, as on the server.
	const remove = useHomeAction(deleteProfile, {
		optimistic: (data, { id }) => ({
			...data,
			profiles: data.profiles.filter((profile) => profile.id !== id),
		}),
		success: "Profile removed; its boards moved over",
	});
	const place = useHomeAction(placeBoard, {
		optimistic: (data, { boardId, profileId }) => ({
			...data,
			boards: data.boards.map((board) =>
				board.id === boardId ? { ...board, profileId } : board,
			),
		}),
	});
	return { create, rename, remove, place };
}

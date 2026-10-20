import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "#/components/ui/Modal";
import { call, run } from "#/lib/api";
import { homeKey } from "#/lib/home-query";
import { runCommand } from "#/server/home";

/** ⌘K → "Ask AI": a plain-language request that reorganizes your library. */
export function AiCommandDialog({
	text: initial,
	onClose,
}: {
	text: string;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [text, setText] = useState(initial);
	const command = useMutation({
		mutationFn: (value: string) => run(call(runCommand, { text: value })),
		onSettled: () => queryClient.invalidateQueries({ queryKey: homeKey }),
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: run the palette's text once on open
	useEffect(() => {
		if (initial.trim().length >= 3) command.mutate(initial.trim());
	}, []);

	return (
		<Modal open onClose={onClose} title="Ask AI">
			<form
				className="space-y-3"
				onSubmit={(event) => {
					event.preventDefault();
					if (text.trim().length >= 3) command.mutate(text.trim());
				}}
			>
				<textarea
					className="field min-h-20 resize-y"
					value={text}
					onChange={(event) => setText(event.target.value)}
					placeholder="Move my recipe links into a new Cooking board and tag them by cuisine"
					maxLength={1000}
					aria-label="What should tabz do?"
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							event.currentTarget.form?.requestSubmit();
						}
					}}
				/>
				{command.isPending ? (
					<p className="flex items-center gap-2 text-sm text-muted">
						<Loader2 className="size-4 animate-spin" /> Working on it…
					</p>
				) : command.isError ? (
					<p className="text-sm text-red-500">{command.error.message}</p>
				) : command.data ? (
					<div className="space-y-2 rounded-2xl border border-line p-3 text-sm">
						<p>{command.data.reply}</p>
						{command.data.actions.length > 0 && (
							<ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">
								{command.data.actions.map((action, index) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: actions repeat and never reorder
									<li key={index}>{action}</li>
								))}
							</ul>
						)}
						{command.data.actions.length > 0 && (
							<p className="text-xs text-muted">
								Each change is in History; ⌘Z undoes them one at a time.
							</p>
						)}
					</div>
				) : (
					<p className="text-xs text-muted">
						Describe a change in plain words. It can make boards, groups and
						folders, move, tag and rename links. It never deletes anything, and
						it never sees your vault or private links.
					</p>
				)}
				<div className="flex justify-end gap-2">
					<button type="button" className="btn-outline" onClick={onClose}>
						Close
					</button>
					<button
						type="submit"
						className="btn-primary"
						disabled={command.isPending || text.trim().length < 3}
					>
						<Sparkles className="size-4" /> Run
					</button>
				</div>
			</form>
		</Modal>
	);
}

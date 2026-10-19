import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Loader2, LogOut, UserPlus, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Toggle } from "#/components/ui/controls";
import { call, run } from "#/lib/api";
import { homeKey } from "#/lib/home-query";
import {
	inviteBoardMember,
	listBoardMembers,
	removeBoardMember,
	setBoardPublic,
	updateBoardMember,
} from "#/server/home";
import { CopyButton } from "./ConnectAI";
import type { HomeBoard } from "./types";

const message = (cause: unknown) =>
	cause instanceof Error ? cause.message : "Something went wrong";

function Avatar({ name, image }: { name: string; image: string | null }) {
	return image ? (
		<img src={image} alt="" className="size-7 shrink-0 rounded-full" />
	) : (
		<span className="grid size-7 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-xs font-semibold text-accent uppercase">
			{name.slice(0, 1)}
		</span>
	);
}

/** Public link + collaborators for a board (owner view), or "leave" for members. */
export function ShareBoard({
	board,
	userId,
	onLeft,
}: {
	board: HomeBoard;
	userId: string;
	onLeft: () => void;
}) {
	const queryClient = useQueryClient();
	const key = ["members", board.id];
	const members = useQuery({
		queryKey: key,
		queryFn: () => run(call(listBoardMembers, { boardId: board.id })),
		enabled: board.role === "owner",
	});
	const [who, setWho] = useState("");
	const [role, setRole] = useState<"editor" | "viewer">("editor");
	const [pending, setPending] = useState(false);
	const [origin, setOrigin] = useState("https://tabz.space");
	useEffect(() => setOrigin(window.location.origin), []);
	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: key }),
			queryClient.invalidateQueries({ queryKey: homeKey }),
		]);

	if (board.role !== "owner")
		return (
			<div className="flex items-center justify-between gap-3 rounded-2xl border border-line p-3 text-sm">
				<span className="text-muted">
					Shared with you by{" "}
					<span className="text-ink">{board.ownerName ?? "someone"}</span> · you
					can {board.role === "editor" ? "edit" : "view"}
				</span>
				<button
					type="button"
					className="btn-ghost shrink-0 text-red-500"
					onClick={async () => {
						try {
							await run(
								call(removeBoardMember, {
									boardId: board.id,
									memberId: userId,
								}),
							);
							toast(`You left “${board.name}”`);
							await queryClient.invalidateQueries({ queryKey: homeKey });
							onLeft();
						} catch (cause) {
							toast.error(message(cause));
						}
					}}
				>
					<LogOut className="size-4" /> Leave
				</button>
			</div>
		);

	const shareSlug = members.data?.shareSlug ?? board.shareSlug;
	const publicUrl = shareSlug ? `${origin}/b/${shareSlug}` : null;

	const invite = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		try {
			const added = await run(
				call(inviteBoardMember, { boardId: board.id, who, role }),
			);
			toast.success(
				`${added.name} can now ${role === "editor" ? "edit" : "view"} this board`,
			);
			setWho("");
			await refresh();
		} catch (cause) {
			toast.error(message(cause));
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="space-y-4 rounded-2xl border border-line p-3">
			<div className="space-y-2">
				<Toggle
					label="🌍 Anyone with the link can view"
					checked={Boolean(shareSlug)}
					onChange={async (on) => {
						try {
							await run(call(setBoardPublic, { id: board.id, public: on }));
							await refresh();
						} catch (cause) {
							toast.error(message(cause));
						}
					}}
				/>
				{publicUrl && (
					<div className="flex items-center gap-1 rounded-xl border border-line bg-surface-2 py-1 pr-1 pl-3">
						<Globe className="size-3.5 shrink-0 text-muted" />
						<a
							href={publicUrl}
							target="_blank"
							rel="noreferrer"
							className="min-w-0 flex-1 truncate font-mono text-xs hover:underline"
						>
							{publicUrl}
						</a>
						<CopyButton value={publicUrl} />
					</div>
				)}
				<p className="text-xs text-muted">
					Visitors see regular groups and links (not widgets, smart groups or
					private links) and can copy them to their own tabz.
				</p>
			</div>
			<div className="space-y-2 border-t border-line pt-3">
				<p className="text-xs font-semibold tracking-wide text-muted uppercase">
					People
				</p>
				<form onSubmit={invite} className="flex gap-2">
					<input
						className="field"
						placeholder="Username or email"
						value={who}
						onChange={(event) => setWho(event.target.value)}
						autoCapitalize="none"
					/>
					<select
						className="field w-auto"
						value={role}
						onChange={(event) => setRole(event.target.value as typeof role)}
						aria-label="Role"
					>
						<option value="editor">Can edit</option>
						<option value="viewer">Can view</option>
					</select>
					<button
						type="submit"
						className="btn-primary shrink-0"
						disabled={pending || who.trim().length < 2}
						aria-label="Invite"
					>
						{pending ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<UserPlus className="size-4" />
						)}
					</button>
				</form>
				<ul className="space-y-1">
					{members.data?.owner && (
						<li className="flex items-center gap-2 text-sm">
							<Avatar
								name={members.data.owner.name}
								image={members.data.owner.image}
							/>
							<span className="min-w-0 flex-1 truncate">
								{members.data.owner.name} (you)
							</span>
							<span className="text-xs text-muted">Owner</span>
						</li>
					)}
					{members.data?.members.map((member) => (
						<li key={member.id} className="flex items-center gap-2 text-sm">
							<Avatar name={member.name} image={member.image} />
							<span className="min-w-0 flex-1 truncate">
								{member.name}
								{member.username && (
									<span className="ml-1 text-xs text-muted">
										@{member.username}
									</span>
								)}
							</span>
							<select
								className="rounded-lg bg-transparent text-xs text-muted"
								value={member.role}
								aria-label={`${member.name}'s role`}
								onChange={async (event) => {
									try {
										await run(
											call(updateBoardMember, {
												boardId: board.id,
												memberId: member.id,
												role: event.target.value as "editor" | "viewer",
											}),
										);
										await refresh();
									} catch (cause) {
										toast.error(message(cause));
									}
								}}
							>
								<option value="editor">Can edit</option>
								<option value="viewer">Can view</option>
							</select>
							<button
								type="button"
								className="icon-btn size-7"
								aria-label={`Remove ${member.name}`}
								onClick={async () => {
									try {
										await run(
											call(removeBoardMember, {
												boardId: board.id,
												memberId: member.id,
											}),
										);
										await refresh();
									} catch (cause) {
										toast.error(message(cause));
									}
								}}
							>
								<X className="size-3.5" />
							</button>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

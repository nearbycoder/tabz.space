import {
	Bookmark,
	Check,
	Loader2,
	PencilLine,
	RefreshCw,
	ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { call, run } from "#/lib/api";
import { authClient } from "#/lib/auth-client";
import { getConsentRequest } from "#/server/oauth";
import { Logo } from "./Logo";

const PERMISSIONS = [
	{ icon: Bookmark, label: "View your boards, groups and bookmarks" },
	{ icon: PencilLine, label: "Add, edit, organize and delete bookmarks" },
];

type Details = Awaited<ReturnType<typeof getConsentRequest>>;

/** OAuth consent screen shown when an MCP client (Claude, Cursor, …) connects. */
export function Consent() {
	// undefined = loading, null = invalid request.
	const [details, setDetails] = useState<Details | undefined>(undefined);
	useEffect(() => {
		// Read the raw query: the router re-serializes repeated params, which would
		// break the provider's signature over them.
		const query = window.location.search.slice(1);
		run(call(getConsentRequest, { query }))
			.then(setDetails)
			.catch(() => setDetails(null));
	}, []);
	const [pending, setPending] = useState<"allow" | "deny" | null>(null);
	const [error, setError] = useState<string | null>(null);

	const decide = async (accept: boolean) => {
		setPending(accept ? "allow" : "deny");
		setError(null);
		const result = await authClient.oauth2.consent({ accept });
		const url = (result.data as { url?: string } | null)?.url;
		if (url) {
			window.location.assign(url);
			return;
		}
		setError(result.error?.message ?? "Couldn't complete the request");
		setPending(null);
	};

	const offline = details?.scopes.includes("offline_access");

	return (
		<main className="relative grid min-h-dvh place-items-center px-4 py-12">
			<div
				aria-hidden
				className="pointer-events-none fixed inset-0"
				style={{
					background:
						"radial-gradient(at 20% 10%, #6366f144 0, transparent 50%), radial-gradient(at 80% 0%, #10b98133 0, transparent 50%)",
				}}
			/>
			<div className="glass animate-pop relative w-full max-w-sm rounded-3xl p-7 shadow-xl shadow-black/5">
				<Logo className="mb-6 text-lg" />
				{details === undefined ? (
					<div className="flex justify-center py-10 text-muted">
						<Loader2 className="size-5 animate-spin" />
					</div>
				) : !details ? (
					<p className="text-sm text-muted">
						This connection link is invalid or has expired. Start the connection
						again from your app.
					</p>
				) : (
					<>
						<div className="flex items-center gap-3">
							<div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface-2 text-lg font-semibold">
								{details.client.icon ? (
									<img
										src={details.client.icon}
										alt=""
										className="size-full object-cover"
									/>
								) : (
									details.client.name.charAt(0).toUpperCase()
								)}
							</div>
							<div className="min-w-0">
								<h1 className="truncate text-lg font-semibold">
									{details.client.name}
								</h1>
								<p className="truncate text-xs text-muted">
									wants to connect to your tabz
								</p>
							</div>
						</div>
						<ul className="mt-6 space-y-3 text-sm">
							{PERMISSIONS.map(({ icon: Icon, label }) => (
								<li key={label} className="flex items-start gap-3">
									<Icon className="mt-0.5 size-4 shrink-0 text-accent" />{" "}
									{label}
								</li>
							))}
							{offline && (
								<li className="flex items-start gap-3">
									<RefreshCw className="mt-0.5 size-4 shrink-0 text-accent" />{" "}
									Stay connected until you sign out of it
								</li>
							)}
						</ul>
						{details.user && (
							<p className="mt-6 flex items-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] px-3 py-2 text-xs text-muted">
								<ShieldCheck className="size-4 shrink-0" /> Signed in as{" "}
								{details.user.email}
							</p>
						)}
						{error && <p className="mt-4 text-sm text-red-500">{error}</p>}
						<div className="mt-6 flex gap-2">
							<button
								type="button"
								className="btn-outline flex-1"
								disabled={pending !== null}
								onClick={() => decide(false)}
							>
								{pending === "deny" && (
									<Loader2 className="size-4 animate-spin" />
								)}{" "}
								Deny
							</button>
							<button
								type="button"
								className="btn-primary flex-1"
								disabled={pending !== null}
								onClick={() => decide(true)}
							>
								{pending === "allow" ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<Check className="size-4" />
								)}{" "}
								Allow
							</button>
						</div>
					</>
				)}
			</div>
		</main>
	);
}

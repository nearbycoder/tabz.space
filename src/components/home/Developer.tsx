import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Send, Trash2, Webhook } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { call, run } from "#/lib/api";
import { cn } from "#/lib/cn";
import {
	createApiToken,
	createWebhook,
	deleteWebhook,
	listApiTokens,
	listWebhooks,
	revokeApiToken,
	testWebhook,
} from "#/server/developer";
import { CopyButton } from "./ConnectAI";

const tokensKey = ["api-tokens"];
const webhooksKey = ["webhooks"];

const ago = (value: Date | string | null) => {
	if (!value) return "never";
	const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
	return `${Math.round(minutes / 60 / 24)}d ago`;
};

const message = (cause: unknown) =>
	cause instanceof Error ? cause.message : "Something went wrong";

/** A secret shown once, with a copy button. */
function Reveal({ value, note }: { value: string; note: string }) {
	return (
		<div className="space-y-1.5 rounded-xl border border-accent/40 bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] p-3">
			<div className="flex items-center gap-1">
				<code className="min-w-0 flex-1 truncate font-mono text-xs">
					{value}
				</code>
				<CopyButton value={value} />
			</div>
			<p className="text-xs text-muted">{note}</p>
		</div>
	);
}

/** Personal API tokens for the REST API. */
export function ApiTokens() {
	const queryClient = useQueryClient();
	const tokens = useQuery({
		queryKey: tokensKey,
		queryFn: () => run(call(listApiTokens)),
	});
	const [name, setName] = useState("");
	const [created, setCreated] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const create = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		try {
			const result = await run(call(createApiToken, { name }));
			setCreated(result.token);
			setName("");
			await queryClient.invalidateQueries({ queryKey: tokensKey });
		} catch (cause) {
			toast.error(message(cause));
		} finally {
			setPending(false);
		}
	};

	const revoke = async (id: string) => {
		try {
			await run(call(revokeApiToken, { id }));
			await queryClient.invalidateQueries({ queryKey: tokensKey });
			toast("Token revoked");
		} catch (cause) {
			toast.error(message(cause));
		}
	};

	return (
		<div className="space-y-3">
			<p className="text-sm text-muted">
				For scripts, shortcuts and automations. Send{" "}
				<code className="font-mono text-ink">Authorization: Bearer tabz_…</code>{" "}
				to <code className="font-mono text-ink">/api/v1</code>.
			</p>
			<form onSubmit={create} className="flex gap-2">
				<input
					className="field"
					placeholder="Token name, e.g. iOS Shortcut"
					value={name}
					onChange={(event) => setName(event.target.value)}
					maxLength={60}
					required
				/>
				<button
					type="submit"
					className="btn-primary shrink-0"
					disabled={pending || !name.trim()}
				>
					{pending ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<KeyRound className="size-4" />
					)}{" "}
					Create
				</button>
			</form>
			{created && (
				<Reveal
					value={created}
					note="Copy it now. You won't be able to see it again."
				/>
			)}
			{tokens.data && tokens.data.length > 0 && (
				<ul className="divide-y divide-line rounded-xl border border-line">
					{tokens.data.map((token) => (
						<li key={token.id} className="flex items-center gap-3 px-3 py-2">
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium">{token.name}</div>
								<div className="truncate font-mono text-[11px] text-muted">
									{token.prefix}… · used {ago(token.lastUsedAt)}
								</div>
							</div>
							<button
								type="button"
								className="icon-btn size-8"
								aria-label={`Revoke ${token.name}`}
								title="Revoke"
								onClick={() => revoke(token.id)}
							>
								<Trash2 className="size-4" />
							</button>
						</li>
					))}
				</ul>
			)}
			<RestExamples />
		</div>
	);
}

function RestExamples() {
	const [origin, setOrigin] = useState("https://tabz.space");
	useEffect(() => setOrigin(window.location.origin), []);
	const example = `curl ${origin}/api/v1/bookmarks \\
  -H "Authorization: Bearer $TABZ_TOKEN" \\
  -H "content-type: application/json" \\
  -d '{"url":"https://example.com","group":"Reading list"}'`;
	return (
		<details className="rounded-xl border border-line p-3 text-sm">
			<summary className="cursor-pointer font-medium">API reference</summary>
			<div className="relative mt-3">
				<pre className="overflow-x-auto rounded-xl bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] p-3 pr-10 font-mono text-xs">
					{example}
				</pre>
				<CopyButton value={example} className="absolute top-1.5 right-1.5" />
			</div>
			<ul className="mt-3 space-y-1 font-mono text-xs text-muted">
				{[
					["GET", "/me"],
					["GET", "/library"],
					["GET", "/bookmarks?q=…"],
					["POST", "/bookmarks"],
					["POST", "/bookmarks/bulk"],
					["PATCH", "/bookmarks/:id"],
					["DELETE", "/bookmarks/:id"],
					["POST", "/groups"],
					["POST", "/tabs"],
					["POST", "/undo"],
					["GET", "/activity"],
				].map(([method, path]) => (
					<li key={method + path}>
						<span className="inline-block w-14 text-ink">{method}</span>
						{path}
					</li>
				))}
			</ul>
		</details>
	);
}

/** Outgoing webhooks, signed with HMAC-SHA256. */
export function Webhooks() {
	const queryClient = useQueryClient();
	const hooks = useQuery({
		queryKey: webhooksKey,
		queryFn: () => run(call(listWebhooks)),
	});
	const [url, setUrl] = useState("");
	const [pending, setPending] = useState(false);
	const [testing, setTesting] = useState<string | null>(null);
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: webhooksKey });

	const create = async (event: FormEvent) => {
		event.preventDefault();
		setPending(true);
		try {
			await run(call(createWebhook, { url: url.trim() }));
			setUrl("");
			await refresh();
			toast.success("Webhook added");
		} catch (cause) {
			toast.error(message(cause));
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="space-y-3">
			<p className="text-sm text-muted">
				Get a POST whenever bookmarks, groups or boards change. Verify{" "}
				<code className="font-mono text-ink">x-tabz-signature</code>, which is
				an HMAC-SHA256 of{" "}
				<code className="font-mono text-ink">timestamp.body</code> using the
				webhook's secret.
			</p>
			<form onSubmit={create} className="flex gap-2">
				<input
					className="field"
					placeholder="https://example.com/hooks/tabz"
					inputMode="url"
					value={url}
					onChange={(event) => setUrl(event.target.value)}
					required
				/>
				<button
					type="submit"
					className="btn-primary shrink-0"
					disabled={pending || !url.trim()}
				>
					{pending ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Webhook className="size-4" />
					)}{" "}
					Add
				</button>
			</form>
			{hooks.data?.map((hook) => (
				<div
					key={hook.id}
					className="space-y-2 rounded-xl border border-line p-3"
				>
					<div className="flex items-center gap-2">
						<span
							className={cn(
								"size-2 shrink-0 rounded-full",
								hook.lastStatus === null
									? "bg-muted"
									: hook.lastStatus >= 200 && hook.lastStatus < 300
										? "bg-emerald-500"
										: "bg-red-500",
							)}
							title={
								hook.lastStatus === null
									? "No deliveries yet"
									: `Last delivery: ${hook.lastStatus || "failed"} (${ago(hook.lastDeliveredAt)})`
							}
						/>
						<span className="min-w-0 flex-1 truncate font-mono text-xs">
							{hook.url}
						</span>
						<button
							type="button"
							className="icon-btn size-8"
							aria-label="Send test event"
							title="Send test event"
							disabled={testing === hook.id}
							onClick={async () => {
								setTesting(hook.id);
								try {
									const result = await run(call(testWebhook, { id: hook.id }));
									const ok = result.status >= 200 && result.status < 300;
									toast(
										ok
											? `Delivered (HTTP ${result.status})`
											: `Delivery failed${result.status ? ` (HTTP ${result.status})` : ""}`,
										{ icon: ok ? "✅" : "⚠️" },
									);
									await refresh();
								} catch (cause) {
									toast.error(message(cause));
								} finally {
									setTesting(null);
								}
							}}
						>
							{testing === hook.id ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Send className="size-4" />
							)}
						</button>
						<button
							type="button"
							className="icon-btn size-8"
							aria-label="Delete webhook"
							title="Delete"
							onClick={async () => {
								try {
									await run(call(deleteWebhook, { id: hook.id }));
									await refresh();
								} catch (cause) {
									toast.error(message(cause));
								}
							}}
						>
							<Trash2 className="size-4" />
						</button>
					</div>
					<div className="flex items-center gap-1 rounded-lg bg-surface-2 py-0.5 pr-0.5 pl-2">
						<span className="text-[11px] text-muted">Secret</span>
						<code className="min-w-0 flex-1 truncate font-mono text-[11px] blur-[3px] transition hover:blur-none">
							{hook.secret}
						</code>
						<CopyButton value={hook.secret} className="size-7" />
					</div>
				</div>
			))}
		</div>
	);
}

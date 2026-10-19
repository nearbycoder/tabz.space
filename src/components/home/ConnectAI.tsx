import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "#/lib/cn";

const CLIENTS = {
	claude: {
		label: "Claude",
		steps: (url: string) => [
			`Settings → Connectors → Add custom connector`,
			`Paste ${url} and click Connect`,
		],
	},
	"claude-code": {
		label: "Claude Code",
		command: (url: string) => `claude mcp add --transport http tabz ${url}`,
	},
	cursor: {
		label: "Cursor",
		command: (url: string) =>
			JSON.stringify({ mcpServers: { tabz: { url } } }, null, 2),
	},
	other: {
		label: "Other",
		steps: (url: string) => [
			`Add a remote (Streamable HTTP) MCP server with URL ${url}`,
			"Sign in to tabz when your app opens the browser",
		],
	},
} as const;

type ClientKey = keyof typeof CLIENTS;

export function CopyButton({
	value,
	className,
}: {
	value: string;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			aria-label="Copy"
			className={cn("icon-btn size-8 shrink-0", className)}
			onClick={async () => {
				await navigator.clipboard.writeText(value);
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			}}
		>
			{copied ? (
				<Check className="size-4 text-accent" />
			) : (
				<Copy className="size-4" />
			)}
		</button>
	);
}

/** Shows the MCP endpoint and per-client setup. Auth is OAuth, so there's no key to paste. */
export function ConnectAI() {
	const [origin, setOrigin] = useState("https://tabz.space");
	const [client, setClient] = useState<ClientKey>("claude");
	useEffect(() => setOrigin(window.location.origin), []);
	const url = `${origin}/api/mcp`;
	const selected = CLIENTS[client];

	return (
		<div className="space-y-3">
			<p className="text-sm text-muted">
				Let your AI assistant add, find and organize bookmarks for you. You'll
				sign in and approve access once, with no API keys.
			</p>
			<div className="flex items-center gap-1 rounded-xl border border-line bg-surface-2 py-1 pr-1 pl-3">
				<code className="min-w-0 flex-1 truncate font-mono text-xs">{url}</code>
				<CopyButton value={url} />
			</div>
			<div className="flex flex-wrap gap-1">
				{(Object.keys(CLIENTS) as ClientKey[]).map((key) => (
					<button
						key={key}
						type="button"
						onClick={() => setClient(key)}
						className={cn(
							"focus-ring rounded-lg px-2.5 py-1 text-xs font-medium transition",
							key === client
								? "bg-accent text-white"
								: "text-muted hover:text-ink",
						)}
					>
						{CLIENTS[key].label}
					</button>
				))}
			</div>
			{"command" in selected ? (
				<div className="relative">
					<pre className="overflow-x-auto rounded-xl bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] p-3 pr-10 font-mono text-xs">
						{selected.command(url)}
					</pre>
					<CopyButton
						value={selected.command(url)}
						className="absolute top-1.5 right-1.5"
					/>
				</div>
			) : (
				<ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
					{selected.steps(url).map((step) => (
						<li key={step}>{step}</li>
					))}
				</ol>
			)}
		</div>
	);
}

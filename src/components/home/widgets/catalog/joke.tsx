import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { dayKey, freshKey, Status, useJson, type WidgetProps } from "../kit";

export default function Joke(_: WidgetProps<object>) {
	const [nonce, setNonce] = useState(dayKey);
	const query = useJson<{ joke: string }>(
		`https://icanhazdadjoke.com/?n=${nonce}`,
		{ ttl: 86_400, refresh: 0 },
	);
	return (
		<Status query={query}>
			<div className="space-y-2">
				<p className="text-base leading-snug">{query.data?.joke}</p>
				<button
					type="button"
					className="btn-ghost text-xs"
					onClick={() => setNonce(freshKey())}
				>
					<RefreshCw className="size-3.5" /> Another one
				</button>
			</div>
		</Status>
	);
}

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { randomInt, Status, useJson, type WidgetProps } from "../kit";

/** The Advice Slip API has ~220 numbered slips; each one caches for a day. */
const pick = () => randomInt(220) + 1;

export default function Advice(_: WidgetProps<object>) {
	const [id, setId] = useState(
		() => (Math.floor(Date.now() / 86_400_000) % 220) + 1,
	);
	const query = useJson<{ slip?: { advice: string } }>(
		`https://api.adviceslip.com/advice/${id}`,
		{ ttl: 86_400, refresh: 0 },
	);
	const advice = query.data?.slip?.advice;
	return (
		<Status query={query}>
			<div className="space-y-2">
				<p className="text-base leading-snug">
					{advice ? `“${advice}”` : "No advice here. Try another."}
				</p>
				<button
					type="button"
					className="btn-ghost text-xs"
					onClick={() => setId(pick())}
				>
					<RefreshCw className="size-3.5" /> More advice
				</button>
			</div>
		</Status>
	);
}

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { dayKey, freshKey, Status, useJson, type WidgetProps } from "../kit";

type Data = { kind: "dog" | "cat" };

export default function Pets({ data }: WidgetProps<Data>) {
	const [nonce, setNonce] = useState(dayKey);
	const cat = data.kind === "cat";
	const query = useJson<{ message?: string } | { url: string }[]>(
		cat
			? `https://api.thecatapi.com/v1/images/search?n=${nonce}`
			: `https://dog.ceo/api/breeds/image/random?n=${nonce}`,
		{ ttl: 86_400, refresh: 0 },
	);
	const src = Array.isArray(query.data)
		? query.data[0]?.url
		: query.data?.message;
	return (
		<Status query={query}>
			<div className="group/pet relative">
				{src && (
					<img
						src={src}
						alt={cat ? "A cat" : "A dog"}
						className="max-h-72 w-full rounded-xl object-cover"
					/>
				)}
				<button
					type="button"
					aria-label="Another one"
					onClick={() => setNonce(freshKey())}
					className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
				>
					<RefreshCw className="size-4" />
				</button>
			</div>
		</Status>
	);
}

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "#/lib/cn";
import { Hint, type WidgetProps } from "../kit";

type Data = { urls: string[]; every: number; fit: "cover" | "contain" };

export default function Photos({ data }: WidgetProps<Data>) {
	const urls = data.urls
		.filter((url) => /^https:\/\//i.test(url.trim()))
		.map((url) => url.trim());
	const [index, setIndex] = useState(0);
	useEffect(() => {
		if (urls.length < 2) return;
		const id = setInterval(
			() => setIndex((value) => value + 1),
			Math.max(1, data.every || 1) * 60_000,
		);
		return () => clearInterval(id);
	}, [urls.length, data.every]);
	if (!urls.length)
		return <Hint>Add image links (https://…) in the widget's settings</Hint>;
	const current = urls[((index % urls.length) + urls.length) % urls.length];
	return (
		<div className="group/photo relative overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]">
			<img
				key={current}
				src={current}
				alt=""
				referrerPolicy="no-referrer"
				className={cn(
					"animate-pop aspect-[4/3] w-full",
					data.fit === "contain" ? "object-contain" : "object-cover",
				)}
			/>
			{urls.length > 1 && (
				<>
					<button
						type="button"
						aria-label="Previous photo"
						onClick={() => setIndex((value) => value - 1)}
						className="absolute top-1/2 left-1 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white opacity-0 transition group-hover/photo:opacity-100 pointer-coarse:opacity-100"
					>
						<ChevronLeft className="size-4" />
					</button>
					<button
						type="button"
						aria-label="Next photo"
						onClick={() => setIndex((value) => value + 1)}
						className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white opacity-0 transition group-hover/photo:opacity-100 pointer-coarse:opacity-100"
					>
						<ChevronRight className="size-4" />
					</button>
				</>
			)}
		</div>
	);
}

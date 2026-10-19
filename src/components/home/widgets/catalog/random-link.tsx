import { Shuffle } from "lucide-react";
import { useState } from "react";
import { Favicon } from "#/components/ui/Favicon";
import { hostnameOf } from "#/lib/url";
import { useHomeContext } from "../../context";
import { Hint, randomInt, type WidgetProps } from "../kit";
import { useLibraryLinks } from "../links";

export default function RandomLink(_: WidgetProps<object>) {
	const links = useLibraryLinks();
	const { openLink } = useHomeContext();
	const [seed, setSeed] = useState(() => Math.floor(Date.now() / 3_600_000));
	if (!links.length) return <Hint>Save some links first</Hint>;
	const { link, board } = links[seed % links.length];
	return (
		<div className="space-y-2">
			<button
				type="button"
				onClick={() => openLink(link)}
				className="focus-ring flex w-full items-center gap-3 rounded-xl border border-line p-2.5 text-left transition hover:border-accent"
			>
				<Favicon
					url={link.url}
					icon={link.icon}
					favicon={link.meta.favicon}
					title={link.title}
					color={link.color}
					className="size-10 shrink-0 rounded-lg"
				/>
				<span className="min-w-0">
					<span className="block truncate font-medium">{link.title}</span>
					<span className="block truncate text-xs text-muted">
						{hostnameOf(link.url)} · {board}
					</span>
				</span>
			</button>
			{link.meta.image && (
				<img
					src={link.meta.image}
					alt=""
					loading="lazy"
					className="max-h-32 w-full rounded-xl object-cover"
				/>
			)}
			<button
				type="button"
				className="btn-ghost w-full text-xs"
				onClick={() => setSeed(randomInt(1_000_000))}
			>
				<Shuffle className="size-3.5" /> Another one
			</button>
		</div>
	);
}

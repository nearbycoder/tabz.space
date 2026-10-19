import { cn } from "#/lib/cn";

export function Logo({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-2 font-semibold tracking-tight",
				className,
			)}
		>
			<svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
				<rect width="32" height="32" rx="9" fill="var(--accent)" />
				<rect x="7" y="7" width="8" height="8" rx="2.5" fill="white" />
				<rect
					x="17"
					y="7"
					width="8"
					height="8"
					rx="2.5"
					fill="white"
					opacity=".7"
				/>
				<rect
					x="7"
					y="17"
					width="8"
					height="8"
					rx="2.5"
					fill="white"
					opacity=".7"
				/>
				<rect
					x="17"
					y="17"
					width="8"
					height="8"
					rx="2.5"
					fill="white"
					opacity=".45"
				/>
			</svg>
			<span>tabz</span>
		</span>
	);
}

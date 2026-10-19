import type { ReactNode } from "react";
import { cn } from "#/lib/cn";

export function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<div className="block space-y-1.5">
			<span className="text-xs font-medium text-muted">{label}</span>
			{children}
			{hint && <span className="block text-xs text-muted">{hint}</span>}
		</div>
	);
}

export function Segmented<T extends string | number>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: { value: T; label: ReactNode; title?: string }[];
	onChange: (value: T) => void;
}) {
	return (
		<div className="flex rounded-xl border border-line bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] p-1">
			{options.map((option) => (
				<button
					key={String(option.value)}
					type="button"
					title={option.title}
					onClick={() => onChange(option.value)}
					className={cn(
						"focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition",
						option.value === value
							? "bg-surface-2 text-ink shadow-sm"
							: "text-muted hover:text-ink",
					)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

export function Toggle({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex cursor-pointer items-center justify-between gap-4 py-1.5 text-sm">
			{label}
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				onClick={() => onChange(!checked)}
				className={cn(
					"focus-ring relative h-6 w-10 shrink-0 rounded-full transition",
					checked
						? "bg-accent"
						: "bg-[color-mix(in_srgb,var(--ink)_15%,transparent)]",
				)}
			>
				<span
					className={cn(
						"absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition",
						checked && "translate-x-4",
					)}
				/>
			</button>
		</label>
	);
}

export function ColorSwatches({
	value,
	colors,
	onChange,
	allowNone,
}: {
	value: string | null;
	colors: readonly string[];
	onChange: (color: string | null) => void;
	allowNone?: boolean;
}) {
	return (
		<div className="flex flex-wrap gap-2">
			{allowNone && (
				<button
					type="button"
					onClick={() => onChange(null)}
					aria-label="No color"
					className={cn(
						"focus-ring size-7 rounded-full border-2 border-dashed border-line",
						value === null &&
							"ring-2 ring-ink/40 ring-offset-2 ring-offset-surface-2",
					)}
				/>
			)}
			{colors.map((color) => (
				<button
					key={color}
					type="button"
					onClick={() => onChange(color)}
					aria-label={`Color ${color}`}
					className={cn(
						"focus-ring size-7 rounded-full transition hover:scale-110",
						value?.toLowerCase() === color &&
							"ring-2 ring-ink/40 ring-offset-2 ring-offset-surface-2",
					)}
					style={{ background: color }}
				/>
			))}
		</div>
	);
}

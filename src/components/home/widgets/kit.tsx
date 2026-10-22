import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { call, run } from "#/lib/api";
import { cn } from "#/lib/cn";
import { widgetKey } from "#/lib/widget-key";
import { getJsonData } from "#/server/home";
import type { HomeGroup } from "../types";

/* Shared building blocks for the catalog widgets (loaded with the first one). */

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

export type WidgetProps<D> = {
	group: HomeGroup;
	data: D;
	/** Updates the widget right away; saves to the server after a short pause. */
	save: (data: D, options?: { now?: boolean }) => void;
	/** Viewing someone else's board without edit rights. */
	readOnly: boolean;
};

/** The current time, ticking every `interval` ms. Null until mounted (no SSR mismatch). */
export function useNow(interval = 1000) {
	const [now, setNow] = useState<Date | null>(null);
	useEffect(() => {
		setNow(new Date());
		const id = setInterval(() => setNow(new Date()), interval);
		return () => clearInterval(id);
	}, [interval]);
	return now;
}

/** A public JSON API, fetched through the tabz server (no CORS, cached). */
export function useJson<T>(
	url: string | null,
	options: {
		pick?: string[];
		/** Server cache, seconds. */
		ttl?: number;
		/** Refetch in the background every N minutes. */
		refresh?: number;
	} = {},
) {
	const input = { url: url as string, pick: options.pick, ttl: options.ttl };
	return useQuery({
		queryKey: widgetKey("json", input),
		// Cached as the server returns it, so the server's copy (widget-memory)
		// can be put in place on the next page load.
		queryFn: () => run(call(getJsonData, input)),
		select: (result) => result.value as T,
		// "Another one", a new date or new settings: keep showing the current
		// answer until the next one is in, instead of a spinner.
		placeholderData: keepPreviousData,
		enabled: Boolean(url),
		staleTime: (options.refresh ?? 10) * 60_000,
		refetchInterval: options.refresh ? options.refresh * 60_000 : false,
	});
}

/**
 * Loading spinner / error with retry around network-backed content. Data
 * already on screen stays put while a background refresh runs or fails.
 */
export function Status({
	query,
	children,
}: {
	query: {
		isPending: boolean;
		isSuccess: boolean;
		error: Error | null;
		refetch: () => unknown;
	};
	children: ReactNode;
}) {
	if (query.isSuccess) return <>{children}</>;
	if (query.isPending)
		return (
			<div className="flex justify-center py-6 text-muted">
				<Loader2 className="size-5 animate-spin" />
			</div>
		);
	if (query.error)
		return (
			<div className="flex items-center justify-between gap-2 py-3 text-sm text-muted">
				<span>{query.error.message}</span>
				<button
					type="button"
					className="icon-btn size-7"
					aria-label="Retry"
					onClick={() => query.refetch()}
				>
					<RefreshCw className="size-3.5" />
				</button>
			</div>
		);
	return <>{children}</>;
}

/** Muted helper text, e.g. "Add a city in the widget's settings". */
export function Hint({ children }: { children: ReactNode }) {
	return <p className="py-3 text-center text-sm text-muted">{children}</p>;
}

/** A thin progress bar (0–1). */
export function Bar({
	value,
	className,
}: {
	value: number;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,transparent)]",
				className,
			)}
		>
			<div
				className="h-full rounded-full bg-accent transition-[width] duration-500"
				style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
			/>
		</div>
	);
}

/** A small round button, e.g. +/−. */
export function RoundButton({
	children,
	label,
	onClick,
	disabled,
	primary,
}: {
	children: ReactNode;
	label: string;
	onClick: () => void;
	disabled?: boolean;
	primary?: boolean;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"focus-ring grid size-10 shrink-0 place-items-center rounded-full border text-lg transition active:scale-95 disabled:opacity-40",
				primary
					? "border-accent bg-accent text-white"
					: "border-line hover:border-accent",
			)}
		>
			{children}
		</button>
	);
}

/** A row in a list widget: text on the left, details on the right. */
export function Row({
	href,
	children,
	aside,
}: {
	href?: string;
	children: ReactNode;
	aside?: ReactNode;
}) {
	const body = (
		<>
			<span className="min-w-0 flex-1 truncate">{children}</span>
			{aside !== undefined && (
				<span className="shrink-0 text-xs text-muted tabular-nums">
					{aside}
				</span>
			)}
		</>
	);
	const className =
		"flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]";
	return href ? (
		<a href={href} target="_blank" rel="noreferrer" className={className}>
			{body}
		</a>
	) : (
		<div className={className}>{body}</div>
	);
}

export const pad = (value: number) => String(value).padStart(2, "0");

/** Local calendar date as YYYY-MM-DD. */
export const dayKey = (date = new Date()) =>
	`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The last `count` days as keys, oldest first. */
export const lastDays = (count: number, from = new Date()) =>
	Array.from({ length: count }, (_, index) => {
		const date = new Date(from);
		date.setDate(date.getDate() - (count - 1 - index));
		return dayKey(date);
	});

/** 1h 02m 03s style. */
export function formatDuration(ms: number, { tenths = false } = {}) {
	const total = Math.max(0, ms);
	const hours = Math.floor(total / 3_600_000);
	const minutes = Math.floor((total % 3_600_000) / 60_000);
	const seconds = Math.floor((total % 60_000) / 1000);
	const base = `${hours ? `${hours}:${pad(minutes)}` : minutes}:${pad(seconds)}`;
	return tenths ? `${base}.${Math.floor((total % 1000) / 100)}` : base;
}

/** Cryptographically random integer in [0, max). */
export function randomInt(max: number) {
	const values = new Uint32Array(1);
	crypto.getRandomValues(values);
	return values[0] % max;
}

export const randomId = () => crypto.randomUUID().slice(0, 8);

export async function copyText(text: string, what = "Copied") {
	try {
		await navigator.clipboard.writeText(text);
		toast.success(what);
	} catch {
		toast.error("Couldn't copy");
	}
}

let audio: AudioContext | null = null;

/** A short, soft chime (Web Audio, no files). */
export function chime(times = 3) {
	audio ??= new AudioContext();
	const context = audio;
	for (let index = 0; index < times; index++) {
		const start = context.currentTime + index * 0.35;
		const oscillator = context.createOscillator();
		const gain = context.createGain();
		oscillator.frequency.value = 880;
		gain.gain.setValueAtTime(0.0001, start);
		gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
		oscillator.connect(gain).connect(context.destination);
		oscillator.start(start);
		oscillator.stop(start + 0.32);
	}
}

/** Shows a system notification when allowed (asks once, on a user action). */
export function notify(title: string, body?: string) {
	if (typeof Notification === "undefined") return;
	if (Notification.permission === "granted") new Notification(title, { body });
	else if (Notification.permission === "default")
		void Notification.requestPermission();
}

/** "5m", "3h", "2d" since a timestamp. */
export function ago(at: number) {
	const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
	if (minutes < 60) return `${minutes}m`;
	if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
	return `${Math.round(minutes / 1440)}d`;
}

/** A short-lived cache buster for "show me another" buttons. */
export const freshKey = () => Math.random().toString(36).slice(2, 8);

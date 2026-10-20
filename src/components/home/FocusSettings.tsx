import { useState } from "react";
import { Toggle } from "#/components/ui/controls";
import { cn } from "#/lib/cn";
import { DAY_LETTERS, focusActive } from "#/lib/schedule";
import type { FocusSettings as Focus } from "#/lib/schemas";

const DAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

/** "https://www.youtube.com/watch" or "youtube.com" → "youtube.com". */
export const siteHost = (value: string) => {
	const text = value.trim().toLowerCase();
	if (!text) return null;
	try {
		const host = new URL(/^[a-z]+:\/\//.test(text) ? text : `https://${text}`)
			.hostname;
		return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)
			? host.replace(/^www\./, "")
			: null;
	} catch {
		return null;
	}
};

/** Settings → Home → Focus mode. */
export function FocusSettings({
	focus,
	timeZone,
	onChange,
}: {
	focus: Focus;
	timeZone?: string;
	onChange: (focus: Focus) => void;
}) {
	const [site, setSite] = useState("");
	const active = focusActive(focus, Date.now(), timeZone);
	const set = (patch: Partial<Focus>) => onChange({ ...focus, ...patch });
	const addSite = () => {
		const host = siteHost(site);
		if (!host) return;
		if (!focus.sites.includes(host))
			set({ sites: [...focus.sites, host].slice(0, 100) });
		setSite("");
	};

	return (
		<div className="space-y-3">
			<Toggle
				label="🎯 Focus on a schedule"
				checked={focus.enabled}
				onChange={(enabled) => set({ enabled })}
			/>
			{focus.enabled && (
				<div className="space-y-2">
					<div className="flex gap-1">
						{DAY_LETTERS.map((letter, day) => {
							const on = focus.days.includes(day);
							return (
								<button
									// biome-ignore lint/suspicious/noArrayIndexKey: weekday index is the identity
									key={day}
									type="button"
									aria-pressed={on}
									aria-label={DAY_NAMES[day]}
									onClick={() =>
										set({
											days: on
												? focus.days.filter((d) => d !== day)
												: [...focus.days, day].sort(),
										})
									}
									className={cn(
										"focus-ring grid size-8 place-items-center rounded-full text-xs font-medium transition",
										on
											? "bg-accent text-white"
											: "bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] text-muted hover:text-ink",
									)}
								>
									{letter}
								</button>
							);
						})}
					</div>
					<div className="flex items-center gap-2 text-sm">
						<input
							type="time"
							className="field w-auto"
							value={focus.from}
							onChange={(event) =>
								event.target.value && set({ from: event.target.value })
							}
							aria-label="Focus from"
						/>
						<span className="text-muted">to</span>
						<input
							type="time"
							className="field w-auto"
							value={focus.to}
							onChange={(event) =>
								event.target.value && set({ to: event.target.value })
							}
							aria-label="Focus until"
						/>
					</div>
				</div>
			)}
			<div className="flex flex-wrap items-center gap-2 text-xs">
				{active ? (
					<>
						<span className="text-accent">● Focusing now</span>
						{focus.until && focus.until > Date.now() && (
							<button
								type="button"
								className="btn-outline px-2.5 py-1 text-xs"
								onClick={() => set({ until: null })}
							>
								End session
							</button>
						)}
					</>
				) : (
					<>
						<span className="text-muted">Focus now for</span>
						{[25, 50, 120].map((minutes) => (
							<button
								key={minutes}
								type="button"
								className="btn-outline px-2.5 py-1 text-xs"
								onClick={() => set({ until: Date.now() + minutes * 60_000 })}
							>
								{minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}
							</button>
						))}
					</>
				)}
			</div>
			<div className="space-y-1.5">
				<p className="text-xs font-medium">Sites to block while focusing</p>
				<form
					className="flex gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						addSite();
					}}
				>
					<input
						className="field"
						value={site}
						onChange={(event) => setSite(event.target.value)}
						placeholder="youtube.com"
						aria-label="Site to block"
						inputMode="url"
						autoCapitalize="none"
						spellCheck={false}
					/>
					<button
						type="submit"
						className="btn-outline shrink-0"
						disabled={!siteHost(site)}
					>
						Block
					</button>
				</form>
				{focus.sites.length > 0 && (
					<ul className="flex flex-wrap gap-1.5">
						{focus.sites.map((host) => (
							<li key={host}>
								<button
									type="button"
									className="rounded-full border border-line px-2.5 py-0.5 text-xs hover:border-red-400 hover:text-red-500"
									title={`Stop blocking ${host}`}
									onClick={() =>
										set({ sites: focus.sites.filter((s) => s !== host) })
									}
								>
									{host} ×
								</button>
							</li>
						))}
					</ul>
				)}
				<p className="text-xs text-muted">
					Mark groups as “Distracting” in their edit dialog to hide them while
					you focus. The browser extension blocks these sites (and their
					subdomains), with a “5 more minutes” way out.
				</p>
			</div>
		</div>
	);
}

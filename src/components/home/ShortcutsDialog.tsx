import { Modal } from "#/components/ui/Modal";

const isMac = () =>
	typeof navigator !== "undefined" &&
	/Mac|iPhone|iPad/.test(navigator.platform);

function Keys({ keys }: { keys: string[] }) {
	return (
		<span className="flex shrink-0 gap-1">
			{keys.map((key) => (
				<kbd
					key={key}
					className="min-w-6 rounded-md border border-line bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-1.5 py-0.5 text-center font-mono text-xs"
				>
					{key}
				</kbd>
			))}
		</span>
	);
}

/** Every keyboard shortcut on the home page (opened with "?"). */
export function ShortcutsDialog({
	showVault,
	onClose,
}: {
	/** False once a vault exists and is locked: don't hint that it's there. */
	showVault: boolean;
	onClose: () => void;
}) {
	const mod = isMac() ? "⌘" : "Ctrl";
	const sections: { title: string; rows: [string, string[]][] }[] = [
		{
			title: "Anywhere",
			rows: [
				["Jump to a link, folder, board or action", [mod, "K"]],
				["Search the web or your links", ["/"]],
				["Add a link", ["N"]],
				["Edit layout", ["E"]],
				["Undo the last change", [mod, "Z"]],
				["Paste links to add them all", [mod, "V"]],
				["Show these shortcuts", ["?"]],
			],
		},
		{
			title: "Tiles",
			rows: [
				["Open tile 1–9 on this board", ["1", "…", "9"]],
				["Move between tiles", ["←", "↑", "↓", "→"]],
				["Open the focused tile", ["↵"]],
				["Edit the focused tile", ["E"]],
			],
		},
		{
			title: "Boards",
			rows: [
				["Go to board 1–9", ["G", "1…9"]],
				["Go to a board by its first letter", ["G", "A…Z"]],
				["Previous / next board", ["[", "]"]],
				["Next profile (once you have two)", ["P"]],
			],
		},
		{
			title: "In the ⌘K palette and search",
			rows: [
				["Open the highlighted item", ["↵"]],
				["Open it in a new tab", [mod, "↵"]],
				["Close", ["Esc"]],
			],
		},
	];
	return (
		<Modal open onClose={onClose} title="Keyboard shortcuts">
			<div className="space-y-5">
				{sections.map((section) => (
					<section key={section.title}>
						<h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
							{section.title}
						</h3>
						<ul className="space-y-1.5">
							{section.rows.map(([label, keys]) => (
								<li
									key={label}
									className="flex items-center justify-between gap-4 text-sm"
								>
									<span>{label}</span>
									<Keys keys={keys} />
								</li>
							))}
						</ul>
					</section>
				))}
				{showVault && (
					<p className="text-xs text-muted">
						Typing your vault's secret code (or tapping the clock 5 times) opens
						the vault.
					</p>
				)}
			</div>
		</Modal>
	);
}

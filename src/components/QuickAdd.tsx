import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { BookmarkForm } from "#/components/home/BookmarkDialog";
import { applyAppearance } from "#/lib/appearance";
import { useHome } from "#/lib/home-query";
import { applyTheme } from "#/lib/theme";
import { isLinksGroup } from "./home/types";
import { Logo } from "./Logo";

/** Compact add-bookmark page used by the extension popup and bookmarklet. */
export function QuickAdd({
	url,
	title,
	popup,
}: {
	url: string;
	title: string;
	popup: boolean;
}) {
	const { boards, settings } = useHome();
	const board =
		boards.find((b) => b.id === settings.activeBoardId) ?? boards[0];
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		applyTheme(settings.theme);
		applyAppearance(settings);
	}, [settings]);

	const close = () => {
		if (popup) window.close();
		else window.location.assign("/");
	};

	useEffect(() => {
		if (!saved) return;
		const timer = setTimeout(close, 900);
		return () => clearTimeout(timer);
	});

	const groupId =
		board?.groups.find(isLinksGroup)?.id ??
		boards.flatMap((b) => b.groups).find(isLinksGroup)?.id;

	return (
		<main className="mx-auto max-w-md px-5 py-6">
			<div className="mb-5 flex items-center justify-between">
				<Logo />
				<span className="text-xs text-muted">Add to your space</span>
			</div>
			{saved ? (
				<div className="animate-pop flex flex-col items-center gap-3 py-16 text-center">
					<CheckCircle2 className="size-10 text-accent" />
					<p className="font-medium">Saved to tabz</p>
				</div>
			) : groupId ? (
				<BookmarkForm
					festive={settings.celebrate}
					boards={boards}
					groupId={groupId}
					initialUrl={url}
					initialTitle={title}
					onClose={close}
					onSaved={() => setSaved(true)}
				/>
			) : (
				<p className="text-sm text-muted">
					Create a group on your home page first.
				</p>
			)}
		</main>
	);
}

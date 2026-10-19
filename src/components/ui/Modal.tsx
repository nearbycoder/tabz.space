import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "#/lib/cn";
import { useKeyboardInset } from "#/lib/use-keyboard-inset";

type Props = {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
	side?: boolean;
	className?: string;
};

/**
 * Dialog that's a centered card (or side panel) on desktop and a bottom sheet
 * on phones, lifted above the on-screen keyboard.
 */
export function Modal({
	open,
	onClose,
	title,
	children,
	side,
	className,
}: Props) {
	const keyboard = useKeyboardInset(open);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		// Stop the page behind from scrolling while the sheet is open.
		const overflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", onKey);
			document.body.style.overflow = overflow;
		};
	}, [open, onClose]);

	if (!open || typeof document === "undefined") return null;

	return createPortal(
		<div
			className={cn(
				"fixed inset-0 z-50 flex items-end justify-center sm:p-4",
				side
					? "sm:items-stretch sm:justify-end sm:p-0"
					: "sm:items-start sm:pt-[12vh]",
			)}
			style={{ paddingBottom: keyboard }}
		>
			<button
				type="button"
				aria-label="Close"
				className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
				onClick={onClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className={cn(
					"animate-sheet relative flex w-full flex-col overflow-hidden rounded-t-[1.75rem] border border-line bg-surface-2 shadow-2xl backdrop-blur-xl sm:animate-pop",
					side
						? "max-h-[92dvh] sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none"
						: "max-h-[88dvh] sm:max-h-[80vh] sm:max-w-md sm:rounded-3xl",
					className,
				)}
				style={{
					maxHeight: keyboard
						? `calc(100dvh - ${keyboard}px - 1rem)`
						: undefined,
				}}
			>
				<div
					aria-hidden
					className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--ink)_18%,transparent)] sm:hidden"
				/>
				<div className="flex items-center justify-between px-6 pt-3 pb-2 sm:pt-5">
					<h2 className="text-base font-semibold">{title}</h2>
					<button
						type="button"
						className="icon-btn -mr-2"
						onClick={onClose}
						aria-label="Close"
					>
						<X className="size-4" />
					</button>
				</div>
				<div className="overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
					{children}
				</div>
			</div>
		</div>,
		document.body,
	);
}

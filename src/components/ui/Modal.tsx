import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "#/lib/cn";

type Props = {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
	side?: boolean;
	className?: string;
};

export function Modal({
	open,
	onClose,
	title,
	children,
	side,
	className,
}: Props) {
	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open || typeof document === "undefined") return null;

	return createPortal(
		<div
			className={cn(
				"fixed inset-0 z-50 flex",
				side ? "justify-end" : "items-start justify-center p-4 pt-[12vh]",
			)}
		>
			<button
				type="button"
				aria-label="Close"
				className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
				onClick={onClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className={cn(
					"animate-pop relative flex flex-col border border-line bg-surface-2 shadow-2xl backdrop-blur-xl",
					side
						? "h-full w-full max-w-md"
						: "max-h-[80vh] w-full max-w-md rounded-3xl",
					className,
				)}
			>
				<div className="flex items-center justify-between px-6 pt-5 pb-2">
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
				<div className="overflow-y-auto px-6 pb-6">{children}</div>
			</div>
		</div>,
		document.body,
	);
}

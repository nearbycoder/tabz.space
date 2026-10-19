import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { Home, RotateCcw } from "lucide-react";
import { Logo } from "./Logo";

/** Full-page message used for 404s and unexpected errors. */
function StatusPage({
	emoji,
	title,
	body,
	retry,
}: {
	emoji: string;
	title: string;
	body: string;
	retry?: () => void;
}) {
	return (
		<main className="grid min-h-dvh place-items-center px-6 py-12 text-center">
			<div className="w-full max-w-sm">
				<a
					href="/"
					className="mx-auto mb-10 inline-flex"
					aria-label="tabz home"
				>
					<Logo className="text-base" />
				</a>
				<p className="text-5xl">{emoji}</p>
				<h1 className="mt-4 text-xl font-semibold">{title}</h1>
				<p className="mt-2 text-sm text-muted">{body}</p>
				<div className="mt-6 flex justify-center gap-2">
					{retry && (
						<button type="button" className="btn-outline" onClick={retry}>
							<RotateCcw className="size-4" /> Try again
						</button>
					)}
					<a href="/" className="btn-primary">
						<Home className="size-4" /> Go home
					</a>
				</div>
			</div>
		</main>
	);
}

export function NotFoundPage() {
	return (
		<StatusPage
			emoji="🧭"
			title="This page doesn't exist"
			body="The link may be old or mistyped. Your tabz is just a click away."
		/>
	);
}

export function ErrorPage({ error }: ErrorComponentProps) {
	const router = useRouter();
	const message = error instanceof Error ? error.message : "";
	const offline = typeof navigator !== "undefined" && !navigator.onLine;
	return (
		<StatusPage
			emoji={offline ? "📡" : "🫠"}
			title={offline ? "You're offline" : "Something went wrong"}
			body={
				offline
					? "Reconnect and try again."
					: message && message.length < 160
						? message
						: "An unexpected error happened. Trying again usually fixes it."
			}
			retry={() => router.invalidate()}
		/>
	);
}

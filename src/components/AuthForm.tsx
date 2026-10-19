import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { authClient } from "#/lib/auth-client";
import { Logo } from "./Logo";

type Props = {
	mode: "sign-in" | "sign-up";
	providers: { github: boolean };
	redirectTo?: string;
};

const safeRedirect = (to?: string) =>
	to?.startsWith("/") && !to.startsWith("//") ? to : "/";

export function AuthForm({ mode, providers, redirectTo }: Props) {
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const destination = safeRedirect(redirectTo);
	const isSignUp = mode === "sign-up";

	const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const value = (key: string) => String(form.get(key) ?? "").trim();
		setPending(true);
		setError(null);
		const identifier = value("identifier");
		const password = String(form.get("password") ?? "");
		const result = isSignUp
			? await authClient.signUp.email({
					name: value("name") || value("username"),
					username: value("username"),
					email: value("email"),
					password,
				})
			: identifier.includes("@")
				? await authClient.signIn.email({ email: identifier, password })
				: await authClient.signIn.username({ username: identifier, password });
		if (result.error) {
			setError(result.error.message ?? "Something went wrong");
			setPending(false);
			return;
		}
		window.location.assign(destination);
	};

	const github = () =>
		authClient.signIn.social({ provider: "github", callbackURL: destination });

	return (
		<main className="relative grid min-h-dvh place-items-center px-4 py-12">
			<div
				aria-hidden
				className="pointer-events-none fixed inset-0"
				style={{
					background:
						"radial-gradient(at 20% 10%, #6366f144 0, transparent 50%), radial-gradient(at 80% 0%, #ec489933 0, transparent 50%)",
				}}
			/>
			<div className="glass animate-pop relative w-full max-w-sm rounded-3xl p-7 shadow-xl shadow-black/5">
				<Link to="/" className="mb-6 inline-block text-lg">
					<Logo />
				</Link>
				<h1 className="text-xl font-semibold">
					{isSignUp ? "Create your space" : "Welcome back"}
				</h1>
				<p className="mt-1 text-sm text-muted">
					{isSignUp
						? "Free, forever. Takes ten seconds."
						: "Sign in with your username or email."}
				</p>

				{providers.github && (
					<>
						<button
							type="button"
							onClick={github}
							className="btn-outline mt-6 w-full"
						>
							<GitHubMark /> Continue with GitHub
						</button>
						<div className="my-5 flex items-center gap-3 text-xs text-muted">
							<span className="h-px flex-1 bg-line" /> or{" "}
							<span className="h-px flex-1 bg-line" />
						</div>
					</>
				)}

				<form
					onSubmit={onSubmit}
					className={providers.github ? "space-y-3" : "mt-6 space-y-3"}
				>
					{isSignUp ? (
						<>
							<input
								className="field"
								name="name"
								placeholder="Your name"
								autoComplete="name"
							/>
							<input
								className="field"
								name="username"
								placeholder="Username"
								required
								minLength={3}
								maxLength={30}
								pattern="[a-zA-Z0-9_.]+"
								title="Letters, numbers, underscores and dots"
								autoComplete="username"
							/>
							<input
								className="field"
								name="email"
								type="email"
								placeholder="Email"
								required
								autoComplete="email"
							/>
						</>
					) : (
						<input
							className="field"
							name="identifier"
							placeholder="Username or email"
							required
							autoComplete="username"
							autoFocus
						/>
					)}
					<input
						className="field"
						name="password"
						type="password"
						placeholder="Password"
						required
						minLength={8}
						autoComplete={isSignUp ? "new-password" : "current-password"}
					/>
					{error && <p className="text-sm text-red-500">{error}</p>}
					<button
						type="submit"
						className="btn-primary w-full"
						disabled={pending}
					>
						{pending && <Loader2 className="size-4 animate-spin" />}
						{isSignUp ? "Create account" : "Sign in"}
					</button>
				</form>

				<p className="mt-6 text-center text-sm text-muted">
					{isSignUp ? "Already have an account? " : "New to tabz? "}
					<Link
						to={isSignUp ? "/sign-in" : "/sign-up"}
						search={{ redirect: redirectTo }}
						className="font-medium text-accent hover:underline"
					>
						{isSignUp ? "Sign in" : "Create one"}
					</Link>
				</p>
			</div>
		</main>
	);
}

function GitHubMark() {
	return (
		<svg
			viewBox="0 0 24 24"
			className="size-4"
			fill="currentColor"
			aria-hidden="true"
		>
			<path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
		</svg>
	);
}

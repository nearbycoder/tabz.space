import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { splashLinks } from "#/lib/splash";
import { readThemePreference, themeInitScript } from "#/lib/theme";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
	{
		// Known before rendering, so <html> starts with the right theme.
		beforeLoad: () => ({ theme: readThemePreference() }),
		head: () => ({
			meta: [
				{ charSet: "utf-8" },
				{
					name: "viewport",
					content: "width=device-width, initial-scale=1, viewport-fit=cover",
				},
				{ name: "apple-mobile-web-app-capable", content: "yes" },
				{ name: "mobile-web-app-capable", content: "yes" },
				{
					name: "apple-mobile-web-app-status-bar-style",
					content: "black-translucent",
				},
				{ name: "apple-mobile-web-app-title", content: "Tabz" },
				{ title: "Tabz — your home on the web" },
				{
					name: "description",
					content:
						"A fast, customizable start page for your browser. Organize bookmarks into boards and grids, search anywhere, and add pages with one click.",
				},
				{
					name: "theme-color",
					content: "#f6f6f4",
					media: "(prefers-color-scheme: light)",
				},
				{
					name: "theme-color",
					content: "#0b0c10",
					media: "(prefers-color-scheme: dark)",
				},
			],
			links: [
				{ rel: "stylesheet", href: appCss },
				{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
				{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
				{ rel: "manifest", href: "/site.webmanifest" },
				{ rel: "preconnect", href: "https://fonts.googleapis.com" },
				{
					rel: "preconnect",
					href: "https://fonts.gstatic.com",
					crossOrigin: "anonymous",
				},
				...splashLinks,
			],
		}),
		shellComponent: RootDocument,
		component: () => <Outlet />,
	},
);

function RootDocument({ children }: { children: ReactNode }) {
	const { theme } = Route.useRouteContext();
	return (
		<html
			lang="en"
			className={theme === "dark" ? "dark" : undefined}
			suppressHydrationWarning
		>
			<head>
				{/*
				 * The theme is applied from the cookie on the server (class + color
				 * scheme), so the very first paint, even the blank moment before
				 * CSS loads or a home-screen launch, is already the right color.
				 * The script covers older visits that only have localStorage.
				 */}
				<meta
					name="color-scheme"
					content={theme === "system" ? "light dark" : theme}
				/>
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: static, first-party theme bootstrap
					dangerouslySetInnerHTML={{ __html: themeInitScript }}
				/>
				<HeadContent />
			</head>
			<body className="min-h-dvh">
				{children}
				<Toaster
					position="bottom-center"
					richColors
					closeButton
					mobileOffset={{
						bottom: "calc(5.5rem + env(safe-area-inset-bottom))",
					}}
				/>
				<Scripts />
			</body>
		</html>
	);
}

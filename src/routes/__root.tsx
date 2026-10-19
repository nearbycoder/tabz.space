import geistLatin from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { Toaster } from "sonner";
import { startOffline } from "#/lib/offline";
import { socialMeta } from "#/lib/site";
import { splashLinks } from "#/lib/splash";
import { readThemePreference, themeInitScript } from "#/lib/theme";
import appCss from "../styles.css?url";

const SITE_TITLE = "Tabz — your home on the web";
const SITE_DESCRIPTION =
	"A beautiful, instant start page for your browser: bookmarks, boards and 70+ widgets, ⌘K search, a private vault, and new tabs that open even offline.";

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
				{ title: SITE_TITLE },
				{ name: "description", content: SITE_DESCRIPTION },
				...socialMeta({ title: SITE_TITLE, description: SITE_DESCRIPTION }),
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
				// The default font is self-hosted; fetch its Latin subset right away.
				{
					rel: "preload",
					href: geistLatin,
					as: "font",
					type: "font/woff2",
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
	useEffect(() => startOffline(), []);
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

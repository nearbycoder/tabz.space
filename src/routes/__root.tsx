import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { themeInitScript } from "#/lib/theme";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
	{
		head: () => ({
			meta: [
				{ charSet: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
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
				{ rel: "preconnect", href: "https://fonts.googleapis.com" },
				{
					rel: "preconnect",
					href: "https://fonts.gstatic.com",
					crossOrigin: "anonymous",
				},
				{
					rel: "stylesheet",
					href: "https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap",
				},
			],
			scripts: [{ children: themeInitScript }],
		}),
		shellComponent: RootDocument,
		component: () => <Outlet />,
	},
);

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="min-h-dvh">
				{children}
				<Toaster position="bottom-center" richColors closeButton />
				<Scripts />
			</body>
		</html>
	);
}

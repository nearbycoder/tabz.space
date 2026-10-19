import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	server: {
		port: 3000,
	},
	plugins: [
		nitro({
			// One server bundle: Rolldown's lib-chunk splitting produced a circular
			// import ("__commonJSMin is not a function") at boot.
			inlineDynamicImports: true,
			// Serve .br/.gz versions of JS, CSS and other static files.
			compressPublicAssets: { gzip: true, brotli: true },
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

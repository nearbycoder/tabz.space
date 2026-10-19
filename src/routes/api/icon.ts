import { createFileRoute } from "@tanstack/react-router";
import { iconScope } from "#/lib/url";
import { allowLookup, siteIcon } from "#/server/favicons";

/**
 * GET /api/icon?url=<site>[&hint=<icon url seen when saving>]
 * <site> is normalized to its icon scope: the origin, or origin + first path
 * segment on hosts like *.github.io (see iconScope).
 * A site's icon, found and served by tabz (see src/server/favicons.ts).
 */
export const Route = createFileRoute("/api/icon")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const params = new URL(request.url).searchParams;
				const scope = iconScope(params.get("url") ?? "");
				if (!scope) return new Response("Bad url", { status: 400 });
				const origin = new URL(scope);
				const client =
					request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
					"local";
				if (!allowLookup(client, origin))
					return new Response("Slow down", {
						status: 429,
						headers: { "retry-after": "60" },
					});
				const hint = params.get("hint")?.slice(0, 2048) || undefined;
				const { icon } = await siteIcon(origin, hint);
				if (!icon)
					return new Response(null, {
						status: 404,
						// Don't keep asking for a site that has no icon.
						headers: { "cache-control": "public, max-age=43200" },
					});
				return new Response(icon.body.slice().buffer as ArrayBuffer, {
					headers: {
						"content-type": icon.type,
						"cache-control":
							"public, max-age=604800, stale-while-revalidate=2592000",
						"x-content-type-options": "nosniff",
						// An SVG opened directly must not run scripts on our origin.
						"content-security-policy":
							"default-src 'none'; style-src 'unsafe-inline'; sandbox",
					},
				});
			},
		},
	},
});

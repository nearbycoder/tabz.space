/** Public origin, for links that must be absolute (Open Graph, share cards). */
export const SITE_URL = "https://tabz.space";

/** Social card shown when tabz links are shared (1200×630, public/og.png). */
export const OG_IMAGE = {
	url: `${SITE_URL}/og.png`,
	width: "1200",
	height: "630",
	alt: "tabz: your home on the web. A start page with bookmarks, boards and widgets.",
};

/** Open Graph + Twitter tags for a page; pages override title/description. */
export function socialMeta({
	title,
	description,
	path = "/",
}: {
	title: string;
	description: string;
	path?: string;
}) {
	return [
		{ property: "og:site_name", content: "tabz" },
		{ property: "og:type", content: "website" },
		{ property: "og:url", content: `${SITE_URL}${path}` },
		{ property: "og:title", content: title },
		{ property: "og:description", content: description },
		{ property: "og:image", content: OG_IMAGE.url },
		{ property: "og:image:width", content: OG_IMAGE.width },
		{ property: "og:image:height", content: OG_IMAGE.height },
		{ property: "og:image:alt", content: OG_IMAGE.alt },
		{ name: "twitter:card", content: "summary_large_image" },
		{ name: "twitter:title", content: title },
		{ name: "twitter:description", content: description },
		{ name: "twitter:image", content: OG_IMAGE.url },
		{ name: "twitter:image:alt", content: OG_IMAGE.alt },
	];
}

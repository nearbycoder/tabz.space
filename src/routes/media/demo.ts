import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createFileRoute } from "@tanstack/react-router";

/*
 * The landing page's demo video, with byte-range support. Safari (macOS and
 * iOS) only plays video from servers that answer Range requests with 206,
 * which the static file server doesn't do.
 */

const CANDIDATES = [
	join(process.cwd(), ".output/public/landing/demo.mp4"),
	join(process.cwd(), "public/landing/demo.mp4"),
];

async function locate() {
	for (const path of CANDIDATES) {
		const info = await stat(path).catch(() => null);
		if (info?.isFile()) return { path, size: info.size };
	}
	return null;
}

const stream = (path: string, start: number, end: number) =>
	Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;

export const Route = createFileRoute("/media/demo")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const file = await locate();
				if (!file) return new Response("Not found", { status: 404 });
				const headers = {
					"content-type": "video/mp4",
					"accept-ranges": "bytes",
					"cache-control": "public, max-age=86400",
				};
				const range = request.headers
					.get("range")
					?.match(/^bytes=(\d*)-(\d*)$/);
				if (!range)
					return new Response(stream(file.path, 0, file.size - 1), {
						headers: { ...headers, "content-length": String(file.size) },
					});
				// "bytes=-500" means the last 500 bytes.
				let start = range[1] ? Number(range[1]) : file.size - Number(range[2]);
				let end = range[1] && range[2] ? Number(range[2]) : file.size - 1;
				start = Math.max(0, start);
				end = Math.min(end, file.size - 1);
				if (start > end || start >= file.size)
					return new Response(null, {
						status: 416,
						headers: { "content-range": `bytes */${file.size}` },
					});
				return new Response(stream(file.path, start, end), {
					status: 206,
					headers: {
						...headers,
						"content-length": String(end - start + 1),
						"content-range": `bytes ${start}-${end}/${file.size}`,
					},
				});
			},
		},
	},
});

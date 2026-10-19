// Packages extension/ into downloadable zips for Chrome (MV3 service worker)
// and Firefox (MV3 event page). Output: public/downloads/*.zip
import {
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { zipSync } from "fflate";

const root = new URL("../extension/", import.meta.url).pathname;
const out = new URL("../public/downloads/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const files = {};
const walk = (dir) => {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path);
		else if (!name.endsWith(".md"))
			files[relative(root, path)] = new Uint8Array(readFileSync(path));
	}
};
walk(root);

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const encode = (value) =>
	new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

const firefox = {
	...manifest,
	background: { scripts: ["background.js"], type: "module" },
	browser_specific_settings: {
		gecko: { id: "extension@tabz.space", strict_min_version: "128.0" },
	},
};

writeFileSync(
	join(out, "tabz-chrome.zip"),
	zipSync({ ...files, "manifest.json": encode(manifest) }, { level: 9 }),
);
writeFileSync(
	join(out, "tabz-firefox.zip"),
	zipSync({ ...files, "manifest.json": encode(firefox) }, { level: 9 }),
);
console.log(
	`extension ${manifest.version} → public/downloads/tabz-{chrome,firefox}.zip`,
);

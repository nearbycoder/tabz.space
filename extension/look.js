// Runs before the new tab page paints: show tabz's own background (saved by
// newtab.js from what the tabz page shared) instead of a blank page.
(() => {
	try {
		const look = JSON.parse(localStorage.getItem("tabz-look") || "null");
		if (!look) return;
		const root = document.documentElement.style;
		root.background = look.canvas;
		const layers = [];
		if (look.image) {
			if (look.dim)
				layers.push(
					`linear-gradient(color-mix(in srgb, ${look.canvas} ${look.dim}%, transparent), color-mix(in srgb, ${look.canvas} ${look.dim}%, transparent))`,
				);
			layers.push(`url("${look.image}")`);
		} else if (look.gradient) layers.push(look.gradient);
		if (layers.length) {
			root.backgroundImage = layers.join(", ");
			root.backgroundSize = "cover";
			root.backgroundPosition = "center";
			root.minHeight = "100%";
		}
	} catch {
		// No saved look yet; the plain background is fine.
	}
})();

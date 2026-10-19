import { Hint, type WidgetProps } from "../kit";

type Data = { place: string; lat: number; lon: number; zoom: number };

export default function MapWidget({ data }: WidgetProps<Data>) {
	if (!data.place) return <Hint>Pick a place in the widget's settings</Hint>;
	const zoom = Math.min(18, Math.max(2, data.zoom || 12));
	// Approximate the visible box for the zoom level.
	const span = 360 / 2 ** zoom;
	const bbox = [
		data.lon - span,
		data.lat - span / 2,
		data.lon + span,
		data.lat + span / 2,
	]
		.map((value) => value.toFixed(5))
		.join(",");
	return (
		<div className="space-y-1">
			<iframe
				title={`Map of ${data.place}`}
				loading="lazy"
				src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${data.lat},${data.lon}`}
				className="aspect-[4/3] w-full rounded-xl border-0"
			/>
			<a
				href={`https://www.openstreetmap.org/?mlat=${data.lat}&mlon=${data.lon}#map=${zoom}/${data.lat}/${data.lon}`}
				target="_blank"
				rel="noreferrer"
				className="block text-right text-xs text-muted hover:text-ink"
			>
				{data.place} · open full map
			</a>
		</div>
	);
}

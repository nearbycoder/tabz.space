import {
	Hint,
	type JsonValue,
	Row,
	Status,
	useJson,
	type WidgetProps,
} from "../kit";

type Data = {
	url: string;
	path: string;
	mode: "value" | "list";
	template: string;
	title: string;
	link: string;
	aside: string;
	count: number;
	refresh: number;
};

/** Reads "a.b.0.c" from a JSON value. */
export function readPath(
	value: JsonValue | undefined,
	path: string,
): JsonValue | undefined {
	return path
		.split(".")
		.filter(Boolean)
		.reduce<JsonValue | undefined>(
			(current, key) =>
				current !== null && typeof current === "object"
					? (current as Record<string, JsonValue>)[key]
					: undefined,
			value,
		);
}

const show = (value: JsonValue | undefined) =>
	value === undefined || value === null
		? ""
		: typeof value === "number"
			? value.toLocaleString(undefined, { maximumFractionDigits: 6 })
			: typeof value === "object"
				? JSON.stringify(value)
				: String(value);

/** Replaces {{path}} with values from `scope`. Output is plain text, never HTML. */
export const fill = (template: string, scope: JsonValue) =>
	template.replace(/\{\{\s*([\w.$-]*)\s*\}\}/g, (_, path: string) =>
		show(path ? readPath(scope, path) : scope),
	);

export default function JsonApi({ data }: WidgetProps<Data>) {
	const valid = /^https?:\/\//i.test(data.url);
	const query = useJson<JsonValue>(valid ? data.url : null, {
		ttl: Math.max(60, (data.refresh || 10) * 60),
		refresh: Math.max(1, data.refresh || 10),
	});
	if (!valid) return <Hint>Add an API address in the widget's settings</Hint>;
	const selected = data.path ? readPath(query.data, data.path) : query.data;
	if (data.mode === "list") {
		const items = Array.isArray(selected)
			? selected.slice(0, Math.min(30, Math.max(1, data.count || 8)))
			: [];
		return (
			<Status query={query}>
				{items.length === 0 ? (
					<Hint>No list found at “{data.path || "(root)"}”</Hint>
				) : (
					<div className="space-y-0.5">
						{items.map((item) => {
							const link = data.link ? fill(data.link, item) : "";
							const title = fill(data.title || "{{}}", item);
							return (
								<Row
									key={`${title}|${link}`}
									href={/^https?:\/\//i.test(link) ? link : undefined}
									aside={data.aside ? fill(data.aside, item) : undefined}
								>
									{title}
								</Row>
							);
						})}
					</div>
				)}
			</Status>
		);
	}
	return (
		<Status query={query}>
			<p className="py-2 text-center text-2xl font-semibold break-words">
				{selected === undefined ? (
					<span className="text-sm font-normal text-muted">
						Nothing found at “{data.path}”
					</span>
				) : (
					fill(data.template || "{{value}}", { value: selected })
				)}
			</p>
		</Status>
	);
}

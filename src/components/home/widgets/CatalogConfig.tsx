import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Field, Toggle } from "#/components/ui/controls";
import type { CatalogWidget } from "#/lib/schemas";
import type { JsonValue } from "./kit";
import { type Field as FieldDef, REGISTRY } from "./registry";
import { SandboxFrame } from "./SandboxFrame";
import { CODE_TEMPLATES } from "./templates";
import { allZones, cityOf } from "./time";
import { PlaceSearch } from "./WidgetConfig";

type Data = Record<string, JsonValue>;

function ZonePicker({
	value,
	onAdd,
}: {
	value: string;
	onAdd: (zone: string) => void;
}) {
	const [text, setText] = useState(value);
	const zones = allZones();
	return (
		<>
			<input
				className="field"
				list="tabz-time-zones"
				value={text}
				onChange={(event) => {
					setText(event.target.value);
					if (zones.includes(event.target.value)) onAdd(event.target.value);
				}}
				placeholder="Type a city, e.g. Paris"
			/>
			<datalist id="tabz-time-zones">
				{zones.map((zone) => (
					<option key={zone} value={zone}>
						{cityOf(zone)}
					</option>
				))}
			</datalist>
		</>
	);
}

function Input({
	field,
	value,
	onChange,
}: {
	field: FieldDef;
	value: JsonValue | undefined;
	onChange: (value: JsonValue) => void;
}) {
	switch (field.kind) {
		case "text":
		case "url":
		case "color":
		case "date":
		case "datetime":
			return (
				<input
					className={field.kind === "color" ? "h-9 w-16 rounded-lg" : "field"}
					type={
						field.kind === "datetime"
							? "datetime-local"
							: field.kind === "url"
								? "url"
								: field.kind
					}
					value={String(value ?? "")}
					onChange={(event) => onChange(event.target.value)}
					placeholder={"placeholder" in field ? field.placeholder : undefined}
					inputMode={field.kind === "url" ? "url" : undefined}
				/>
			);
		case "textarea":
		case "code":
			return (
				<textarea
					className={`field resize-y ${field.kind === "code" ? "font-mono text-xs" : ""}`}
					rows={field.kind === "code" ? 8 : 4}
					value={String(value ?? "")}
					onChange={(event) => onChange(event.target.value)}
					placeholder={field.placeholder}
					spellCheck={field.kind !== "code"}
				/>
			);
		case "number":
			return (
				<input
					className="field w-32"
					type="number"
					min={field.min}
					max={field.max}
					step={field.step ?? "any"}
					defaultValue={typeof value === "number" ? value : ""}
					onChange={(event) => {
						const number = Number.parseFloat(event.target.value);
						if (Number.isFinite(number)) onChange(number);
					}}
				/>
			);
		case "select":
			return (
				<select
					className="field"
					value={String(value ?? "")}
					onChange={(event) => onChange(event.target.value)}
				>
					{field.options.map(([option, label]) => (
						<option key={option} value={option}>
							{label}
						</option>
					))}
				</select>
			);
		case "list":
			return (
				<textarea
					className="field resize-y"
					rows={4}
					defaultValue={Array.isArray(value) ? value.join("\n") : ""}
					onChange={(event) =>
						onChange(
							event.target.value
								.split("\n")
								.map((line) => line.trim())
								.filter(Boolean)
								.slice(0, 100),
						)
					}
					placeholder={field.placeholder}
				/>
			);
		case "timezone":
			return <ZonePicker value={String(value ?? "")} onAdd={onChange} />;
		case "timezones": {
			const zones = Array.isArray(value) ? (value as string[]) : [];
			return (
				<div className="space-y-1.5">
					<div className="flex flex-wrap gap-1">
						{zones.map((zone) => (
							<span
								key={zone}
								className="flex items-center gap-1 rounded-full border border-line py-0.5 pr-1 pl-2.5 text-xs"
							>
								{cityOf(zone)}
								<button
									type="button"
									className="icon-btn size-5"
									aria-label={`Remove ${cityOf(zone)}`}
									onClick={() =>
										onChange(zones.filter((other) => other !== zone))
									}
								>
									<X className="size-3" />
								</button>
							</span>
						))}
					</div>
					<ZonePicker
						key={zones.length}
						value=""
						onAdd={(zone) =>
							!zones.includes(zone) && onChange([...zones, zone].slice(0, 12))
						}
					/>
				</div>
			);
		}
		case "toggle":
		case "place":
			return null;
	}
}

/** The custom code widget's editor: templates, code and a live preview. */
function CodeEditor({
	data,
	onChange,
}: {
	data: Data;
	onChange: (data: Data) => void;
}) {
	const html = String(data.html ?? "");
	const [preview, setPreview] = useState(html);
	useEffect(() => {
		const id = setTimeout(() => setPreview(html), 500);
		return () => clearTimeout(id);
	}, [html]);
	return (
		<div className="space-y-3">
			<Field label="Start from">
				<div className="flex flex-wrap gap-1">
					{CODE_TEMPLATES.map((template) => (
						<button
							key={template.name}
							type="button"
							className="focus-ring rounded-full border border-line px-2.5 py-1 text-xs transition hover:border-accent"
							onClick={() =>
								onChange({ ...data, html: template.html, state: null })
							}
						>
							{template.name}
						</button>
					))}
				</div>
			</Field>
			<Field
				label="HTML, CSS and JavaScript"
				hint="Runs in a sandbox with no access to your account. Use tabz.fetch(url) for JSON APIs, tabz.save(value) / tabz.state to remember things, tabz.open(url) for links, and the CSS variables --accent, --ink and --muted to match your theme."
			>
				<textarea
					className="field min-h-56 resize-y font-mono text-xs leading-relaxed"
					value={html}
					onChange={(event) => onChange({ ...data, html: event.target.value })}
					onKeyDown={(event) => {
						// Tab indents instead of leaving the editor.
						if (event.key !== "Tab" || event.shiftKey) return;
						event.preventDefault();
						const target = event.currentTarget;
						const { selectionStart: start, selectionEnd: end } = target;
						const next = `${html.slice(0, start)}  ${html.slice(end)}`;
						onChange({ ...data, html: next });
						requestAnimationFrame(() =>
							target.setSelectionRange(start + 2, start + 2),
						);
					}}
					spellCheck={false}
					wrap="off"
					maxLength={100_000}
					placeholder="Pick a template above to get started"
				/>
			</Field>
			{preview.trim() && (
				<Field label="Preview">
					<div className="rounded-xl border border-dashed border-line p-2">
						<SandboxFrame html={preview} state={data.state} maxHeight={400} />
					</div>
				</Field>
			)}
		</div>
	);
}

/** Settings for catalog widgets, generated from their field list. */
export function CatalogConfig({
	widget,
	onChange,
}: {
	widget: CatalogWidget;
	onChange: (widget: CatalogWidget) => void;
}) {
	const def = REGISTRY[widget.type];
	const data = { ...def.defaults, ...widget.data } as Data;
	const set = (patch: Data) =>
		onChange({ ...widget, data: { ...data, ...patch } });
	return (
		<div className="space-y-3">
			{widget.type === "custom-html" && (
				<CodeEditor
					data={data}
					onChange={(next) => onChange({ ...widget, data: next })}
				/>
			)}
			{def.fields?.map((field) =>
				field.kind === "toggle" ? (
					<Toggle
						key={field.key}
						label={field.label}
						checked={Boolean(data[field.key])}
						onChange={(checked) => set({ [field.key]: checked })}
					/>
				) : field.kind === "place" ? (
					<Field key={field.key} label={field.label}>
						<PlaceSearch
							place={String(data.place ?? "")}
							onPick={(place) => set(place)}
						/>
					</Field>
				) : (
					<Field key={field.key} label={field.label} hint={field.hint}>
						<Input
							field={field}
							value={data[field.key]}
							onChange={(value) => set({ [field.key]: value })}
						/>
					</Field>
				),
			)}
		</div>
	);
}

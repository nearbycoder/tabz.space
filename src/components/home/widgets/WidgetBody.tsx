import {
	Component,
	type ComponentType,
	type LazyExoticComponent,
	lazy,
	type ReactNode,
	Suspense,
	useCallback,
	useMemo,
} from "react";
import { lazyNamed } from "#/lib/lazy";
import type { Widget } from "#/lib/preferences";
import { type CatalogType, isCatalogType } from "#/lib/widget-catalog";
import { useHomeContext } from "../context";
import type { HomeGroup } from "../types";
import type { JsonValue, WidgetProps } from "./kit";
import { REGISTRY } from "./registry";
import { useWidgetSaver } from "./save";

/*
 * Renders a widget group's content. Every widget's code is its own chunk,
 * fetched the first time that widget appears.
 */

const NotesWidget = lazyNamed(() => import("./LocalWidgets"), "NotesWidget");
const TodoWidget = lazyNamed(() => import("./LocalWidgets"), "TodoWidget");
const PomodoroWidget = lazyNamed(
	() => import("./LocalWidgets"),
	"PomodoroWidget",
);
const WeatherWidget = lazyNamed(() => import("./DataWidgets"), "WeatherWidget");
const CalendarWidget = lazyNamed(
	() => import("./DataWidgets"),
	"CalendarWidget",
);
const StocksWidget = lazyNamed(() => import("./DataWidgets"), "StocksWidget");
const FeedWidget = lazyNamed(() => import("./DataWidgets"), "FeedWidget");

type Data = Record<string, JsonValue>;
type Lazy = LazyExoticComponent<ComponentType<WidgetProps<Data>>>;
const components = new Map<CatalogType, Lazy>();

const componentFor = (type: CatalogType) => {
	let found = components.get(type);
	if (!found) {
		found = lazy(REGISTRY[type].load);
		components.set(type, found);
	}
	return found;
};

/** Starts downloading widgets' code early (e.g. when the browser is idle). */
export const preloadWidgets = (types: string[]) => {
	for (const type of new Set(types))
		if (isCatalogType(type)) void REGISTRY[type].load();
};

/** One broken widget shouldn't take the whole page down. */
class WidgetBoundary extends Component<
	{ children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		if (!this.state.failed) return this.props.children;
		return (
			<div className="flex items-center justify-between gap-2 py-3 text-sm text-muted">
				This widget hit a problem.
				<button
					type="button"
					className="btn-ghost text-xs"
					onClick={() => this.setState({ failed: false })}
				>
					Try again
				</button>
			</div>
		);
	}
}

function CatalogBody({
	group,
	widget,
}: {
	group: HomeGroup;
	widget: Extract<Widget, { data: unknown }>;
}) {
	const { readOnly } = useHomeContext();
	const saver = useWidgetSaver(group.id);
	const save = useCallback(
		(data: Data, options?: { now?: boolean }) => {
			if (!readOnly) saver({ type: widget.type, data }, options);
		},
		[saver, widget.type, readOnly],
	);
	// Older saves may lack newer settings; fill them from the defaults.
	const data = useMemo(
		() => ({ ...REGISTRY[widget.type].defaults, ...widget.data }),
		[widget],
	);
	const Body = componentFor(widget.type);
	return <Body group={group} data={data} save={save} readOnly={readOnly} />;
}

function Legacy({ group, widget }: { group: HomeGroup; widget: Widget }) {
	switch (widget.type) {
		case "notes":
			return <NotesWidget groupId={group.id} widget={widget} />;
		case "todo":
			return <TodoWidget groupId={group.id} widget={widget} />;
		case "pomodoro":
			return <PomodoroWidget groupId={group.id} widget={widget} />;
		case "weather":
			return <WeatherWidget widget={widget} />;
		case "calendar":
			return <CalendarWidget widget={widget} />;
		case "stocks":
			return <StocksWidget widget={widget} />;
		case "feed":
			return <FeedWidget widget={widget} />;
		default:
			return null;
	}
}

/** The content of a widget group. */
export function WidgetBody({ group }: { group: HomeGroup }) {
	const widget = group.options.widget;
	if (!widget) return null;
	return (
		<WidgetBoundary>
			<Suspense fallback={<div className="min-h-24" />}>
				{"data" in widget && isCatalogType(widget.type) ? (
					<CatalogBody group={group} widget={widget} />
				) : (
					<Legacy group={group} widget={widget} />
				)}
			</Suspense>
		</WidgetBoundary>
	);
}

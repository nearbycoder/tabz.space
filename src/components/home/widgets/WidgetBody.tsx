import type { HomeGroup } from "../types";
import {
	CalendarWidget,
	FeedWidget,
	StocksWidget,
	WeatherWidget,
} from "./DataWidgets";
import { NotesWidget, PomodoroWidget, TodoWidget } from "./LocalWidgets";

/** The content of a widget group. */
export function WidgetBody({ group }: { group: HomeGroup }) {
	const widget = group.options.widget;
	if (!widget) return null;
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
	}
}

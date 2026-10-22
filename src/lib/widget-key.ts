/**
 * Query key for a widget's server data. Shared by the widgets and the server,
 * which remembers each account's latest results under the same key so the
 * home page can render with them in place (see server/widget-memory.ts).
 */
export const widgetKey = (name: string, input: unknown = null) =>
	["widget", name, input] as const;

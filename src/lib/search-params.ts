/*
 * Tiny URL search-param readers for route `validateSearch`, so routes don't
 * pull a validation library into the page just to read ?redirect= or ?url=.
 */

type Search = Record<string, unknown>;

export const optionalString = (value: unknown) =>
	typeof value === "string" ? value : undefined;

/** "1", "true" or true → true; anything else → undefined. */
export const optionalFlag = (value: unknown) =>
	value === true || value === "true" || value === "1" || value === 1
		? true
		: undefined;

/** Keeps every param, with `redirect` as a string when present. */
export const withRedirect = (search: Search): { redirect?: string } => ({
	...search,
	redirect: optionalString(search.redirect),
});

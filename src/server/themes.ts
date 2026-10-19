import { and, desc, eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { user } from "#/db/auth-schema";
import { themes, userSettings } from "#/db/schema";
import { InvalidInput, NotFound } from "#/lib/effect/errors";
import {
	resolveSettings,
	sanitizeCss,
	THEME_KEYS,
	type UserSettings,
} from "#/lib/preferences";
import { idSchema, saveSettings } from "./library";
import { query } from "./runtime";

/* Community themes: publish how your tabz looks; anyone can apply it. */

const MAX_PER_USER = 10;

const pickTheme = (settings: UserSettings): Partial<UserSettings> => {
	const picked: Record<string, unknown> = {};
	for (const key of THEME_KEYS) picked[key] = settings[key];
	return {
		...picked,
		customCss: sanitizeCss(settings.customCss),
	} as Partial<UserSettings>;
};

export const listThemesInput = z.object({
	sort: z.enum(["popular", "new"]).optional(),
});

export const listThemes = (
	userId: string,
	data: z.infer<typeof listThemesInput>,
) =>
	query((db) =>
		db
			.select({
				id: themes.id,
				name: themes.name,
				settings: themes.settings,
				installs: themes.installs,
				createdAt: themes.createdAt,
				authorId: themes.userId,
				author: sql<string>`coalesce(${user.displayUsername}, ${user.username}, ${user.name})`,
			})
			.from(themes)
			.innerJoin(user, eq(user.id, themes.userId))
			.orderBy(
				data.sort === "new" ? desc(themes.createdAt) : desc(themes.installs),
				desc(themes.createdAt),
			)
			.limit(60),
	).pipe(
		Effect.map((rows) =>
			rows.map(({ authorId, ...row }) => ({
				...row,
				mine: authorId === userId,
			})),
		),
	);

export const publishThemeInput = z.object({
	name: z.string().trim().min(2).max(40),
});

/** Publishes the caller's current look. */
export const publishTheme = (
	userId: string,
	data: z.infer<typeof publishThemeInput>,
) =>
	Effect.gen(function* () {
		const count = yield* query((db) =>
			db.$count(themes, eq(themes.userId, userId)),
		);
		if (count >= MAX_PER_USER)
			return yield* new InvalidInput({
				message: `You can publish up to ${MAX_PER_USER} themes`,
			});
		const row = yield* query((db) =>
			db.query.userSettings.findFirst({
				where: eq(userSettings.userId, userId),
			}),
		);
		const [theme] = yield* query((db) =>
			db
				.insert(themes)
				.values({
					userId,
					name: data.name,
					settings: pickTheme(resolveSettings(row?.settings)),
				})
				.returning({ id: themes.id }),
		);
		return theme;
	});

export const applyTheme = (userId: string, data: { id: string }) =>
	Effect.gen(function* () {
		const theme = yield* query((db) =>
			db.query.themes.findFirst({ where: eq(themes.id, data.id) }),
		);
		if (!theme) return yield* new NotFound({ entity: "Theme" });
		// Re-sanitize on the way in, and only ever take appearance keys.
		const patch = pickTheme(resolveSettings(theme.settings));
		const settings = yield* saveSettings(userId, patch);
		if (theme.userId !== userId)
			yield* query((db) =>
				db
					.update(themes)
					.set({ installs: sql`${themes.installs} + 1` })
					.where(eq(themes.id, theme.id)),
			);
		return settings;
	});

export const deleteTheme = (userId: string, data: { id: string }) =>
	query((db) =>
		db
			.delete(themes)
			.where(and(eq(themes.id, data.id), eq(themes.userId, userId)))
			.returning({ id: themes.id }),
	).pipe(
		Effect.flatMap((rows) =>
			rows.length
				? Effect.succeed({ ok: true })
				: Effect.fail(new NotFound({ entity: "Theme" })),
		),
	);

export const themeIdInput = z.object({ id: idSchema });

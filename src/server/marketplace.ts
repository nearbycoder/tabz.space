import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { user } from "#/db/auth-schema";
import { customWidgets, sharedWidgets } from "#/db/schema";
import { InvalidInput, NotFound } from "#/lib/effect/errors";
import { widgetSchema } from "#/lib/schemas";
import { idSchema } from "./library";
import { query } from "./runtime";

/*
 * The widget marketplace: publish a widget from My widgets for anyone to
 * install. Installing copies it into the installer's My widgets. Custom
 * widgets run in a sandboxed frame with no access to the page or your links,
 * so a shared one can only show things and fetch public JSON.
 */

const MAX_PER_USER = 20;

export const listSharedInput = z.object({
	sort: z.enum(["popular", "new"]).optional(),
	search: z.string().trim().max(60).optional(),
});

export const listShared = (
	userId: string,
	data: z.infer<typeof listSharedInput>,
) =>
	query((db) =>
		db
			.select({
				id: sharedWidgets.id,
				name: sharedWidgets.name,
				icon: sharedWidgets.icon,
				description: sharedWidgets.description,
				widget: sharedWidgets.widget,
				installs: sharedWidgets.installs,
				createdAt: sharedWidgets.createdAt,
				authorId: sharedWidgets.userId,
				author: sql<string>`coalesce(${user.displayUsername}, ${user.username}, ${user.name})`,
			})
			.from(sharedWidgets)
			.innerJoin(user, eq(user.id, sharedWidgets.userId))
			.where(
				data.search
					? or(
							like(sharedWidgets.name, `%${data.search}%`),
							like(sharedWidgets.description, `%${data.search}%`),
						)
					: undefined,
			)
			.orderBy(
				data.sort === "new"
					? desc(sharedWidgets.createdAt)
					: desc(sharedWidgets.installs),
				desc(sharedWidgets.createdAt),
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

export const publishInput = z.object({
	/** A widget from the caller's My widgets. */
	id: idSchema,
	description: z.string().trim().max(200).optional(),
});

/** Shares one of your saved widgets (a snapshot: later edits aren't pushed). */
export const publish = (userId: string, data: z.infer<typeof publishInput>) =>
	Effect.gen(function* () {
		const saved = yield* query((db) =>
			db.query.customWidgets.findFirst({
				where: and(
					eq(customWidgets.id, data.id),
					eq(customWidgets.userId, userId),
				),
			}),
		);
		if (!saved) return yield* new NotFound({ entity: "Widget" });
		const widget = widgetSchema.parse(saved.widget);
		// Notes, to-dos and the like hold personal content: only widgets that
		// are code or configuration can be shared.
		if (!["custom-html", "json-api"].includes(widget.type))
			return yield* new InvalidInput({
				message: "Only custom HTML and JSON API widgets can be published",
			});
		// Share the code and settings, not what it saved for you (tabz.save).
		const { state: _state, ...settings } = (
			"data" in widget ? widget.data : {}
		) as Record<string, unknown>;
		const shareable = { ...widget, data: settings } as typeof widget;
		const count = yield* query((db) =>
			db.$count(sharedWidgets, eq(sharedWidgets.userId, userId)),
		);
		if (count >= MAX_PER_USER)
			return yield* new InvalidInput({
				message: `You can publish up to ${MAX_PER_USER} widgets`,
			});
		const [row] = yield* query((db) =>
			db
				.insert(sharedWidgets)
				.values({
					userId,
					name: saved.name,
					icon: saved.icon,
					description: data.description ?? "",
					widget: shareable,
				})
				.returning({ id: sharedWidgets.id }),
		);
		return row;
	});

export const sharedIdInput = z.object({ id: idSchema });

/** Copies a shared widget into My widgets. */
export const install = (userId: string, data: z.infer<typeof sharedIdInput>) =>
	Effect.gen(function* () {
		const shared = yield* query((db) =>
			db.query.sharedWidgets.findFirst({
				where: eq(sharedWidgets.id, data.id),
			}),
		);
		if (!shared) return yield* new NotFound({ entity: "Widget" });
		const widget = widgetSchema.parse(shared.widget);
		const [row] = yield* query((db) =>
			db
				.insert(customWidgets)
				.values({ userId, name: shared.name, icon: shared.icon, widget })
				.returning({ id: customWidgets.id }),
		);
		if (shared.userId !== userId)
			yield* query((db) =>
				db
					.update(sharedWidgets)
					.set({ installs: sql`${sharedWidgets.installs} + 1` })
					.where(eq(sharedWidgets.id, shared.id)),
			);
		return { id: row.id, name: shared.name, icon: shared.icon, widget };
	});

export const unpublish = (
	userId: string,
	data: z.infer<typeof sharedIdInput>,
) =>
	query((db) =>
		db
			.delete(sharedWidgets)
			.where(
				and(eq(sharedWidgets.id, data.id), eq(sharedWidgets.userId, userId)),
			)
			.returning({ id: sharedWidgets.id }),
	).pipe(
		Effect.flatMap((rows) =>
			rows.length
				? Effect.succeed({ ok: true })
				: Effect.fail(new NotFound({ entity: "Widget" })),
		),
	);

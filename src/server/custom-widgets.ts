import { and, desc, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { customWidgets } from "#/db/schema";
import { InvalidInput, NotFound } from "#/lib/effect/errors";
import { widgetSchema } from "#/lib/schemas";
import { idSchema } from "./library";
import { query } from "./runtime";

/* "My widgets": a personal library of built or configured widgets. */

const MAX_WIDGETS = 100;

export const listCustomWidgets = (userId: string) =>
	query((db) =>
		db
			.select({
				id: customWidgets.id,
				name: customWidgets.name,
				icon: customWidgets.icon,
				widget: customWidgets.widget,
				updatedAt: customWidgets.updatedAt,
			})
			.from(customWidgets)
			.where(eq(customWidgets.userId, userId))
			.orderBy(desc(customWidgets.updatedAt)),
	);

export const saveCustomWidgetInput = z.object({
	/** Updates this saved widget; omit to save a new one. */
	id: idSchema.optional(),
	name: z.string().trim().min(1).max(60),
	icon: z.string().trim().min(1).max(16),
	widget: widgetSchema,
});

export const saveCustomWidget = (
	userId: string,
	data: z.infer<typeof saveCustomWidgetInput>,
) =>
	Effect.gen(function* () {
		const values = { name: data.name, icon: data.icon, widget: data.widget };
		if (data.id) {
			const [row] = yield* query((db) =>
				db
					.update(customWidgets)
					.set(values)
					.where(
						and(
							eq(customWidgets.id, data.id as string),
							eq(customWidgets.userId, userId),
						),
					)
					.returning({ id: customWidgets.id }),
			);
			if (!row) return yield* new NotFound({ entity: "Widget" });
			return row;
		}
		const count = yield* query((db) =>
			db.$count(customWidgets, eq(customWidgets.userId, userId)),
		);
		if (count >= MAX_WIDGETS)
			return yield* new InvalidInput({
				message: `You can keep up to ${MAX_WIDGETS} widgets in My widgets`,
			});
		const [row] = yield* query((db) =>
			db
				.insert(customWidgets)
				.values({ userId, ...values })
				.returning({ id: customWidgets.id }),
		);
		return row;
	});

export const deleteCustomWidget = (userId: string, id: string) =>
	query((db) =>
		db
			.delete(customWidgets)
			.where(and(eq(customWidgets.id, id), eq(customWidgets.userId, userId))),
	).pipe(Effect.as({ ok: true }));

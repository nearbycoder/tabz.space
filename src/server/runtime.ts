import { getRequestHeaders } from "@tanstack/react-start/server";
import { Cause, Effect, Exit } from "effect";
import { type Database, db } from "#/db";
import { auth } from "#/lib/auth";
import {
	type AppError,
	DatabaseError,
	Unauthorized,
} from "#/lib/effect/errors";

export type SessionUser = typeof auth.$Infer.Session.user;

/** Wraps a Drizzle call so failures become a typed `DatabaseError`. */
export const query = <A>(run: (database: Database) => Promise<A>) =>
	Effect.tryPromise({
		try: () => run(db),
		catch: (cause) => new DatabaseError({ cause }),
	});

const sessionUser = (headers: Headers) =>
	Effect.gen(function* () {
		const session = yield* Effect.tryPromise({
			try: () => auth.api.getSession({ headers }),
			catch: () => new Unauthorized({}),
		});
		if (!session) return yield* new Unauthorized({});
		return session.user;
	});

const publicMessage = (error: AppError): string => {
	switch (error._tag) {
		case "Unauthorized":
			return error.message ?? "Please sign in to continue";
		case "NotFound":
			return `${error.entity} not found`;
		case "InvalidInput":
			return error.message;
		case "DatabaseError":
			return "Something went wrong saving your changes";
	}
};

/** Runs a server program at the RPC boundary, turning typed failures into plain errors. */
export async function runServer<A>(program: Effect.Effect<A, AppError>) {
	const exit = await Effect.runPromiseExit(
		program.pipe(
			Effect.tapError((error) =>
				error._tag === "DatabaseError"
					? Effect.logError("database failure", error.cause)
					: Effect.void,
			),
		),
	);
	if (Exit.isSuccess(exit)) return exit.value;
	const failure = Cause.squash(exit.cause);
	if (failure && typeof failure === "object" && "_tag" in failure) {
		throw new Error(publicMessage(failure as AppError));
	}
	throw failure instanceof Error ? failure : new Error("Unexpected error");
}

/** Same as `runServer`, but resolves the signed-in user first. */
export function runAuthed<A>(
	program: (user: SessionUser) => Effect.Effect<A, AppError>,
) {
	// Read headers synchronously while still inside the request context.
	const headers = new Headers(getRequestHeaders() as HeadersInit);
	return runServer(Effect.flatMap(sessionUser(headers), program));
}

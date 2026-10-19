import { getRequestHeaders } from "@tanstack/react-start/server";
import { Cause, Effect, Exit } from "effect";
import { type Database, db } from "#/db";
import { auth } from "#/lib/auth";
import {
	type AppError,
	DatabaseError,
	Unauthorized,
} from "#/lib/effect/errors";
import { ensureJobs } from "./jobs";
import { VaultAccess } from "./vault-access";
import { cookieValue, readVaultToken, VAULT_COOKIE } from "./vault-token";

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

export const publicMessage = (error: AppError): string => {
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
	ensureJobs();
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

/**
 * Same as `runServer`, but resolves the signed-in user first and, when their
 * vault-unlock cookie is valid, grants vault access to the program.
 */
export function runAuthed<A>(
	program: (user: SessionUser) => Effect.Effect<A, AppError>,
) {
	// Read headers synchronously while still inside the request context.
	const headers = new Headers(getRequestHeaders() as HeadersInit);
	return runServer(
		Effect.gen(function* () {
			const user = yield* sessionUser(headers);
			const access = yield* Effect.promise(() =>
				readVaultToken(cookieValue(headers, VAULT_COOKIE), user.id),
			);
			return yield* program(user).pipe(
				Effect.provideService(VaultAccess, access),
			);
		}),
	);
}

const STATUS: Record<AppError["_tag"], number> = {
	Unauthorized: 401,
	NotFound: 404,
	InvalidInput: 400,
	DatabaseError: 500,
};

/** Runs a program for a JSON HTTP endpoint, mapping typed failures to status codes. */
export async function runJson<A>(
	program: Effect.Effect<A, AppError>,
	init: ResponseInit = {},
) {
	ensureJobs();
	const exit = await Effect.runPromiseExit(program);
	const headers = {
		"content-type": "application/json",
		...corsHeaders,
		...init.headers,
	};
	if (Exit.isSuccess(exit))
		return new Response(JSON.stringify(exit.value ?? null), {
			...init,
			headers,
		});
	const failure = Cause.squash(exit.cause) as AppError | Error;
	if (
		failure &&
		typeof failure === "object" &&
		"_tag" in failure &&
		failure._tag in STATUS
	) {
		if (failure._tag === "DatabaseError")
			console.error("database failure", failure.cause);
		return new Response(JSON.stringify({ error: publicMessage(failure) }), {
			status: STATUS[failure._tag],
			headers,
		});
	}
	console.error(failure);
	return new Response(JSON.stringify({ error: "Unexpected error" }), {
		status: 500,
		headers,
	});
}

/** Token-authenticated endpoints don't use cookies, so any origin may call them. */
export const corsHeaders = {
	"access-control-allow-origin": "*",
	"access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
	"access-control-allow-headers": "authorization, content-type",
	"access-control-max-age": "86400",
};

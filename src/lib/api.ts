import { Cause, Effect, Exit, Schedule } from "effect";
import { RequestError } from "#/lib/effect/errors";

const toRequestError = (error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	// fetch() rejects with a TypeError when the network itself fails.
	const network =
		error instanceof TypeError ||
		/failed to fetch|networkerror|load failed/i.test(message);
	return new RequestError({
		message: network
			? "Can't reach tabz.space — check your connection"
			: message,
		network,
	});
};

type Fetcher<I, O> = (options: { data: I }) => Promise<O>;

/**
 * Calls a server function as an Effect: network blips are retried with
 * backoff (server-side rejections are not), and every call is time-boxed.
 */
export function call<O>(fn: () => Promise<O>): Effect.Effect<O, RequestError>;
export function call<I, O>(
	fn: Fetcher<I, O>,
	data: I,
): Effect.Effect<O, RequestError>;
export function call<I, O>(fn: Fetcher<I, O> | (() => Promise<O>), data?: I) {
	return Effect.tryPromise({
		try: () => (fn as Fetcher<I | undefined, O>)({ data }),
		catch: toRequestError,
	}).pipe(
		Effect.retry({
			times: 2,
			schedule: Schedule.exponential("300 millis"),
			while: (error) => error.network,
		}),
		Effect.timeoutOrElse({
			duration: "20 seconds",
			orElse: () =>
				Effect.fail(
					new RequestError({ message: "The request timed out", network: true }),
				),
		}),
	);
}

/** Runs a request effect, rejecting with a plain Error for React Query. */
export async function run<A>(
	effect: Effect.Effect<A, RequestError>,
): Promise<A> {
	const exit = await Effect.runPromiseExit(effect);
	if (Exit.isSuccess(exit)) return exit.value;
	const error = Cause.squash(exit.cause);
	throw error instanceof Error
		? error
		: new Error((error as RequestError)?.message ?? "Request failed");
}

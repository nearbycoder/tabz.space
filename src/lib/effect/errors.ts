import { Data } from "effect";

export class Unauthorized extends Data.TaggedError("Unauthorized")<{
	readonly message?: string;
}> {}

export class NotFound extends Data.TaggedError("NotFound")<{
	readonly entity: string;
}> {}

export class InvalidInput extends Data.TaggedError("InvalidInput")<{
	readonly message: string;
}> {}

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
	readonly cause: unknown;
}> {}

export class FetchError extends Data.TaggedError("FetchError")<{
	readonly url: string;
	readonly reason: string;
}> {}

/** Errors a server function can surface to the browser. */
export type AppError = Unauthorized | NotFound | InvalidInput | DatabaseError;

/** Failures raised while calling the server from the browser. */
export class RequestError extends Data.TaggedError("RequestError")<{
	readonly message: string;
	readonly network: boolean;
}> {}

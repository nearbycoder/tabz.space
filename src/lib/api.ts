/*
 * Browser → server calls. Network blips are retried with backoff (server-side
 * rejections are not) and every call is time-boxed. Deliberately tiny and
 * dependency-free so it adds nothing to the page's JavaScript; the server's
 * own network code (page fetches, feeds, webhooks, AI) runs on Effect.
 */

/** A prepared server call; nothing happens until it's passed to `run`. */
export type Request<O> = { readonly fn: () => Promise<O> };

type Fetcher<I, O> = (options: { data: I }) => Promise<O>;

export function call<O>(fn: () => Promise<O>): Request<O>;
export function call<I, O>(fn: Fetcher<I, O>, data: I): Request<O>;
export function call<I, O>(
	fn: Fetcher<I, O> | (() => Promise<O>),
	data?: I,
): Request<O> {
	return { fn: () => (fn as Fetcher<I | undefined, O>)({ data }) };
}

const isNetworkError = (error: unknown) =>
	error instanceof TypeError ||
	/failed to fetch|networkerror|load failed/i.test(String(error));

const RETRIES = 2;
const TIMEOUT_MS = 20_000;

const withTimeout = <O>(promise: Promise<O>) =>
	new Promise<O>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error("The request timed out")),
			TIMEOUT_MS,
		);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});

/** Runs a prepared call, rejecting with a plain Error (what React Query wants). */
export async function run<O>(request: Request<O>): Promise<O> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await withTimeout(request.fn());
		} catch (error) {
			if (isNetworkError(error) && attempt < RETRIES) {
				await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
				continue;
			}
			if (isNetworkError(error))
				throw new Error("Can't reach tabz.space — check your connection");
			throw error instanceof Error ? error : new Error(String(error));
		}
	}
}

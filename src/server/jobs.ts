import { Effect } from "effect";

/*
 * In-process background jobs (single Railway instance). Started lazily on the
 * first request so dev servers and builds don't spin timers.
 */

type Job = {
	name: string;
	everyMs: number;
	run: () => Effect.Effect<unknown, unknown>;
};

const jobs: Job[] = [];
let started = false;

export function registerJob(job: Job) {
	jobs.push(job);
	if (started) schedule(job);
}

function schedule(job: Job) {
	const tick = () =>
		Effect.runPromise(
			job
				.run()
				.pipe(
					Effect.catchCause((cause) =>
						Effect.logWarning(`job ${job.name} failed`, cause),
					),
				),
		).catch(() => {});
	setTimeout(tick, 30_000).unref?.();
	setInterval(tick, job.everyMs).unref?.();
}

export function ensureJobs() {
	if (started || process.env.NODE_ENV === "test") return;
	started = true;
	for (const job of jobs) schedule(job);
	// Job definitions import the library; load them lazily so this module stays
	// cheap and never ends up in a client bundle.
	void import("./register-jobs");
}

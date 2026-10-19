import { indexPending } from "./content";
import { registerJob } from "./jobs";
import { purgeExpired } from "./library";
import { checkStaleLinks, pollFeeds } from "./monitors";

/** All background jobs; loaded lazily by `ensureJobs`. */
registerJob({ name: "purge-trash", everyMs: 60 * 60_000, run: purgeExpired });
registerJob({
	name: "index-content",
	everyMs: 5 * 60_000,
	run: () => indexPending(),
});
registerJob({
	name: "check-links",
	everyMs: 20 * 60_000,
	run: () => checkStaleLinks(),
});
registerJob({
	name: "poll-feeds",
	everyMs: 15 * 60_000,
	run: () => pollFeeds(),
});

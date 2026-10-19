import { registerJob } from "./jobs";
import { purgeExpired } from "./library";

/** All background jobs; imported once from the server entry points. */
registerJob({ name: "purge-trash", everyMs: 60 * 60_000, run: purgeExpired });

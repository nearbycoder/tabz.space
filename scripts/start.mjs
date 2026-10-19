// Production entry point: apply migrations, then run the server in this same
// process. Started directly with `node` (not `npm start`) so Railway's SIGTERM
// on redeploys reaches Node, the server drains gracefully, and the process
// exits with code 0 instead of being reported as a crash.

const shutdown = () => {
	// srvx closes the HTTP server on the same signal; give it time to drain
	// in-flight requests, then exit cleanly even if timers or the database
	// connection would keep the event loop alive.
	setTimeout(() => process.exit(0), 6_000).unref();
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

await import("./migrate.mjs");
await import("../.output/server/index.mjs");

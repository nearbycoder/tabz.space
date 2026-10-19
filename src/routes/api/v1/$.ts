import { createFileRoute } from "@tanstack/react-router";
import { handleRest } from "#/server/rest";

const handler = ({ request }: { request: Request }) => handleRest(request);

export const Route = createFileRoute("/api/v1/$")({
	server: {
		handlers: {
			GET: handler,
			POST: handler,
			PATCH: handler,
			PUT: handler,
			DELETE: handler,
			OPTIONS: handler,
		},
	},
});

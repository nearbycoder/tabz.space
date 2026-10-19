import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as tokens from "./api-tokens";
import { runAuthed } from "./runtime";
import * as hooks from "./webhooks";

/* Server functions behind Customize → Connect (API tokens, webhooks, extension). */

export const listApiTokens = createServerFn().handler(() =>
	runAuthed((user) => tokens.listApiTokens(user.id)),
);

export const createApiToken = createServerFn({ method: "POST" })
	.validator(tokens.createTokenInput)
	.handler(({ data }) =>
		runAuthed((user) => tokens.createApiToken(user.id, data)),
	);

export const revokeApiToken = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string() }))
	.handler(({ data }) =>
		runAuthed((user) => tokens.revokeApiToken(user.id, data.id)),
	);

/** Mints the token the browser extension receives through the page bridge. */
export const issueExtensionToken = createServerFn({ method: "POST" }).handler(
	() =>
		runAuthed((user) =>
			tokens.createApiToken(user.id, {
				name: "Browser extension",
				kind: "extension",
			}),
		),
);

export const listWebhooks = createServerFn().handler(() =>
	runAuthed((user) => hooks.listWebhooks(user.id)),
);

export const createWebhook = createServerFn({ method: "POST" })
	.validator(hooks.createWebhookInput)
	.handler(({ data }) =>
		runAuthed((user) => hooks.createWebhook(user.id, data)),
	);

export const deleteWebhook = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string() }))
	.handler(({ data }) =>
		runAuthed((user) => hooks.deleteWebhook(user.id, data.id)),
	);

export const testWebhook = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string() }))
	.handler(({ data }) =>
		runAuthed((user) => hooks.testWebhook(user.id, data.id)),
	);

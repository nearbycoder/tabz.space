import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as tokens from "./api-tokens";
import * as channels from "./channels";
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

export const listChannels = createServerFn().handler(() =>
	runAuthed((user) => channels.listChannels(user.id)),
);

export const connectTelegram = createServerFn({ method: "POST" }).handler(() =>
	runAuthed((user) => channels.telegramLink(user.id)),
);

export const getEmailAddress = createServerFn({ method: "POST" })
	.validator(z.object({ rotate: z.boolean().optional() }))
	.handler(({ data }) =>
		runAuthed((user) => channels.emailAddress(user.id, data.rotate)),
	);

export const removeChannel = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string() }))
	.handler(({ data }) =>
		runAuthed((user) => channels.removeChannel(user.id, data.id)),
	);

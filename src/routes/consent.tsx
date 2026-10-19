import { createFileRoute } from "@tanstack/react-router";
import { Consent } from "#/components/Consent";

export const Route = createFileRoute("/consent")({
	component: Consent,
});

import { defineRailway, github, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  // SQLite lives here; keep the service at one replica.
  const data = volume("tabz-data", {
    region: "us-west2",
    sizeMB: 5000,
    allowOnlineResize: true,
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
  });

  const tabzSpace = service("tabz.space", {
    source: github("nearbycoder/tabz.space", { branch: "main", checkSuites: false }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    // Not "npm start": npm turns the SIGTERM sent on redeploys into a failed exit.
    start: "node scripts/start.mjs",
    healthcheck: "/sign-in",
    healthcheckTimeout: 120,
    replicas: { "us-west2": 1 },
    deploy: { restartPolicyMaxRetries: 5 },
    networking: { privateNetworkEndpoint: "tabzspace" },
    volumeMounts: { "/data": data },
    env: {
      PORT: "3000",
      BETTER_AUTH_SECRET: preserve(),
      BETTER_AUTH_TRUSTED_ORIGINS: preserve(),
      BETTER_AUTH_URL: preserve(),
      DATABASE_PATH: preserve(),
      NODE_ENV: preserve(),
      GITHUB_CLIENT_ID: preserve(),
      GITHUB_CLIENT_SECRET: preserve(),
    },
  });

  return project("tabz.space", {
    resources: [tabzSpace, data],
  });
});

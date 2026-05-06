import * as Sentry from "@sentry/nextjs";

const parseSampleRate = (value: string | undefined, fallback: number) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn) && process.env.SENTRY_ENABLED !== "false",
  environment:
    process.env.SENTRY_ENVIRONMENT ??
    process.env.APP_ENV ??
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    process.env.NODE_ENV,
  release:
    process.env.SENTRY_RELEASE ??
    process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
    process.env.GIT_SHA ??
    process.env.GITHUB_SHA,
  tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.05),
  initialScope: {
    tags: {
      app_env: process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? "unknown",
      service: "web",
      runtime: "nextjs-edge",
    },
  },
});
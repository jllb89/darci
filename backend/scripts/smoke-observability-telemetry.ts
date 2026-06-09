import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/node";
import { DomainError } from "../src/errors/domainError";
import {
  buildDomainCaptureContext,
  captureDomainException,
  flushSentry,
} from "../src/utils/sentry";

const main = async () => {
  const shouldEmit = process.argv.includes("--emit");
  const requestId = process.env.OBSERVABILITY_SMOKE_REQUEST_ID ?? `smoke-${randomUUID()}`;
  const environment =
    process.env.SENTRY_ENVIRONMENT ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? "unknown";
  const release = process.env.SENTRY_RELEASE ?? process.env.GIT_SHA ?? process.env.IMAGE_TAG;

  const error = new DomainError({
    code: "OBSERVABILITY_SMOKE_EVENT",
    family: "internal",
    message: "Synthetic observability smoke event",
    details: {
      synthetic: true,
      requestId,
      emittedBy: "smoke-observability-telemetry",
    },
  });

  const context = {
    service: "backend",
    operation: "observability.smoke",
    level: "info" as const,
    tags: {
      request_id: requestId,
      synthetic: "true",
      smoke_test: "observability",
    },
    contexts: {
      observability_smoke: {
        requestId,
        dryRun: !shouldEmit,
        environment,
        release: release ?? null,
      },
    },
    fingerprint: ["backend", "internal", "OBSERVABILITY_SMOKE_EVENT", "observability.smoke"],
  };

  const preview = buildDomainCaptureContext(error, context);

  console.log(JSON.stringify({
    emit: shouldEmit,
    requestId,
    tags: preview.tags,
    contexts: preview.contexts,
    fingerprint: preview.fingerprint,
  }, null, 2));

  if (!shouldEmit) {
    console.log("Dry run only. Re-run with --emit after deploy to send the synthetic Sentry event.");
    return;
  }

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    throw new Error("SENTRY_DSN is required when running observability smoke with --emit.");
  }

  const sentryOptions: Sentry.NodeOptions = {
    dsn,
    environment,
    enabled: process.env.SENTRY_ENABLED !== "false",
    tracesSampleRate: 0,
  };

  if (release) {
    sentryOptions.release = release;
  }

  Sentry.init(sentryOptions);
  captureDomainException(error, context);
  await flushSentry(2000);

  console.log(`Synthetic observability smoke event emitted with request_id=${requestId}.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
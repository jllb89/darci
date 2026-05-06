"use client";

import * as Sentry from "@sentry/nextjs";

type TelemetryLevel = "fatal" | "error" | "warning" | "info" | "debug";

type ClientTelemetryContext = {
  level?: TelemetryLevel;
  tags?: Record<string, string | number | boolean | null | undefined>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, Record<string, unknown>>;
  fingerprint?: string[];
};

const applyContext = (scope: Sentry.Scope, context?: ClientTelemetryContext) => {
  if (!context) {
    return;
  }

  if (context.level) {
    scope.setLevel(context.level);
  }

  if (context.fingerprint) {
    scope.setFingerprint(context.fingerprint);
  }

  for (const [key, value] of Object.entries(context.tags ?? {})) {
    if (value !== null && value !== undefined) {
      scope.setTag(key, String(value));
    }
  }

  for (const [key, value] of Object.entries(context.contexts ?? {})) {
    scope.setContext(key, value);
  }

  for (const [key, value] of Object.entries(context.extra ?? {})) {
    scope.setExtra(key, value);
  }
};

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return error;
  }

  return new Error(
    typeof error === "string" ? error : "Non-Error exception captured",
  );
};

export const captureAppException = (
  error: unknown,
  context?: ClientTelemetryContext,
) => {
  Sentry.withScope((scope) => {
    applyContext(scope, context);
    Sentry.captureException(normalizeError(error));
  });
};

export const captureAppMessage = (
  message: string,
  context?: ClientTelemetryContext,
) => {
  Sentry.withScope((scope) => {
    applyContext(scope, context);
    Sentry.captureMessage(message);
  });
};
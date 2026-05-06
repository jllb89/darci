import * as Sentry from "@sentry/node";

type CaptureLevel = "fatal" | "error" | "warning" | "info" | "debug";

type CaptureContextInput = {
  level?: CaptureLevel;
  tags?: Record<string, string | number | boolean | null | undefined>;
  contexts?: Record<string, Record<string, unknown>>;
  extra?: Record<string, unknown>;
  fingerprint?: string[];
};

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return error;
  }

  return new Error(
    typeof error === "string" ? error : "Non-Error exception captured",
  );
};

const applyCaptureContext = (
  scope: Sentry.Scope,
  context?: CaptureContextInput,
) => {
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

export const captureException = (
  error: unknown,
  context?: CaptureContextInput,
) => {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  Sentry.withScope((scope) => {
    applyCaptureContext(scope, context);
    Sentry.captureException(normalizeError(error));
  });
};

export const captureMessage = (
  message: string,
  context?: CaptureContextInput,
) => {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  Sentry.withScope((scope) => {
    applyCaptureContext(scope, context);
    Sentry.captureMessage(message);
  });
};

export const flushSentry = async (timeoutMs = 2000) => {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  await Sentry.flush(timeoutMs);
};
"use client";

import * as Sentry from "@sentry/nextjs";

type TelemetryLevel = "fatal" | "error" | "warning" | "info" | "debug";
export type ErrorFamily =
  | "validation"
  | "dependency"
  | "storage"
  | "template_source"
  | "generation"
  | "signing"
  | "notarization"
  | "review"
  | "auth"
  | "internal";

export type ClientTelemetryContext = {
  level?: TelemetryLevel;
  tags?: Record<string, string | number | boolean | null | undefined>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, Record<string, unknown>>;
  fingerprint?: string[];
};

export type DomainTelemetryContext = ClientTelemetryContext & {
  operation: string;
  errorCode: string;
  errorFamily: ErrorFamily;
  requestId?: string | null;
};

type FeatureBreadcrumbInput = {
  feature: string;
  action: string;
  level?: "info" | "warning" | "error";
  data?: Record<string, unknown>;
};

const MAX_BREADCRUMB_STRING_LENGTH = 400;
const REDACTED = "[redacted]";
const sensitiveKeyPattern =
  /(authorization|cookie|email|phone|token|secret|password|signature|seal|dataurl|typedvalue|code|address|ssn|taxid|ein|birth|dob|fullname|firstname|lastname|partyname|principalname|agentname|requesteremail|requesterphone|membername|notaryname)/i;

const normalizeKey = (key: string) => key.replace(/[^a-z0-9]/gi, "").toLowerCase();

const sanitizeTelemetryValue = (value: unknown, key = "metadata", depth = 0): unknown => {
  if (sensitiveKeyPattern.test(normalizeKey(key))) {
    return REDACTED;
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    if (/^data:/i.test(value) || value.length > 2000) {
      return `[redacted large string: ${value.length} chars]`;
    }

    if (value.length > MAX_BREADCRUMB_STRING_LENGTH) {
      return `${value.slice(0, MAX_BREADCRUMB_STRING_LENGTH)}... [truncated ${value.length - MAX_BREADCRUMB_STRING_LENGTH} chars]`;
    }

    return value;
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (depth >= 4) {
    return Array.isArray(value)
      ? { truncated: true, itemCount: value.length }
      : { truncated: true, keys: Object.keys(value).slice(0, 40) };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry, index) =>
      sanitizeTelemetryValue(entry, `${key}.${index}`, depth + 1),
    );
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 50)
      .map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeTelemetryValue(entryValue, entryKey, depth + 1),
      ]),
  );
};

export const sanitizeTelemetryData = (data: Record<string, unknown>) => {
  return sanitizeTelemetryValue(data) as Record<string, unknown>;
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

export const getResponseRequestId = (response: Response | null | undefined) => {
  return response?.headers.get("x-request-id") ?? null;
};

export const addFeatureBreadcrumb = (input: FeatureBreadcrumbInput) => {
  Sentry.addBreadcrumb({
    category: `web.${input.feature}`,
    message: input.action,
    level: input.level ?? "info",
    data: input.data ? sanitizeTelemetryData(input.data) : undefined,
  });
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

export const buildDomainTelemetryCaptureContext = (
  error: unknown,
  context: DomainTelemetryContext,
): ClientTelemetryContext => {
  return {
    ...context,
    tags: {
      service: "web",
      operation: context.operation,
      error_code: context.errorCode,
      error_family: context.errorFamily,
      ...(context.requestId ? { request_id: context.requestId } : {}),
      ...context.tags,
    },
    contexts: {
      error: {
        code: context.errorCode,
        family: context.errorFamily,
        name: error instanceof Error ? error.name : "Error",
      },
      ...context.contexts,
    },
    fingerprint: context.fingerprint ?? [
      "web",
      context.errorFamily,
      context.errorCode,
      context.operation,
    ],
  };
};

export const captureDomainException = (
  error: unknown,
  context: DomainTelemetryContext,
) => {
  captureAppException(error, buildDomainTelemetryCaptureContext(error, context));
};

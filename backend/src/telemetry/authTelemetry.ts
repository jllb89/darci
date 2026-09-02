import { createHash } from "node:crypto";
import { captureMessage, type CaptureLevel } from "../utils/sentry";

type SafeTelemetryScalar = string | number | boolean | null;

export type AuthTelemetryInput = {
  area: "credentials" | "email_otp" | "phone_otp" | "session" | "token";
  operation: string;
  reason: string;
  level?: CaptureLevel;
  requestId?: string | null | undefined;
  method?: string | null | undefined;
  path?: string | null | undefined;
  statusCode?: number | null | undefined;
  provider?: string | null | undefined;
  identifier?: string | null | undefined;
  error?: unknown;
  details?: Record<string, SafeTelemetryScalar | undefined>;
};

const sensitiveKeyPattern = /(authorization|cookie|email|phone|token|secret|password|code|otp)/i;
const emailValuePattern = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const phoneValuePattern = /\+?\d[\d\s().-]{7,}\d/;

const hashIdentifier = (value: string) =>
  createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 16);

const normalizePath = (path?: string | null) => {
  if (!path) {
    return null;
  }

  return path
    .split("?")[0]
    ?.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":uuid")
    .replace(/\b[A-Z0-9]{12}\b/g, ":idn")
    .slice(0, 180) ?? null;
};

const getSafeErrorFields = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return {
      errorName: error instanceof Error ? error.name : null,
      errorCode: null,
    };
  }

  const record = error as Record<string, unknown>;
  const errorName = error instanceof Error
    ? error.name
    : typeof record.name === "string"
      ? record.name
      : null;
  const rawCode = record.code ?? record.statusCode ?? record.status;
  const errorCode = typeof rawCode === "string" || typeof rawCode === "number"
    ? String(rawCode).slice(0, 80)
    : null;

  return { errorName, errorCode };
};

const sanitizeDetails = (
  details: AuthTelemetryInput["details"],
): Record<string, SafeTelemetryScalar> => {
  const safe: Record<string, SafeTelemetryScalar> = {};

  for (const [key, value] of Object.entries(details ?? {})) {
    if (value === undefined || sensitiveKeyPattern.test(key)) {
      continue;
    }

    if (typeof value === "string") {
      if (emailValuePattern.test(value) || phoneValuePattern.test(value)) {
        continue;
      }
      safe[key] = value.slice(0, 180);
      continue;
    }

    safe[key] = value;
  }

  return safe;
};

export const buildAuthTelemetryEvent = (input: AuthTelemetryInput) => {
  const { errorName, errorCode } = getSafeErrorFields(input.error);
  const normalizedPath = normalizePath(input.path);
  const identifierHash = input.identifier ? hashIdentifier(input.identifier) : null;
  const eventName = `auth.${input.area}.${input.operation}.${input.reason}`;

  return {
    eventName,
    context: {
      level: input.level ?? "warning",
      tags: {
        service: "backend",
        telemetry_area: "auth",
        auth_area: input.area,
        auth_operation: input.operation,
        auth_reason: input.reason,
        ...(input.requestId ? { request_id: input.requestId } : {}),
        ...(input.statusCode ? { http_status: input.statusCode } : {}),
        ...(input.provider ? { auth_provider: input.provider } : {}),
        ...(errorName ? { error_name: errorName } : {}),
        ...(errorCode ? { provider_error_code: errorCode } : {}),
      },
      contexts: {
        auth: {
          requestId: input.requestId ?? null,
          method: input.method ?? null,
          path: normalizedPath,
          statusCode: input.statusCode ?? null,
          provider: input.provider ?? null,
          identifierHash,
          errorName,
          errorCode,
          ...sanitizeDetails(input.details),
        },
      },
      fingerprint: ["auth", input.area, input.operation, input.reason],
    },
  };
};

export const reportAuthIssue = (input: AuthTelemetryInput) => {
  const event = buildAuthTelemetryEvent(input);
  captureMessage(event.eventName, event.context);
};

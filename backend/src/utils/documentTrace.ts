import * as Sentry from "@sentry/node";

const MAX_BREADCRUMB_DEPTH = 4;
const MAX_BREADCRUMB_ARRAY_ITEMS = 20;
const MAX_BREADCRUMB_OBJECT_KEYS = 60;
const MAX_BREADCRUMB_STRING_LENGTH = 400;
const REDACTED = "[redacted]";

const sensitiveKeyPattern =
  /(authorization|cookie|email|phone|token|secret|password|signature|seal|dataurl|typedvalue|code|address|ssn|taxid|ein|birth|dob|fullname|firstname|lastname|partyname|principalname|agentname|requesteremail|requesterphone)/i;
const sensitiveContainerKeys = new Set([
  "canonicalanswers",
  "placeholders",
  "payload",
  "rawclaims",
]);

const stringifyTraceMetadata = (metadata: Record<string, unknown>) => {
  try {
    return JSON.stringify(metadata, null, 2);
  } catch (error) {
    return JSON.stringify(
      {
        serializationError: true,
        message:
          error instanceof Error
            ? error.message
            : "Failed to serialize document trace metadata.",
      },
      null,
      2,
    );
  }
};

const normalizeKey = (key: string) => key.replace(/[^a-z0-9]/gi, "").toLowerCase();

const shouldRedactKey = (key: string) => sensitiveKeyPattern.test(normalizeKey(key));

const summarizeSensitiveContainer = (value: unknown) => {
  if (!value || typeof value !== "object") {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return {
      redacted: true,
      itemCount: value.length,
    };
  }

  return {
    redacted: true,
    keys: Object.keys(value as Record<string, unknown>).slice(0, MAX_BREADCRUMB_OBJECT_KEYS),
  };
};

const truncateString = (value: string) => {
  if (value.length <= MAX_BREADCRUMB_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_BREADCRUMB_STRING_LENGTH)}... [truncated ${value.length - MAX_BREADCRUMB_STRING_LENGTH} chars]`;
};

const sanitizeBreadcrumbValue = (
  value: unknown,
  input: {
    key: string;
    depth: number;
    seen: WeakSet<object>;
  },
): unknown => {
  const normalizedKey = normalizeKey(input.key);

  if (shouldRedactKey(input.key)) {
    return REDACTED;
  }

  if (sensitiveContainerKeys.has(normalizedKey)) {
    return summarizeSensitiveContainer(value);
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

    return truncateString(value);
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (input.seen.has(value)) {
    return "[circular]";
  }

  if (input.depth >= MAX_BREADCRUMB_DEPTH) {
    return Array.isArray(value)
      ? { truncated: true, itemCount: value.length }
      : { truncated: true, keys: Object.keys(value).slice(0, MAX_BREADCRUMB_OBJECT_KEYS) };
  }

  input.seen.add(value);

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_BREADCRUMB_ARRAY_ITEMS).map((entry, index) =>
      sanitizeBreadcrumbValue(entry, {
        key: `${input.key}.${index}`,
        depth: input.depth + 1,
        seen: input.seen,
      }),
    );

    if (value.length > MAX_BREADCRUMB_ARRAY_ITEMS) {
      items.push({ truncatedItems: value.length - MAX_BREADCRUMB_ARRAY_ITEMS });
    }

    return items;
  }

  const sanitized: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>).slice(
    0,
    MAX_BREADCRUMB_OBJECT_KEYS,
  );

  for (const [key, entryValue] of entries) {
    sanitized[key] = sanitizeBreadcrumbValue(entryValue, {
      key,
      depth: input.depth + 1,
      seen: input.seen,
    });
  }

  const totalKeys = Object.keys(value).length;
  if (totalKeys > MAX_BREADCRUMB_OBJECT_KEYS) {
    sanitized.truncatedKeys = totalKeys - MAX_BREADCRUMB_OBJECT_KEYS;
  }

  return sanitized;
};

export const sanitizeTraceMetadataForBreadcrumb = (
  metadata: Record<string, unknown>,
) => {
  return sanitizeBreadcrumbValue(metadata, {
    key: "metadata",
    depth: 0,
    seen: new WeakSet<object>(),
  }) as Record<string, unknown>;
};

const resolveBreadcrumbLevel = (stage: string): "error" | "warning" | "info" => {
  const normalizedStage = stage.toLowerCase();
  if (
    normalizedStage.includes("failed") ||
    normalizedStage.includes("error") ||
    normalizedStage.includes("unavailable")
  ) {
    return "error";
  }

  if (
    normalizedStage.includes("blocked") ||
    normalizedStage.includes("deferred") ||
    normalizedStage.includes("repaired")
  ) {
    return "warning";
  }

  return "info";
};

export const buildDocumentTraceBreadcrumb = (
  stage: string,
  metadata: Record<string, unknown>,
) => {
  return {
    category: "document_trace",
    message: stage,
    level: resolveBreadcrumbLevel(stage),
    data: sanitizeTraceMetadataForBreadcrumb(metadata),
  };
};

const addDocumentTraceBreadcrumb = (
  stage: string,
  metadata: Record<string, unknown>,
) => {
  Sentry.addBreadcrumb(buildDocumentTraceBreadcrumb(stage, metadata));
};

export const logDocumentTrace = (
  stage: string,
  metadata: Record<string, unknown>,
) => {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  addDocumentTraceBreadcrumb(stage, metadata);
  console.info(`[document-trace] ${stage}\n${stringifyTraceMetadata(metadata)}`);
};
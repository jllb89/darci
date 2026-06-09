import * as Sentry from "@sentry/node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

let otelSdk: NodeSDK | null = null;

const usesAutoInstrumentation = (process.env.NODE_OPTIONS ?? "").includes(
  "@opentelemetry/auto-instrumentations-node/register"
);

const usesExternalOtel = Boolean(
  usesAutoInstrumentation ||
    process.env.OTEL_TRACES_EXPORTER ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT
);

const isValidHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const parseSampleRate = (raw: string | undefined, fallback: number) => {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (parsed < 0 || parsed > 1) {
    return fallback;
  }

  return parsed;
};

const normalizeOtelEndpoint = (raw: string) => {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    if (parsed.pathname === "/" || parsed.pathname.length === 0) {
      parsed.pathname = "/v1/traces";
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

const parseOtelHeaders = (raw?: string): Record<string, string> | undefined => {
  if (!raw) {
    return undefined;
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const [key, ...valueParts] = entry.split("=");
      const value = valueParts.join("=");
      if (key && value) {
        acc[key.trim()] = value.trim();
      }
      return acc;
    }, {});
};

export const initTelemetry = async () => {
  const sentryDsn = process.env.SENTRY_DSN;
  const serviceName = process.env.SERVICE_NAME ?? "backend";

  if (sentryDsn && !isValidHttpUrl(sentryDsn)) {
    console.warn("[telemetry] SENTRY_DSN is set but not a valid URL; skipping Sentry init.");
  }

  if (sentryDsn) {
    const environment =
      process.env.SENTRY_ENVIRONMENT ??
      process.env.APP_ENV ??
      process.env.NODE_ENV ??
      "development";
    const release =
      process.env.SENTRY_RELEASE ??
      process.env.GIT_SHA ??
      process.env.GITHUB_SHA ??
      process.env.IMAGE_TAG;
    const sentryOptions: Sentry.NodeOptions = {
      dsn: sentryDsn,
      environment,
      skipOpenTelemetrySetup: usesExternalOtel,
      enabled: process.env.SENTRY_ENABLED !== "false",
      initialScope: {
        tags: {
          app_env: process.env.APP_ENV ?? environment,
          service: serviceName,
          runtime: "node",
        },
      },
    };

    if (release) {
      sentryOptions.release = release;
    }

    if (!usesExternalOtel) {
      sentryOptions.tracesSampleRate = parseSampleRate(
        process.env.SENTRY_TRACES_SAMPLE_RATE,
        0.1,
      );
    }

    if (isValidHttpUrl(sentryDsn)) {
      Sentry.init(sentryOptions);
      Sentry.captureMessage("telemetry.startup", {
        level: "info",
        tags: {
          event_type: "service_startup",
          service: serviceName,
          telemetry_component: "sentry",
        },
        extra: {
          release: sentryOptions.release ?? null,
          environment,
          tracesSampleRate: sentryOptions.tracesSampleRate ?? null,
        },
      });

      if (!release) {
        console.warn("[telemetry] Sentry release is not set (SENTRY_RELEASE/GIT_SHA/IMAGE_TAG).");
      }
    }
  }

  const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (otelEndpoint && !usesAutoInstrumentation) {
    const normalizedOtelEndpoint = normalizeOtelEndpoint(otelEndpoint);
    if (!normalizedOtelEndpoint) {
      console.warn("[telemetry] OTEL_EXPORTER_OTLP_ENDPOINT is invalid; skipping OpenTelemetry SDK init.");
      return;
    }

    const headers = parseOtelHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);
    const exporterOptions: { url: string; headers?: Record<string, string> } = {
      url: normalizedOtelEndpoint,
    };

    if (headers) {
      exporterOptions.headers = headers;
    }

    const exporter = new OTLPTraceExporter(exporterOptions);

    otelSdk = new NodeSDK({
      traceExporter: exporter,
      instrumentations: [getNodeAutoInstrumentations()],
    });

    try {
      await otelSdk.start();
    } catch (error) {
      console.warn("[telemetry] OpenTelemetry SDK failed to start; continuing without OTEL exporter.", {
        message: error instanceof Error ? error.message : "unknown",
      });
      otelSdk = null;
      return;
    }

    const shutdown = async () => {
      await otelSdk?.shutdown();
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
};

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
  if (sentryDsn) {
    const sentryOptions: Sentry.NodeOptions = {
      dsn: sentryDsn,
      environment: process.env.NODE_ENV ?? "development",
      skipOpenTelemetrySetup: usesExternalOtel,
    };

    if (!usesExternalOtel) {
      sentryOptions.tracesSampleRate = Number(
        process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1
      );
    }

    Sentry.init(sentryOptions);
  }

  const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (otelEndpoint && !usesAutoInstrumentation) {
    const headers = parseOtelHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);
    const exporterOptions: { url: string; headers?: Record<string, string> } = {
      url: otelEndpoint,
    };

    if (headers) {
      exporterOptions.headers = headers;
    }

    const exporter = new OTLPTraceExporter(exporterOptions);

    otelSdk = new NodeSDK({
      traceExporter: exporter,
      instrumentations: [getNodeAutoInstrumentations()],
    });

    await otelSdk.start();

    const shutdown = async () => {
      await otelSdk?.shutdown();
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
};

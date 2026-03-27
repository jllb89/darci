"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.initTelemetry = void 0;
const Sentry = __importStar(require("@sentry/node"));
const sdk_node_1 = require("@opentelemetry/sdk-node");
const auto_instrumentations_node_1 = require("@opentelemetry/auto-instrumentations-node");
const exporter_trace_otlp_http_1 = require("@opentelemetry/exporter-trace-otlp-http");
let otelSdk = null;
const usesAutoInstrumentation = (process.env.NODE_OPTIONS ?? "").includes("@opentelemetry/auto-instrumentations-node/register");
const usesExternalOtel = Boolean(usesAutoInstrumentation ||
    process.env.OTEL_TRACES_EXPORTER ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
const parseOtelHeaders = (raw) => {
    if (!raw) {
        return undefined;
    }
    return raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .reduce((acc, entry) => {
        const [key, ...valueParts] = entry.split("=");
        const value = valueParts.join("=");
        if (key && value) {
            acc[key.trim()] = value.trim();
        }
        return acc;
    }, {});
};
const initTelemetry = async () => {
    const sentryDsn = process.env.SENTRY_DSN;
    if (sentryDsn) {
        const sentryOptions = {
            dsn: sentryDsn,
            environment: process.env.NODE_ENV ?? "development",
            skipOpenTelemetrySetup: usesExternalOtel,
        };
        if (!usesExternalOtel) {
            sentryOptions.tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1);
        }
        Sentry.init(sentryOptions);
    }
    const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (otelEndpoint && !usesAutoInstrumentation) {
        const headers = parseOtelHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);
        const exporterOptions = {
            url: otelEndpoint,
        };
        if (headers) {
            exporterOptions.headers = headers;
        }
        const exporter = new exporter_trace_otlp_http_1.OTLPTraceExporter(exporterOptions);
        otelSdk = new sdk_node_1.NodeSDK({
            traceExporter: exporter,
            instrumentations: [(0, auto_instrumentations_node_1.getNodeAutoInstrumentations)()],
        });
        await otelSdk.start();
        const shutdown = async () => {
            await otelSdk?.shutdown();
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
    }
};
exports.initTelemetry = initTelemetry;
//# sourceMappingURL=index.js.map
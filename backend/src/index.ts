import "./instrument";
import express, { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import * as Sentry from "@sentry/node";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { requireAuth } from "./middleware/auth";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import documentsRoutes from "./routes/documents";
import internalRoutes from "./routes/internal";
import invitesRoutes from "./routes/invites";
import notaryRoutes from "./routes/notary";
import notificationsRoutes from "./routes/notifications";
import ledgerRoutes from "./routes/ledger";
import requestsRoutes from "./routes/requests";
import verificationRoutes from "./routes/verification";
import verifyRoutes from "./routes/verify";
import webhooksRoutes from "./routes/webhooks";
import dashboardRoutes from "./routes/dashboard";
import rulesRoutes from "./routes/rules";
import usersRoutes from "./routes/users";

export const app = express();
const isDevelopment = process.env.NODE_ENV !== "production";

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : []),
];

const getHeaderValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value.find((entry) => entry.trim().length > 0)?.trim() ?? null;
  }

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

const resolveRequestId = (req: Request) => {
  return (
    req.requestId ??
    getHeaderValue(req.headers["x-request-id"]) ??
    getHeaderValue(req.headers["x-amzn-trace-id"]) ??
    randomUUID()
  );
};

const getAuthOtpIngressRequestId = (req: Request) => {
  if (req.authOtpRequestId) {
    return req.authOtpRequestId;
  }

  const requestId = resolveRequestId(req);
  req.requestId = requestId;
  req.authOtpRequestId = requestId;
  req.headers["x-request-id"] = requestId;
  return requestId;
};

const logAuthOtpIngressEvent = (event: string, metadata: Record<string, unknown>) => {
  console.info("[auth.email_otp.ingress]", {
    component: "auth.email_otp.ingress",
    event,
    ...metadata,
  });
};

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-CSRF-Token",
      "X-Request-Id",
      "X-Request-Signature",
    ],
    exposedHeaders: ["X-DARCI-Auth-Otp-Logger", "X-DARCI-Auth-Otp-Trace-Id", "X-Request-Id"],
  })
);

app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = resolveRequestId(req);
  req.requestId = requestId;
  req.authOtpRequestId = req.authOtpRequestId ?? requestId;
  req.headers["x-request-id"] = requestId;
  res.setHeader("X-Request-Id", requestId);

  Sentry.setTag("request_id", requestId);
  Sentry.setContext("request", {
    requestId,
    method: req.method,
    path: req.originalUrl,
  });

  next();
});

app.use("/webhooks", webhooksRoutes);

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path !== "/auth/otp/start") {
    next();
    return;
  }

  const requestId = getAuthOtpIngressRequestId(req);
  const startedAt = Date.now();

  res.setHeader("X-DARCI-Auth-Otp-Logger", "ingress-v1");
  res.setHeader("X-DARCI-Auth-Otp-Trace-Id", requestId);

  logAuthOtpIngressEvent("request_seen", {
    requestId,
    method: req.method,
    path: req.originalUrl,
    origin: getHeaderValue(req.headers.origin),
    contentType: getHeaderValue(req.headers["content-type"]),
    contentLength: getHeaderValue(req.headers["content-length"]),
  });

  res.on("finish", () => {
    logAuthOtpIngressEvent("response_finished", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
});

app.use(express.json({ limit: "3mb" }));

if (isDevelopment) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();

    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      console.log(
        `[api] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${durationMs}ms`
      );
    });

    next();
  });
}

const openapiPath = [
  process.env.OPENAPI_PATH,
  path.resolve(__dirname, "../../api/openapi.yaml"),
  path.resolve(process.cwd(), "api/openapi.yaml"),
].find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));

if (!openapiPath) {
  throw new Error("OpenAPI spec not found. Set OPENAPI_PATH or include api/openapi.yaml in the runtime image.");
}

const openapiSpec = YAML.load(openapiPath);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));
app.get("/openapi.yaml", (_req: Request, res: Response) => {
  res.sendFile(openapiPath);
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

if (process.env.ENABLE_SENTRY_DEBUG_ROUTE === "true") {
  app.get("/debug-sentry", (_req: Request, _res: Response) => {
    throw new Error("Sentry debug error");
  });
}

app.use(requireAuth);

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/users", usersRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/rules", rulesRoutes);
app.use("/internal", internalRoutes);
app.use("/invites", invitesRoutes);
app.use("/documents", documentsRoutes);
app.use("/requests", requestsRoutes);
app.use("/verification", verificationRoutes);
app.use("/notary", notaryRoutes);
app.use("/notifications", notificationsRoutes);
app.use("/ledger", ledgerRoutes);
app.use("/verify", verifyRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: "not_found",
    message: "Route not found",
  });
});

if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled API error", {
    method: req.method,
    path: req.path,
    statusCode: 500,
    message: err.message,
    stack: err.stack,
  });

  res.status(500).json({ error: "internal_error", message: err.message });
});

if (require.main === module) {
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  app.listen(port, () => {
    console.log(
      `DARCI API listening on ${port} (pid ${process.pid}, env ${process.env.NODE_ENV ?? "development"})`
    );
  });
}

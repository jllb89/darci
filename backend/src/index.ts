import "./instrument";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import * as Sentry from "@sentry/node";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { requireAuth } from "./middleware/auth";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import documentsRoutes from "./routes/documents";
import notaryRoutes from "./routes/notary";
import ledgerRoutes from "./routes/ledger";
import verifyRoutes from "./routes/verify";
import dashboardRoutes from "./routes/dashboard";
import { getMe } from "./controllers/usersController";

export const app = express();
const isDevelopment = process.env.NODE_ENV !== "production";

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

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

const openapiPath = path.resolve(__dirname, "../../api/openapi.yaml");
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
app.get("/users/me", getMe);
app.use("/dashboard", dashboardRoutes);
app.use("/documents", documentsRoutes);
app.use("/notary", notaryRoutes);
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

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
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

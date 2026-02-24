import express, { Request, Response, NextFunction } from "express";
import path from "path";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import authRoutes from "./routes/auth";
import documentsRoutes from "./routes/documents";
import notaryRoutes from "./routes/notary";
import ledgerRoutes from "./routes/ledger";
import verifyRoutes from "./routes/verify";
import { getMe } from "./controllers/usersController";

export const app = express();

app.use(express.json());

const openapiPath = path.resolve(process.cwd(), "../api/openapi.yaml");
const openapiSpec = YAML.load(openapiPath);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));
app.get("/openapi.yaml", (_req: Request, res: Response) => {
  res.sendFile(openapiPath);
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.get("/users/me", getMe);
app.use("/documents", documentsRoutes);
app.use("/notary", notaryRoutes);
app.use("/ledger", ledgerRoutes);
app.use("/verify", verifyRoutes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: "internal_error", message: err.message });
});

if (require.main === module) {
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  app.listen(port, () => {
    console.log(`DARCI API listening on ${port}`);
  });
}

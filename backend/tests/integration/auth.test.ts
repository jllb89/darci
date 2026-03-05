import request from "supertest";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { app } from "../../src/index";

type TokenPayload = {
  sub: string;
  email?: string;
  role?: string;
  app_metadata?: { role?: string };
};

const signToken = (payload: TokenPayload) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
};

describe("auth middleware", () => {
  it("rejects requests without a token", async () => {
    const response = await request(app).get("/documents");
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("unauthorized");
  });

  it("rejects requests with invalid role", async () => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .post("/notary/requests/req-1/sign")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("forbidden");
  });

  it("allows notary role for notary endpoints", async () => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    const token = signToken({
      sub: "notary-1",
      app_metadata: { role: "notary" },
    });

    const response = await request(app)
      .post("/notary/requests/req-1/sign")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
  });
});

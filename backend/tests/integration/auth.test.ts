import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireNoNetwork } from "../helpers/noNetwork";

requireNoNetwork();

vi.mock("../../src/services/userRoleService", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/services/userRoleService")>(),
  getUserIdentityContextBySupabaseId: vi.fn(async (id: string) => {
    const role = id === "notary-1" ? "notary" : id === "user-1" ? "member" : null;
    return role ? {
      id: `db-${id}`, supabaseUserId: id, email: null, phone: null,
      role, status: "active", availableRoles: [role], roleAssignments: [],
    } : null;
  }),
}));

const mocks = vi.hoisted(() => ({
  getNotarizationRequestByIdMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/documentService")>();
  return {
    ...actual,
    getNotarizationRequestById: mocks.getNotarizationRequestByIdMock,
  };
});

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

beforeEach(() => {
  process.env.SUPABASE_JWT_SECRET = "test-secret";
  mocks.getNotarizationRequestByIdMock.mockReset();
  mocks.getNotarizationRequestByIdMock.mockResolvedValue(null);
});

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

  it("allows notary role through notary endpoint authorization", async () => {
    const token = signToken({
      sub: "notary-1",
      app_metadata: { role: "notary" },
    });

    const response = await request(app)
      .post("/notary/requests/req-1/sign")
      .set("Authorization", `Bearer ${token}`)
      .send({
        acknowledgment: {
          signerAppeared: true,
          signerAcknowledged: true,
        },
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("not_found");
    expect(mocks.getNotarizationRequestByIdMock).toHaveBeenCalledWith("req-1");
  });

  it("uses the current database role instead of a stale notary claim", async () => {
    const token = signToken({ sub: "user-1", app_metadata: { role: "notary" } });
    const response = await request(app)
      .post("/notary/requests/req-1/sign")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(mocks.getNotarizationRequestByIdMock).not.toHaveBeenCalled();
  });
});

describe("native auth contract", () => {
  it.each([
    ["/auth/otp/start", { returnTo: "/mobile" }],
    ["/auth/otp/verify", { token: "123456", returnTo: "/mobile" }],
    ["/auth/otp/phone/start", { returnTo: "/mobile" }],
    ["/auth/otp/phone/verify", { token: "123456", returnTo: "/mobile" }],
  ])("lets %s requests without browser-only auth headers reach validation", async (path, body) => {
    const response = await request(app)
      .post(path)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
  });
});

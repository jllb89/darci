import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
}));

vi.mock("../../src/services/userRoleService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/userRoleService")>();
  return {
    ...actual,
    getUserIdentityContextBySupabaseId: mocks.getUserIdentityContextBySupabaseIdMock,
  };
});

import { app } from "../../src/index";

const signToken = (payload: { sub: string; app_metadata?: { role?: string } }) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
};

const memberToken = () => {
  return signToken({
    sub: "member-sub",
    app_metadata: { role: "member" },
  });
};

const notaryToken = () => {
  return signToken({
    sub: "notary-sub",
    app_metadata: { role: "notary" },
  });
};

const adminToken = () => {
  return signToken({
    sub: "admin-sub",
    app_metadata: { role: "admin" },
  });
};

beforeEach(() => {
  process.env.SUPABASE_JWT_SECRET = "test-secret";
  mocks.getUserIdentityContextBySupabaseIdMock.mockReset();
  mocks.getUserIdentityContextBySupabaseIdMock.mockImplementation(
    async (supabaseUserId: string) => {
      if (supabaseUserId === "notary-sub") {
        return {
          id: "notary-user-1",
          supabaseUserId,
          email: "notary@example.com",
          role: "notary",
          status: "active",
          firstName: "Nora",
          lastName: "Tary",
          availableRoles: ["notary"],
          roleAssignments: [],
        };
      }

      if (supabaseUserId === "admin-sub") {
        return {
          id: "admin-user-1",
          supabaseUserId,
          email: "admin@example.com",
          role: "admin",
          status: "active",
          firstName: "Ada",
          lastName: "Min",
          availableRoles: ["admin"],
          roleAssignments: [],
        };
      }

      return {
        id: "member-user-1",
        supabaseUserId,
        email: "member@example.com",
        role: "member",
        status: "active",
        firstName: "Mina",
        lastName: "Member",
        availableRoles: ["member"],
        roleAssignments: [],
      };
    },
  );
});

describe("placeholder compatibility endpoints", () => {
  it("returns not implemented for manual ledger anchoring", async () => {
    const response = await request(app)
      .post("/ledger/anchor")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ idn: "AB12CD34EF56", hash: "a".repeat(64) });

    expect(response.status).toBe(501);
    expect(response.body).toEqual({
      error: "not_implemented",
      message:
        "Manual ledger anchoring is not mounted on this compatibility route. Use the Phase 6 finalization flow that persists hash, anchor-attempt, and verification state together.",
    });
  });
});
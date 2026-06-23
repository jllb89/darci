import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildRoleAwareDashboardMock: vi.fn(),
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
}));

vi.mock("../../src/services/dashboardAggregationService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/dashboardAggregationService")>(
    "../../src/services/dashboardAggregationService"
  );

  return {
    ...actual,
    buildRoleAwareDashboard: mocks.buildRoleAwareDashboardMock,
  };
});

vi.mock("../../src/services/userRoleService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/userRoleService")>(
    "../../src/services/userRoleService"
  );

  return {
    ...actual,
    getUserIdentityContextBySupabaseId:
      mocks.getUserIdentityContextBySupabaseIdMock,
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

const logResponse = (label: string, response: request.Response) => {
  console.log(label, {
    status: response.status,
    body: response.body,
  });
};

const getWithLog = async (label: string, token?: string) => {
  console.log("request", { method: "GET", path: "/dashboard" });
  let req = request(app).get("/dashboard");
  if (token) {
    req = req.set("Authorization", `Bearer ${token}`);
  }
  const response = await req;
  logResponse(label, response);
  return response;
};

describe("GET /dashboard", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.buildRoleAwareDashboardMock.mockReset();
    mocks.getUserIdentityContextBySupabaseIdMock.mockReset();
    mocks.getUserIdentityContextBySupabaseIdMock.mockImplementation(
      async (supabaseUserId: string) => {
        const byId = {
          "member-1": {
            id: "member-db-1",
            supabaseUserId,
            email: "member@example.com",
            role: "member",
            status: "active",
            firstName: "Member",
            lastName: "User",
            availableRoles: ["member"],
            roleAssignments: [],
          },
          "pro-1": {
            id: "pro-db-1",
            supabaseUserId,
            email: "pro@example.com",
            role: "pro",
            status: "active",
            firstName: "Pro",
            lastName: "User",
            availableRoles: ["member", "pro"],
            roleAssignments: [],
          },
          "notary-1": {
            id: "notary-db-1",
            supabaseUserId,
            email: "notary@example.com",
            role: "notary",
            status: "active",
            firstName: "Notary",
            lastName: "User",
            availableRoles: ["notary"],
            roleAssignments: [],
          },
          "admin-1": {
            id: "admin-db-1",
            supabaseUserId,
            email: "admin@example.com",
            role: "admin",
            status: "active",
            firstName: "Admin",
            lastName: "User",
            availableRoles: ["admin"],
            roleAssignments: [],
          },
        } as const;

        return byId[supabaseUserId as keyof typeof byId] ?? null;
      }
    );
  });

  it("requires auth", async () => {
    const response = await getWithLog("requires auth");

    expect(response.status).toBe(401);
  });

  it("returns the member dashboard payload for member role", async () => {
    mocks.buildRoleAwareDashboardMock.mockResolvedValue({
      role: "member",
      metrics: [
        { key: "in-progress", label: "In progress", value: 3 },
        { key: "awaiting-notary", label: "Awaiting notary", value: 1 },
        { key: "completed", label: "Completed", value: 2 },
      ],
      documents: [],
      requests: [],
      meetings: [],
      activity: [],
      alerts: [],
      nextAction: null,
    });

    const response = await getWithLog(
      "returns member dashboard",
      signToken({ sub: "member-1", app_metadata: { role: "member" } })
    );

    expect(response.status).toBe(200);
    expect(response.body.role).toBe("member");
    expect(mocks.buildRoleAwareDashboardMock).toHaveBeenCalledWith({
      supabaseUserId: "member-1",
      email: "member@example.com",
      role: "member",
    });
  });

  it("returns the role-aware dashboard payload for pro role", async () => {
    mocks.buildRoleAwareDashboardMock.mockResolvedValue({
      role: "pro",
      metrics: [
        { key: "in-progress", label: "Client work in progress", value: 5 },
      ],
      documents: [],
      requests: [],
      meetings: [],
      activity: [],
      alerts: [],
      nextAction: null,
    });

    const response = await getWithLog(
      "returns pro dashboard",
      signToken({ sub: "pro-1", app_metadata: { role: "pro" } })
    );

    expect(response.status).toBe(200);
    expect(response.body.role).toBe("pro");
    expect(mocks.buildRoleAwareDashboardMock).toHaveBeenCalledWith({
      supabaseUserId: "pro-1",
      email: "pro@example.com",
      role: "pro",
    });
  });

  it("returns the role-aware dashboard payload for notary role", async () => {
    mocks.buildRoleAwareDashboardMock.mockResolvedValue({
      role: "notary",
      metrics: [
        { key: "pending-review", label: "Pending review", value: 4 },
      ],
      documents: [],
      requests: [
        {
          id: "req-1",
          documentId: "doc-1",
          documentType: "generic",
          jurisdiction: "US-OH",
          ownerId: "member-db-1",
          ownerName: "Member User",
          status: "pending",
          submittedAt: "2026-04-22T12:00:00.000Z",
          meetingId: null,
          meetingScheduledAt: null,
          meetingStatus: null,
        },
      ],
      meetings: [],
      activity: [],
      alerts: [],
      nextAction: null,
    });

    const response = await getWithLog(
      "returns notary dashboard",
      signToken({ sub: "notary-1", app_metadata: { role: "notary" } })
    );

    expect(response.status).toBe(200);
    expect(response.body.role).toBe("notary");
    expect(response.body.requests).toHaveLength(1);
  });

  it("returns the role-aware dashboard payload for admin role", async () => {
    mocks.buildRoleAwareDashboardMock.mockResolvedValue({
      role: "admin",
      metrics: [
        { key: "open-documents", label: "Open documents", value: 9 },
        { key: "audit-events-today", label: "Audit events today", value: 42 },
        { key: "verification-checks", label: "Verification checks", value: 7 },
      ],
      documents: [],
      requests: [],
      meetings: [],
      activity: [],
      alerts: [],
      nextAction:
        "Use the Ops Console to inspect audit events, compliance exceptions, and support escalations.",
    });

    const response = await getWithLog(
      "returns admin dashboard",
      signToken({ sub: "admin-1", app_metadata: { role: "admin" } })
    );

    expect(response.status).toBe(200);
    expect(response.body.role).toBe("admin");
    expect(response.body.nextAction).toContain("Ops Console");
  });

  it("forbids service_role on the user dashboard route", async () => {
    const response = await getWithLog(
      "forbids service role",
      signToken({ sub: "service-role-1", app_metadata: { role: "service_role" } })
    );

    expect(response.status).toBe(403);
    expect(mocks.buildRoleAwareDashboardMock).not.toHaveBeenCalled();
  });
});
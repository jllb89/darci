import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  if (!process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = "http://localhost";
  }

  if (!process.env.SUPABASE_ANON_KEY) {
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  }

  if (!process.env.SUPABASE_JWT_SECRET) {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
  }
});

const mocks = vi.hoisted(() => ({
  listSharedVerificationsMock: vi.fn(),
  getSharedVerificationDetailMock: vi.fn(),
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
}));

vi.mock("../../src/services/verificationReadModelService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/verificationReadModelService")>(
    "../../src/services/verificationReadModelService",
  );

  return {
    ...actual,
    listSharedVerifications: mocks.listSharedVerificationsMock,
    getSharedVerificationDetail: mocks.getSharedVerificationDetailMock,
  };
});

vi.mock("../../src/services/userRoleService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/userRoleService")>(
    "../../src/services/userRoleService",
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

const getWithLog = async (path: string, label: string, token?: string) => {
  console.log("request", { method: "GET", path });
  let req = request(app).get(path);
  if (token) {
    req = req.set("Authorization", `Bearer ${token}`);
  }
  const response = await req;
  console.log(label, {
    status: response.status,
    body: response.body,
  });
  return response;
};

describe("GET verification endpoints", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.listSharedVerificationsMock.mockReset();
    mocks.getSharedVerificationDetailMock.mockReset();
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
        } as const;

        return byId[supabaseUserId as keyof typeof byId] ?? null;
      },
    );
  });

  it("requires auth for verification routes", async () => {
    const response = await getWithLog("/verification", "requires auth");

    expect(response.status).toBe(401);
  });

  it("lists shared verification results", async () => {
    mocks.listSharedVerificationsMock.mockResolvedValue([
      {
        idn: "IDN-1234567890",
        documentId: "doc-1",
        status: "verified",
        documentStatus: "completed",
        documentType: "power_of_attorney",
        jurisdiction: "US-CA",
        owner: {
          userId: "member-db-1",
          supabaseUserId: "member-1",
          displayName: "Member User",
          fullName: "Member User",
          email: "member@example.com",
          role: "member",
          status: "active",
        },
        notary: null,
        anchoredAt: "2026-04-22T12:00:00.000Z",
        lastCheckedAt: "2026-04-22T12:30:00.000Z",
        publicVerifyPath: "/verify/IDN-1234567890",
      },
    ]);

    const response = await getWithLog(
      "/verification?status=verified&limit=25&offset=5",
      "lists verification results",
      signToken({ sub: "member-1", app_metadata: { role: "member" } }),
    );

    expect(response.status).toBe(200);
    expect(response.body.verifications).toHaveLength(1);
    expect(mocks.listSharedVerificationsMock).toHaveBeenCalledWith({
      role: "member",
      viewerUserId: "member-db-1",
      idn: null,
      status: "verified",
      limit: 25,
      offset: 5,
    });
  });

  it("gets a shared verification detail payload", async () => {
    mocks.getSharedVerificationDetailMock.mockResolvedValue({
      verification: {
        idn: "IDN-1234567890",
        documentId: "doc-1",
        documentStatus: "completed",
        documentType: "power_of_attorney",
        jurisdiction: "US-CA",
        hash: "hash-value",
        ledgerTxId: "tx-1",
        anchoredAt: "2026-04-22T12:00:00.000Z",
        status: "verified",
        lastCheckedAt: "2026-04-22T12:30:00.000Z",
        publicVerifyPath: "/verify/IDN-1234567890",
      },
      request: {
        id: "req-1",
        documentId: "doc-1",
        workflowId: "wf-1",
        status: "completed",
        submittedAt: "2026-04-22T10:00:00.000Z",
        meetingId: "meeting-1",
        meetingStatus: "completed",
        meetingScheduledAt: "2026-04-22T11:00:00.000Z",
        meetingTimezone: "America/Los_Angeles",
        meetingLocation: "San Francisco",
      },
      workflow: {
        id: "wf-1",
        status: "completed",
        latestStatus: "completed",
        latestStatusAt: "2026-04-22T12:10:00.000Z",
        reviewStartedAt: "2026-04-22T10:10:00.000Z",
        closedAt: "2026-04-22T12:10:00.000Z",
        selectedNotaryUserId: "notary-db-1",
        assignedNotaryUserId: "notary-db-1",
        lastCodeGeneratedAt: "2026-04-22T10:05:00.000Z",
      },
      latestCodeDelivery: {
        id: "code-1",
        channel: "email",
        deliveryMethod: "notification_outbox",
        deliveryReason: "initial_submit",
        status: "delivered",
        expiresAt: "2026-04-23T10:05:00.000Z",
        deliveredAt: "2026-04-22T10:05:00.000Z",
        consumedAt: null,
        invalidatedAt: null,
        createdAt: "2026-04-22T10:05:00.000Z",
      },
      latestCheck: {
        id: "check-1",
        resultStatus: "verified",
        createdAt: "2026-04-22T12:30:00.000Z",
      },
      anchorAttempt: {
        id: "anchor-1",
        status: "anchored",
        attemptNumber: 1,
        requestedAt: "2026-04-22T12:00:00.000Z",
        completedAt: "2026-04-22T12:00:00.000Z",
        failedAt: null,
        errorMessage: null,
      },
      owner: {
        userId: "member-db-1",
        supabaseUserId: "member-1",
        displayName: "Member User",
        fullName: "Member User",
        email: "member@example.com",
        role: "member",
        status: "active",
      },
      notary: null,
      documents: [
        {
          id: "doc-1",
          idn: "IDN-1234567890",
          status: "completed",
          documentType: "power_of_attorney",
          jurisdiction: "US-CA",
          createdAt: "2026-04-22T09:00:00.000Z",
          publicVerifyPath: "/verify/IDN-1234567890",
        },
      ],
      audit: [
        {
          id: "audit-1",
          action: "public.verification_requested",
          message: "Public Verification Requested",
          timestamp: "2026-04-22T12:30:00.000Z",
          actorId: null,
        },
      ],
    });

    const response = await getWithLog(
      "/verification/IDN-1234567890",
      "gets verification detail",
      signToken({ sub: "member-1", app_metadata: { role: "member" } }),
    );

    expect(response.status).toBe(200);
    expect(response.body.verification.idn).toBe("IDN-1234567890");
    expect(response.body.request.id).toBe("req-1");
    expect(response.body.workflow.id).toBe("wf-1");
    expect(response.body.latestCodeDelivery.id).toBe("code-1");
    expect(response.body.latestCheck.resultStatus).toBe("verified");
    expect(response.body.anchorAttempt.attemptNumber).toBe(1);
    expect(response.body.owner.displayName).toBe("Member User");
    expect(mocks.getSharedVerificationDetailMock).toHaveBeenCalledWith({
      idn: "IDN-1234567890",
      role: "member",
      viewerUserId: "member-db-1",
    });
  });
});
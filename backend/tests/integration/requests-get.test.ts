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
  listSharedRequestsMock: vi.fn(),
  getSharedRequestDetailMock: vi.fn(),
  getSharedRequestTimelineMock: vi.fn(),
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
}));

vi.mock("../../src/services/requestReadModelService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/requestReadModelService")>(
    "../../src/services/requestReadModelService",
  );

  return {
    ...actual,
    listSharedRequests: mocks.listSharedRequestsMock,
    getSharedRequestDetail: mocks.getSharedRequestDetailMock,
    getSharedRequestTimeline: mocks.getSharedRequestTimelineMock,
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

const logResponse = (label: string, response: request.Response) => {
  console.log(label, {
    status: response.status,
    body: response.body,
  });
};

const getWithLog = async (path: string, label: string, token?: string) => {
  console.log("request", { method: "GET", path });
  let req = request(app).get(path);
  if (token) {
    req = req.set("Authorization", `Bearer ${token}`);
  }
  const response = await req;
  logResponse(label, response);
  return response;
};

describe("GET requests endpoints", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.listSharedRequestsMock.mockReset();
    mocks.getSharedRequestDetailMock.mockReset();
    mocks.getSharedRequestTimelineMock.mockReset();
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
      },
    );
  });

  it("requires auth for request routes", async () => {
    const response = await getWithLog("/requests", "requires auth");

    expect(response.status).toBe(401);
  });

  it("lists shared requests for the current member", async () => {
    mocks.listSharedRequestsMock.mockResolvedValue([
      {
        id: "req-1",
        documentId: "doc-1",
        workflowId: "wf-1",
        status: "pending",
        submittedAt: "2026-04-22T10:00:00.000Z",
        meetingId: "meeting-1",
        meetingStatus: "scheduled",
        meetingScheduledAt: "2026-04-22T14:00:00.000Z",
        meetingTimezone: "UTC",
        meetingLocation: "Remote",
      },
    ]);

    const response = await getWithLog(
      "/requests?status=pending&limit=25&offset=5",
      "lists requests",
      signToken({ sub: "member-1", app_metadata: { role: "member" } }),
    );

    expect(response.status).toBe(200);
    expect(response.body.requests).toHaveLength(1);
    expect(mocks.listSharedRequestsMock).toHaveBeenCalledWith({
      role: "member",
      viewerUserId: "member-db-1",
      status: "pending",
      memberId: null,
      notaryId: null,
      limit: 25,
      offset: 5,
    });
  });

  it("gets a shared request detail payload", async () => {
    mocks.getSharedRequestDetailMock.mockResolvedValue({
      request: {
        id: "req-1",
        documentId: "doc-1",
        workflowId: "wf-1",
        status: "pending",
        submittedAt: "2026-04-22T10:00:00.000Z",
        meetingId: "meeting-1",
        meetingStatus: "scheduled",
        meetingScheduledAt: "2026-04-22T14:00:00.000Z",
        meetingTimezone: "UTC",
        meetingLocation: "Remote",
      },
      document: {
        id: "doc-1",
        idn: "IDN-123",
        status: "pending_notary",
        documentType: "power_of_attorney",
        jurisdiction: "US-CA",
        createdAt: "2026-04-22T09:00:00.000Z",
        productFlowMode: "poa_only",
        selectedFamilies: ["poa", "idn"],
        outputBundle: [],
        summary: {
          workflow: {
            requestId: "req-1",
            workflowId: "wf-1",
            requestStatus: "pending",
            latestWorkflowStatus: "in_review",
            latestWorkflowStatusAt: "2026-04-22T10:05:00.000Z",
            submittedAt: "2026-04-22T10:00:00.000Z",
            assignedNotaryId: "notary-db-1",
            latestCodeStatus: "delivered",
            latestCodeExpiresAt: "2026-04-22T11:00:00.000Z",
          },
          finalization: {
            latestStatus: null,
            latestStatusAt: null,
            isAnchored: false,
            isVerificationChecked: false,
          },
          verification: {
            status: "pending_finalization",
            idn: "IDN-123",
            verifyPath: "/verify/IDN-123",
          },
        },
      },
      workflow: {
        id: "wf-1",
        status: "in_review",
        latestStatus: "in_review",
        latestStatusAt: "2026-04-22T10:05:00.000Z",
        reviewStartedAt: "2026-04-22T10:05:00.000Z",
        closedAt: null,
        selectedNotaryUserId: "notary-db-1",
        assignedNotaryUserId: "notary-db-1",
        lastCodeGeneratedAt: "2026-04-22T10:01:00.000Z",
      },
      latestCodeDelivery: {
        id: "delivery-1",
        channel: "sms",
        deliveryMethod: "notification_outbox",
        deliveryReason: "initial_submit",
        status: "delivered",
        expiresAt: "2026-04-22T11:00:00.000Z",
        deliveredAt: "2026-04-22T10:02:00.000Z",
        consumedAt: null,
        invalidatedAt: null,
        createdAt: "2026-04-22T10:01:00.000Z",
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
      notary: {
        userId: "notary-db-1",
        supabaseUserId: "notary-1",
        displayName: "Notary User",
        fullName: "Notary User",
        email: "notary@example.com",
        role: "notary",
        status: "active",
      },
      meeting: null,
      capabilities: {
        canViewDocument: true,
        canViewTimeline: true,
        canManageMeeting: true,
        canReviewRequest: true,
        canFinalizeDocument: false,
        canOpenVerification: true,
      },
      warnings: [
        {
          code: "awaiting_review",
          severity: "info",
          message: "The request is currently in review.",
        },
      ],
      nextAction: "Complete the review decision to move the request forward.",
    });

    const response = await getWithLog(
      "/requests/req-1",
      "gets request detail",
      signToken({ sub: "member-1", app_metadata: { role: "member" } }),
    );

    expect(response.status).toBe(200);
    expect(response.body.request.id).toBe("req-1");
    expect(response.body.owner.displayName).toBe("Member User");
    expect(response.body.notary.displayName).toBe("Notary User");
    expect(response.body.document.summary.verification.verifyPath).toBe("/verify/IDN-123");
    expect(response.body.capabilities.canReviewRequest).toBe(true);
    expect(response.body.nextAction).toBe("Complete the review decision to move the request forward.");
    expect(mocks.getSharedRequestDetailMock).toHaveBeenCalledWith({
      requestId: "req-1",
      role: "member",
      viewerUserId: "member-db-1",
    });
  });

  it("gets a shared request timeline payload", async () => {
    mocks.getSharedRequestTimelineMock.mockResolvedValue([
      {
        action: "Document created",
        timestamp: "2026-04-22T09:00:00.000Z",
      },
      {
        action: "Notarization submitted",
        timestamp: "2026-04-22T10:00:00.000Z",
      },
    ]);

    const response = await getWithLog(
      "/requests/req-1/timeline",
      "gets request timeline",
      signToken({ sub: "member-1", app_metadata: { role: "member" } }),
    );

    expect(response.status).toBe(200);
    expect(response.body.timeline).toHaveLength(2);
    expect(mocks.getSharedRequestTimelineMock).toHaveBeenCalledWith({
      requestId: "req-1",
      role: "member",
      viewerUserId: "member-db-1",
    });
  });
});
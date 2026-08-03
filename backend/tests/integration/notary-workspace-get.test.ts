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
  listNotaryQueueMock: vi.fn(),
  getNotaryRequestContextMock: vi.fn(),
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
}));

vi.mock("../../src/services/notaryWorkspaceReadModelService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/notaryWorkspaceReadModelService")>(
    "../../src/services/notaryWorkspaceReadModelService",
  );

  return {
    ...actual,
    listNotaryQueue: mocks.listNotaryQueueMock,
    getNotaryRequestContext: mocks.getNotaryRequestContextMock,
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

const signToken = (payload: { sub: string; app_metadata?: { role?: string } }) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
};

describe("GET /notary workspace routes", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.listNotaryQueueMock.mockReset();
    mocks.getNotaryRequestContextMock.mockReset();
    mocks.getUserIdentityContextBySupabaseIdMock.mockReset();
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
      id: "notary-db-1",
      supabaseUserId: "notary-1",
      email: "notary@example.com",
      role: "notary",
      status: "active",
      firstName: "Nora",
      lastName: "Tary",
      availableRoles: ["notary"],
      roleAssignments: [],
    });
  });

  it("lists the real notary queue", async () => {
    mocks.listNotaryQueueMock.mockResolvedValue({
      requests: [
        {
          request: {
            id: "req-1",
            documentId: "doc-1",
            workflowId: "wf-1",
            status: "in_review",
            queueStatus: "approved",
            submittedAt: "2026-04-22T10:00:00.000Z",
          },
          document: {
            id: "doc-1",
            idn: "IDN-1234567890",
            status: "completed",
            documentType: "power_of_attorney",
            jurisdiction: "US-CA",
            createdAt: "2026-04-22T09:00:00.000Z",
            summary: {
              workflow: {
                requestId: "req-1",
                workflowId: "wf-1",
                requestStatus: "in_review",
                latestWorkflowStatus: "approved",
                latestWorkflowStatusAt: "2026-04-22T12:00:00.000Z",
                submittedAt: "2026-04-22T10:00:00.000Z",
                assignedNotaryId: "notary-db-1",
                latestCodeStatus: "delivered",
                latestCodeExpiresAt: "2026-04-23T10:05:00.000Z",
              },
              finalization: {
                latestStatus: "ledger_anchored",
                latestStatusAt: "2026-04-22T13:00:00.000Z",
                isAnchored: true,
                isVerificationChecked: true,
              },
              verification: {
                status: "ready",
                idn: "IDN-1234567890",
                verifyPath: "/verify/IDN-1234567890",
              },
            },
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
          workflow: {
            id: "wf-1",
            status: "submitted",
            latestStatus: "submitted",
            latestStatusAt: "2026-04-22T10:00:00.000Z",
            reviewStartedAt: null,
            closedAt: null,
            selectedNotaryUserId: "notary-db-1",
            assignedNotaryUserId: null,
            lastCodeGeneratedAt: "2026-04-22T10:05:00.000Z",
          },
          latestCodeDelivery: null,
          meeting: null,
          finalization: {
            latestStatus: "ledger_anchored",
            latestStatusAt: "2026-04-22T13:00:00.000Z",
            isAnchored: true,
            isVerificationChecked: true,
            verificationStatus: "verified",
            anchoredAt: "2026-04-22T13:00:00.000Z",
            lastCheckedAt: "2026-04-22T13:10:00.000Z",
            publicVerifyPath: "/verify/IDN-1234567890",
          },
          nextAction: "verification_ready",
        },
      ],
      meetings: [],
      counts: {
        pending: 0,
        scheduled: 0,
        completed: 1,
        total: 1,
      },
    });

    const response = await request(app)
      .get("/notary/requests?limit=10&offset=5")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-1", app_metadata: { role: "notary" } })}`);

    expect(response.status).toBe(200);
    expect(response.body.counts.total).toBe(1);
    expect(response.body.realtimeQueueUserId).toBe("notary-db-1");
    expect(response.body.requests[0].workflow.selectedNotaryUserId).toBe("notary-db-1");
    expect(mocks.listNotaryQueueMock).toHaveBeenCalledWith({
      role: "notary",
      viewerUserId: "notary-db-1",
      status: null,
      limit: 10,
      offset: 5,
    });
  });

  it("gets the real notary request context", async () => {
    mocks.getNotaryRequestContextMock.mockResolvedValue({
      request: {
        id: "req-1",
        documentId: "doc-1",
        workflowId: "wf-1",
        status: "in_review",
        queueStatus: "approved",
        submittedAt: "2026-04-22T10:00:00.000Z",
      },
      document: {
        id: "doc-1",
        idn: "IDN-1234567890",
        status: "completed",
        documentType: "power_of_attorney",
        jurisdiction: "US-CA",
        createdAt: "2026-04-22T09:00:00.000Z",
        summary: {
          workflow: {
            requestId: "req-1",
            workflowId: "wf-1",
            requestStatus: "in_review",
            latestWorkflowStatus: "approved",
            latestWorkflowStatusAt: "2026-04-22T12:00:00.000Z",
            submittedAt: "2026-04-22T10:00:00.000Z",
            assignedNotaryId: "notary-db-1",
            latestCodeStatus: "delivered",
            latestCodeExpiresAt: "2026-04-23T10:05:00.000Z",
          },
          finalization: {
            latestStatus: "ledger_anchored",
            latestStatusAt: "2026-04-22T13:00:00.000Z",
            isAnchored: true,
            isVerificationChecked: true,
          },
          verification: {
            status: "ready",
            idn: "IDN-1234567890",
            verifyPath: "/verify/IDN-1234567890",
          },
        },
        versions: [],
      },
      owner: null,
      notary: null,
      workflow: null,
      latestCodeDelivery: null,
      meeting: null,
      evidence: {
        checkins: [],
        geolocationSamples: [],
        identityVerifications: [],
        proximityEvaluations: [],
        artifacts: [],
      },
      finalization: {
        latestStatus: "ledger_anchored",
        latestStatusAt: "2026-04-22T13:00:00.000Z",
        isAnchored: true,
        isVerificationChecked: true,
        verificationStatus: "verified",
        anchoredAt: "2026-04-22T13:00:00.000Z",
        lastCheckedAt: "2026-04-22T13:10:00.000Z",
        publicVerifyPath: "/verify/IDN-1234567890",
        hash: "hash-value",
        ledgerTxId: "tx-1",
        anchorAttempt: null,
        history: [],
      },
      capabilities: {
        canReviewRequest: false,
        canManageMeeting: true,
        canRecordEvidence: false,
        canFinalizeDocument: false,
        canOpenVerification: true,
      },
      warnings: [],
      nextAction: "verification_ready",
    });

    const response = await request(app)
      .get("/notary/requests/req-1/context")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-1", app_metadata: { role: "notary" } })}`);

    expect(response.status).toBe(200);
    expect(response.body.context.request.id).toBe("req-1");
    expect(response.body.context.finalization.hash).toBe("hash-value");
    expect(mocks.getNotaryRequestContextMock).toHaveBeenCalledWith({
      requestId: "req-1",
      role: "notary",
      viewerUserId: "notary-db-1",
    });
  });

  it("returns not found when notary cannot access selected request context", async () => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValueOnce({
      id: "notary-db-2",
      supabaseUserId: "notary-2",
      email: "notary2@example.com",
      role: "notary",
      status: "active",
      firstName: "Nora",
      lastName: "Two",
      availableRoles: ["notary"],
      roleAssignments: [],
    });
    mocks.getNotaryRequestContextMock.mockResolvedValue(null);

    const response = await request(app)
      .get("/notary/requests/req-locked/context")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-2", app_metadata: { role: "notary" } })}`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: "not_found",
      message: "Notary request context not found",
    });
    expect(mocks.getNotaryRequestContextMock).toHaveBeenCalledWith({
      requestId: "req-locked",
      role: "notary",
      viewerUserId: "notary-db-2",
    });
  });
});
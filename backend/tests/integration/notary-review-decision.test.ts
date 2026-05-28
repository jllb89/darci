import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
  getNotarizationRequestByIdMock: vi.fn(),
  updateNotarizationRequestMock: vi.fn(),
  getIlluminotarizationWorkflowByIdMock: vi.fn(),
  getIlluminotarizationWorkflowByLegacyRequestIdMock: vi.fn(),
  createIlluminotaryReviewDecisionRecordMock: vi.fn(),
  transitionIlluminotarizationWorkflowStatusMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  queueNotaryApprovalReceivedNotificationMock: vi.fn(),
  queueNotaryChangesRequestedNotificationMock: vi.fn(),
}));

vi.mock("../../src/services/userRoleService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/userRoleService")>();
  return {
    ...actual,
    getUserIdentityContextBySupabaseId: mocks.getUserIdentityContextBySupabaseIdMock,
  };
});

vi.mock("../../src/services/documentService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/documentService")>();
  return {
    ...actual,
    getNotarizationRequestById: mocks.getNotarizationRequestByIdMock,
    updateNotarizationRequest: mocks.updateNotarizationRequestMock,
  };
});

vi.mock("../../src/services/illuminotarizationWorkflowService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/services/illuminotarizationWorkflowService")>();
  return {
    ...actual,
    getIlluminotarizationWorkflowById: mocks.getIlluminotarizationWorkflowByIdMock,
    getIlluminotarizationWorkflowByLegacyRequestId:
      mocks.getIlluminotarizationWorkflowByLegacyRequestIdMock,
    createIlluminotaryReviewDecisionRecord:
      mocks.createIlluminotaryReviewDecisionRecordMock,
    transitionIlluminotarizationWorkflowStatus:
      mocks.transitionIlluminotarizationWorkflowStatusMock,
  };
});

vi.mock("../../src/services/auditService", () => ({
  recordAuditEvent: mocks.recordAuditEventMock,
}));

vi.mock("../../src/services/notificationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/notificationService")>();
  return {
    ...actual,
    queueNotaryApprovalReceivedNotification:
      mocks.queueNotaryApprovalReceivedNotificationMock,
    queueNotaryChangesRequestedNotification:
      mocks.queueNotaryChangesRequestedNotificationMock,
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

describe("POST /notary/requests/:id/review-decision", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.getUserIdentityContextBySupabaseIdMock.mockReset();
    mocks.getNotarizationRequestByIdMock.mockReset();
    mocks.updateNotarizationRequestMock.mockReset();
    mocks.getIlluminotarizationWorkflowByIdMock.mockReset();
    mocks.getIlluminotarizationWorkflowByLegacyRequestIdMock.mockReset();
    mocks.createIlluminotaryReviewDecisionRecordMock.mockReset();
    mocks.transitionIlluminotarizationWorkflowStatusMock.mockReset();
    mocks.recordAuditEventMock.mockReset();
    mocks.queueNotaryApprovalReceivedNotificationMock.mockReset();
    mocks.queueNotaryChangesRequestedNotificationMock.mockReset();
  });

  it("records an approval decision and transitions the workflow", async () => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      supabaseUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "notary@example.com",
      role: "notary",
      status: "active",
      firstName: "Nora",
      lastName: "Tary",
      availableRoles: ["notary"],
      roleAssignments: [],
    });
    mocks.getNotarizationRequestByIdMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      workflow_id: "workflow-1",
      assigned_notary_id: "11111111-1111-1111-1111-111111111111",
      status: "in_review",
      submitted_at: "2026-04-20T10:00:00.000Z",
      created_at: "2026-04-20T10:00:00.000Z",
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
      id: "workflow-1",
      owner_user_id: "owner-1",
      created_by_user_id: "owner-1",
      primary_document_id: "doc-1",
      workflow_kind: "single_document",
      status: "in_review",
      selected_notary_user_id: null,
      assigned_notary_user_id: "11111111-1111-1111-1111-111111111111",
      current_legacy_request_id: "req-1",
      submitted_at: "2026-04-20T10:00:00.000Z",
      last_code_generated_at: null,
      review_started_at: "2026-04-20T10:05:00.000Z",
      closed_at: null,
      context_json: {},
      metadata: {},
      created_at: "2026-04-20T10:00:00.000Z",
      updated_at: "2026-04-20T10:05:00.000Z",
    });
    mocks.createIlluminotaryReviewDecisionRecordMock.mockResolvedValue({
      id: "decision-1",
      workflow_id: "workflow-1",
      legacy_request_id: "req-1",
      decided_by_user_id: "11111111-1111-1111-1111-111111111111",
      decision: "approved",
      summary: "All review checks passed",
      decision_notes: "Ready for meeting scheduling",
      decided_at: "2026-04-20T10:10:00.000Z",
      metadata: {},
      created_at: "2026-04-20T10:10:00.000Z",
      updated_at: "2026-04-20T10:10:00.000Z",
    });
    mocks.transitionIlluminotarizationWorkflowStatusMock.mockResolvedValue({
      id: "workflow-1",
      owner_user_id: "owner-1",
      created_by_user_id: "owner-1",
      primary_document_id: "doc-1",
      workflow_kind: "single_document",
      status: "approved",
      selected_notary_user_id: null,
      assigned_notary_user_id: "11111111-1111-1111-1111-111111111111",
      current_legacy_request_id: "req-1",
      submitted_at: "2026-04-20T10:00:00.000Z",
      last_code_generated_at: null,
      review_started_at: "2026-04-20T10:05:00.000Z",
      closed_at: null,
      context_json: {},
      metadata: {},
      created_at: "2026-04-20T10:00:00.000Z",
      updated_at: "2026-04-20T10:10:00.000Z",
    });
    mocks.queueNotaryApprovalReceivedNotificationMock.mockResolvedValue({
      jobId: "job-1",
      deliveryCount: 1,
      existing: false,
    });

    const token = signToken({
      sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      app_metadata: { role: "notary" },
    });

    const response = await request(app)
      .post("/notary/requests/req-1/review-decision")
      .set("Authorization", `Bearer ${token}`)
      .send({
        decision: "approved",
        summary: "All review checks passed",
        decisionNotes: "Ready for meeting scheduling",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      request: {
        id: "req-1",
        documentId: "doc-1",
        workflowId: "workflow-1",
        status: "in_review",
      },
      decision: {
        id: "decision-1",
        decision: "approved",
        summary: "All review checks passed",
        decisionNotes: "Ready for meeting scheduling",
        decidedAt: "2026-04-20T10:10:00.000Z",
        decidedByUserId: "11111111-1111-1111-1111-111111111111",
      },
      workflow: {
        id: "workflow-1",
        status: "approved",
        workflowKind: "single_document",
        selectedNotaryUserId: null,
        assignedNotaryUserId: "11111111-1111-1111-1111-111111111111",
        currentLegacyRequestId: "req-1",
      },
    });
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "notary.request_approved",
        entityId: "req-1",
      }),
    );
    expect(mocks.queueNotaryApprovalReceivedNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        requestId: "req-1",
        summary: "All review checks passed",
      }),
    );
    expect(mocks.updateNotarizationRequestMock).not.toHaveBeenCalled();
  });

  it("records a changes-requested decision without closing the request", async () => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      supabaseUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "notary@example.com",
      role: "notary",
      status: "active",
      firstName: "Nora",
      lastName: "Tary",
      availableRoles: ["notary"],
      roleAssignments: [],
    });
    mocks.getNotarizationRequestByIdMock.mockResolvedValue({
      id: "req-2",
      document_id: "doc-2",
      workflow_id: "workflow-2",
      assigned_notary_id: "11111111-1111-1111-1111-111111111111",
      status: "in_review",
      submitted_at: "2026-04-20T10:00:00.000Z",
      created_at: "2026-04-20T10:00:00.000Z",
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
      id: "workflow-2",
      owner_user_id: "owner-2",
      created_by_user_id: "owner-2",
      primary_document_id: "doc-2",
      workflow_kind: "single_document",
      status: "in_review",
      selected_notary_user_id: null,
      assigned_notary_user_id: "11111111-1111-1111-1111-111111111111",
      current_legacy_request_id: "req-2",
      submitted_at: "2026-04-20T10:00:00.000Z",
      last_code_generated_at: null,
      review_started_at: "2026-04-20T10:05:00.000Z",
      closed_at: null,
      context_json: {},
      metadata: {},
      created_at: "2026-04-20T10:00:00.000Z",
      updated_at: "2026-04-20T10:05:00.000Z",
    });
    mocks.createIlluminotaryReviewDecisionRecordMock.mockResolvedValue({
      id: "decision-2",
      workflow_id: "workflow-2",
      legacy_request_id: "req-2",
      decided_by_user_id: "11111111-1111-1111-1111-111111111111",
      decision: "changes_requested",
      summary: "Update the signer name spelling",
      decision_notes: null,
      decided_at: "2026-04-20T10:12:00.000Z",
      metadata: {},
      created_at: "2026-04-20T10:12:00.000Z",
      updated_at: "2026-04-20T10:12:00.000Z",
    });
    mocks.transitionIlluminotarizationWorkflowStatusMock.mockResolvedValue({
      id: "workflow-2",
      owner_user_id: "owner-2",
      created_by_user_id: "owner-2",
      primary_document_id: "doc-2",
      workflow_kind: "single_document",
      status: "changes_requested",
      selected_notary_user_id: null,
      assigned_notary_user_id: "11111111-1111-1111-1111-111111111111",
      current_legacy_request_id: "req-2",
      submitted_at: "2026-04-20T10:00:00.000Z",
      last_code_generated_at: null,
      review_started_at: "2026-04-20T10:05:00.000Z",
      closed_at: null,
      context_json: {},
      metadata: {},
      created_at: "2026-04-20T10:00:00.000Z",
      updated_at: "2026-04-20T10:12:00.000Z",
    });
    mocks.queueNotaryChangesRequestedNotificationMock.mockResolvedValue({
      jobId: "job-2",
      deliveryCount: 1,
      existing: false,
    });

    const token = signToken({
      sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      app_metadata: { role: "notary" },
    });

    const response = await request(app)
      .post("/notary/requests/req-2/review-decision")
      .set("Authorization", `Bearer ${token}`)
      .send({
        decision: "changes_requested",
        summary: "Update the signer name spelling",
      });

    expect(response.status).toBe(200);
    expect(response.body.request.status).toBe("in_review");
    expect(response.body.workflow.status).toBe("changes_requested");
    expect(mocks.queueNotaryChangesRequestedNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-2",
        summary: "Update the signer name spelling",
      }),
    );
    expect(mocks.updateNotarizationRequestMock).not.toHaveBeenCalled();
  });

  it("rejects a notary decision from a different assigned notary", async () => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      supabaseUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      email: "other-notary@example.com",
      role: "notary",
      status: "active",
      firstName: "Other",
      lastName: "Notary",
      availableRoles: ["notary"],
      roleAssignments: [],
    });
    mocks.getNotarizationRequestByIdMock.mockResolvedValue({
      id: "req-3",
      document_id: "doc-3",
      workflow_id: "workflow-3",
      assigned_notary_id: "11111111-1111-1111-1111-111111111111",
      status: "in_review",
      submitted_at: "2026-04-20T10:00:00.000Z",
      created_at: "2026-04-20T10:00:00.000Z",
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
      id: "workflow-3",
      owner_user_id: "owner-3",
      created_by_user_id: "owner-3",
      primary_document_id: "doc-3",
      workflow_kind: "single_document",
      status: "in_review",
      selected_notary_user_id: null,
      assigned_notary_user_id: "11111111-1111-1111-1111-111111111111",
      current_legacy_request_id: "req-3",
      submitted_at: "2026-04-20T10:00:00.000Z",
      last_code_generated_at: null,
      review_started_at: "2026-04-20T10:05:00.000Z",
      closed_at: null,
      context_json: {},
      metadata: {},
      created_at: "2026-04-20T10:00:00.000Z",
      updated_at: "2026-04-20T10:05:00.000Z",
    });

    const token = signToken({
      sub: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      app_metadata: { role: "notary" },
    });

    const response = await request(app)
      .post("/notary/requests/req-3/review-decision")
      .set("Authorization", `Bearer ${token}`)
      .send({ decision: "approved" });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("forbidden");
    expect(mocks.createIlluminotaryReviewDecisionRecordMock).not.toHaveBeenCalled();
  });
});
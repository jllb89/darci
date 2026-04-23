import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
  getDocumentByIdMock: vi.fn(),
  getUserIdBySupabaseIdMock: vi.fn(),
  getActiveNotarizationRequestMock: vi.fn(),
  listDocumentSystemValuesMock: vi.fn(),
  listWorkflowStatusHistoryMock: vi.fn(),
  listFinalizationStatusHistoryMock: vi.fn(),
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
    getDocumentById: mocks.getDocumentByIdMock,
    getUserIdBySupabaseId: mocks.getUserIdBySupabaseIdMock,
    getActiveNotarizationRequest: mocks.getActiveNotarizationRequestMock,
    listDocumentSystemValues: mocks.listDocumentSystemValuesMock,
  };
});

vi.mock("../../src/services/illuminotarizationWorkflowService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/services/illuminotarizationWorkflowService")>();
  return {
    ...actual,
    listWorkflowStatusHistory: mocks.listWorkflowStatusHistoryMock,
  };
});

vi.mock("../../src/services/documentFinalizationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/documentFinalizationService")>();
  return {
    ...actual,
    listFinalizationStatusHistory: mocks.listFinalizationStatusHistoryMock,
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

beforeEach(() => {
  process.env.SUPABASE_JWT_SECRET = "test-secret";
  vi.clearAllMocks();

  mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
    id: "member-user-1",
    supabaseUserId: "member-sub",
    email: "member@example.com",
    role: "member",
    status: "active",
    firstName: "Mina",
    lastName: "Member",
    availableRoles: ["member"],
    roleAssignments: [],
  });

  mocks.getDocumentByIdMock.mockResolvedValue({
    id: "doc-1",
    owner_id: "member-user-1",
    idn: "AB12CD34EF56",
    status: "completed",
    document_type: "generic",
    jurisdiction: "US-OH",
    product_flow_mode: "notarize_document",
    selected_families: [],
    output_bundle: [],
    intake_status: "submitted",
    intake_schema_version: null,
    intake_last_saved_at: "2026-04-20T10:02:00.000Z",
    intake_submitted_at: "2026-04-20T10:05:00.000Z",
    created_at: "2026-04-20T10:00:00.000Z",
    updated_at: "2026-04-20T11:30:00.000Z",
  });
  mocks.getUserIdBySupabaseIdMock.mockResolvedValue("member-user-1");
  mocks.getActiveNotarizationRequestMock.mockResolvedValue({
    id: "req-1",
    document_id: "doc-1",
    workflow_id: "workflow-1",
    assigned_notary_id: "notary-user-1",
    status: "completed",
    submitted_at: "2026-04-20T10:35:00.000Z",
    created_at: "2026-04-20T10:34:00.000Z",
  });
  mocks.listDocumentSystemValuesMock.mockResolvedValue([
    {
      id: "sys-review",
      document_id: "doc-1",
      system_key: "review_approval",
      value_json: {
        approvedAt: "2026-04-20T10:10:00.000Z",
        actorSupabaseId: "member-sub",
      },
      source: "review_approval",
      metadata: {},
      created_at: "2026-04-20T10:10:00.000Z",
      updated_at: "2026-04-20T10:10:00.000Z",
    },
    {
      id: "sys-signatures",
      document_id: "doc-1",
      system_key: "signature_execution",
      value_json: {
        confirmedAt: "2026-04-20T10:20:00.000Z",
        confirmedBySupabaseId: "member-sub",
      },
      source: "signature_execution",
      metadata: {},
      created_at: "2026-04-20T10:20:00.000Z",
      updated_at: "2026-04-20T10:20:00.000Z",
    },
  ]);
  mocks.listWorkflowStatusHistoryMock.mockResolvedValue([
    {
      id: "workflow-history-1",
      workflow_id: "workflow-1",
      legacy_request_id: "req-1",
      previous_status: "draft",
      next_status: "submitted",
      changed_by_user_id: "member-user-1",
      change_source: "submit_notarization",
      change_reason: null,
      metadata: {},
      created_at: "2026-04-20T10:35:00.000Z",
    },
    {
      id: "workflow-history-2",
      workflow_id: "workflow-1",
      legacy_request_id: "req-1",
      previous_status: "submitted",
      next_status: "code_delivered",
      changed_by_user_id: "member-user-1",
      change_source: "code_delivery",
      change_reason: null,
      metadata: {},
      created_at: "2026-04-20T10:40:00.000Z",
    },
    {
      id: "workflow-history-3",
      workflow_id: "workflow-1",
      legacy_request_id: "req-1",
      previous_status: "code_delivered",
      next_status: "in_review",
      changed_by_user_id: "notary-user-1",
      change_source: "code_resolution",
      change_reason: null,
      metadata: {},
      created_at: "2026-04-20T10:45:00.000Z",
    },
  ]);
  mocks.listFinalizationStatusHistoryMock.mockResolvedValue([
    {
      id: "finalization-history-1",
      document_id: "doc-1",
      execution_run_id: "exec-ack-1",
      document_hash_record_id: null,
      ledger_anchor_attempt_id: null,
      changed_by_user_id: "notary-user-1",
      status: "acknowledgment_appended",
      change_source: "documents.append-acknowledgment",
      change_reason: null,
      metadata: {},
      created_at: "2026-04-20T11:00:00.000Z",
    },
    {
      id: "finalization-history-2",
      document_id: "doc-1",
      execution_run_id: "exec-watermark-1",
      document_hash_record_id: null,
      ledger_anchor_attempt_id: null,
      changed_by_user_id: "notary-user-1",
      status: "watermark_applied",
      change_source: "documents.watermark",
      change_reason: null,
      metadata: {},
      created_at: "2026-04-20T11:05:00.000Z",
    },
    {
      id: "finalization-history-3",
      document_id: "doc-1",
      execution_run_id: "exec-watermark-1",
      document_hash_record_id: "hash-1",
      ledger_anchor_attempt_id: null,
      changed_by_user_id: "notary-user-1",
      status: "hash_recorded",
      change_source: "documents.watermark",
      change_reason: null,
      metadata: {},
      created_at: "2026-04-20T11:06:00.000Z",
    },
    {
      id: "finalization-history-4",
      document_id: "doc-1",
      execution_run_id: "exec-watermark-1",
      document_hash_record_id: "hash-1",
      ledger_anchor_attempt_id: "anchor-attempt-1",
      changed_by_user_id: "notary-user-1",
      status: "ledger_anchored",
      change_source: "documents.watermark",
      change_reason: null,
      metadata: {},
      created_at: "2026-04-20T11:07:00.000Z",
    },
  ]);
});

describe("document timeline", () => {
  it("returns persisted workflow and finalization events", async () => {
    const response = await request(app)
      .get("/documents/doc-1/timeline")
      .set("Authorization", `Bearer ${memberToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      timeline: [
        {
          action: "Document created",
          timestamp: "2026-04-20T10:00:00.000Z",
        },
        {
          action: "Intake submitted",
          timestamp: "2026-04-20T10:05:00.000Z",
        },
        {
          action: "Review approved",
          timestamp: "2026-04-20T10:10:00.000Z",
          actorId: "member-sub",
        },
        {
          action: "Signatures confirmed",
          timestamp: "2026-04-20T10:20:00.000Z",
          actorId: "member-sub",
        },
        {
          action: "Notarization submitted",
          timestamp: "2026-04-20T10:35:00.000Z",
          actorId: "member-user-1",
        },
        {
          action: "Illuminotary code delivered",
          timestamp: "2026-04-20T10:40:00.000Z",
          actorId: "member-user-1",
        },
        {
          action: "Illuminotary review started",
          timestamp: "2026-04-20T10:45:00.000Z",
          actorId: "notary-user-1",
        },
        {
          action: "Acknowledgment appended",
          timestamp: "2026-04-20T11:00:00.000Z",
          actorId: "notary-user-1",
        },
        {
          action: "Watermark applied",
          timestamp: "2026-04-20T11:05:00.000Z",
          actorId: "notary-user-1",
        },
        {
          action: "Document hash recorded",
          timestamp: "2026-04-20T11:06:00.000Z",
          actorId: "notary-user-1",
        },
        {
          action: "Ledger anchored",
          timestamp: "2026-04-20T11:07:00.000Z",
          actorId: "notary-user-1",
        },
      ],
    });
  });
});
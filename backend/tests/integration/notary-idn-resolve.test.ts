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
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
  getDocumentByIdnMock: vi.fn(),
  listNotarizationRequestsMock: vi.fn(),
  updateNotarizationRequestMock: vi.fn(),
  getIlluminotarizationWorkflowByIdMock: vi.fn(),
  getIlluminotarizationWorkflowByLegacyRequestIdMock: vi.fn(),
  transitionIlluminotarizationWorkflowStatusMock: vi.fn(),
  upsertIlluminotarizationWorkflowAssignmentMock: vi.fn(),
  getNotaryRequestContextMock: vi.fn(),
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
    getDocumentByIdn: mocks.getDocumentByIdnMock,
    listNotarizationRequests: mocks.listNotarizationRequestsMock,
    updateNotarizationRequest: mocks.updateNotarizationRequestMock,
  };
});

vi.mock("../../src/services/illuminotarizationWorkflowService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/illuminotarizationWorkflowService")>();
  return {
    ...actual,
    getIlluminotarizationWorkflowById: mocks.getIlluminotarizationWorkflowByIdMock,
    getIlluminotarizationWorkflowByLegacyRequestId:
      mocks.getIlluminotarizationWorkflowByLegacyRequestIdMock,
    transitionIlluminotarizationWorkflowStatus:
      mocks.transitionIlluminotarizationWorkflowStatusMock,
    upsertIlluminotarizationWorkflowAssignment:
      mocks.upsertIlluminotarizationWorkflowAssignmentMock,
  };
});

vi.mock("../../src/services/notaryWorkspaceReadModelService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/notaryWorkspaceReadModelService")>();
  return {
    ...actual,
    getNotaryRequestContext: mocks.getNotaryRequestContextMock,
  };
});

import { app } from "../../src/index";

const signToken = (payload: { sub: string; app_metadata?: { role?: string } }) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
};

const baseDocument = {
  id: "doc-1",
  owner_id: "member-db-1",
  idn: "IDN-1234567890",
  status: "completed",
  document_type: "trust_registration",
  jurisdiction: "US-CA",
  product_flow_mode: "trust",
  selected_families: [],
  output_bundle: [],
  intake_status: "completed",
  intake_schema_version: "2026-05",
  intake_last_saved_at: null,
  intake_submitted_at: "2026-05-27T10:00:00.000Z",
  created_at: "2026-05-27T10:00:00.000Z",
  updated_at: "2026-05-27T10:00:00.000Z",
};

const baseRequest = {
  id: "req-1",
  document_id: "doc-1",
  workflow_id: "wf-1",
  assigned_notary_id: null,
  status: "pending",
  submitted_at: "2026-05-27T10:10:00.000Z",
  created_at: "2026-05-27T10:10:00.000Z",
};

const baseWorkflow = {
  id: "wf-1",
  owner_user_id: "member-db-1",
  created_by_user_id: "member-db-1",
  primary_document_id: "doc-1",
  workflow_kind: "single_document",
  status: "submitted",
  selected_notary_user_id: null,
  assigned_notary_user_id: null,
  current_legacy_request_id: "req-1",
  submitted_at: "2026-05-27T10:10:00.000Z",
  last_code_generated_at: null,
  review_started_at: null,
  closed_at: null,
  context_json: {},
  metadata: {},
  created_at: "2026-05-27T10:00:00.000Z",
  updated_at: "2026-05-27T10:10:00.000Z",
};

describe("POST /notary/idn/resolve", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
      id: "notary-db-1",
      supabaseUserId: "notary-user-1",
      email: "notary@example.com",
      role: "notary",
      status: "active",
      firstName: "Nora",
      lastName: "Tary",
      availableRoles: ["notary"],
      roleAssignments: [],
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue(null);
    mocks.getIlluminotarizationWorkflowByLegacyRequestIdMock.mockResolvedValue(null);
    mocks.transitionIlluminotarizationWorkflowStatusMock.mockResolvedValue({
      ...baseWorkflow,
      status: "in_review",
      assigned_notary_user_id: "notary-db-1",
    });
    mocks.upsertIlluminotarizationWorkflowAssignmentMock.mockResolvedValue({ id: "assignment-1" });
    mocks.getNotaryRequestContextMock.mockResolvedValue({
      request: {
        id: "req-1",
        documentId: "doc-1",
        workflowId: "wf-1",
        status: "in_review",
        queueStatus: "in_review",
        submittedAt: "2026-05-27T10:10:00.000Z",
      },
    });
  });

  it("claims an eligible request by IDN and returns context", async () => {
    mocks.getDocumentByIdnMock.mockResolvedValue(baseDocument);
    mocks.listNotarizationRequestsMock.mockResolvedValue([baseRequest]);
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue(baseWorkflow);
    mocks.updateNotarizationRequestMock.mockResolvedValue({
      ...baseRequest,
      assigned_notary_id: "notary-db-1",
      status: "in_review",
    });

    const response = await request(app)
      .post("/notary/idn/resolve")
      .set(
        "Authorization",
        `Bearer ${signToken({ sub: "notary-user-1", app_metadata: { role: "notary" } })}`,
      )
      .send({ idn: "idn-1234567890" });

    expect(response.status).toBe(200);
    expect(response.body.requestId).toBe("req-1");
    expect(response.body.context.request.id).toBe("req-1");
    expect(mocks.getDocumentByIdnMock).toHaveBeenCalledWith("idn-1234567890");
    expect(mocks.updateNotarizationRequestMock).toHaveBeenCalledWith("req-1", {
      assigned_notary_id: "notary-db-1",
      status: "in_review",
      workflow_id: "wf-1",
    });
    expect(mocks.upsertIlluminotarizationWorkflowAssignmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf-1",
        assignmentKind: "assigned_notary",
        userId: "notary-db-1",
      }),
    );
    expect(mocks.transitionIlluminotarizationWorkflowStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf-1",
        nextStatus: "in_review",
        changeReason: "notary_idn_resolution",
      }),
    );
    expect(mocks.getNotaryRequestContextMock).toHaveBeenCalledWith({
      requestId: "req-1",
      role: "notary",
      viewerUserId: "notary-db-1",
    });
  });

  it("rejects an IDN request assigned to another notary", async () => {
    mocks.getDocumentByIdnMock.mockResolvedValue(baseDocument);
    mocks.listNotarizationRequestsMock.mockResolvedValue([
      {
        ...baseRequest,
        assigned_notary_id: "notary-db-2",
        status: "in_review",
      },
    ]);
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
      ...baseWorkflow,
      assigned_notary_user_id: "notary-db-2",
      status: "in_review",
    });

    const response = await request(app)
      .post("/notary/idn/resolve")
      .set(
        "Authorization",
        `Bearer ${signToken({ sub: "notary-user-1", app_metadata: { role: "notary" } })}`,
      )
      .send({ idn: "IDN-1234567890" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("already_assigned");
    expect(mocks.updateNotarizationRequestMock).not.toHaveBeenCalled();
    expect(mocks.getNotaryRequestContextMock).not.toHaveBeenCalled();
  });
});
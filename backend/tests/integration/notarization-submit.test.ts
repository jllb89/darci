import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDocumentByIdMock: vi.fn(),
  listDocumentVersionsMock: vi.fn(),
  getUserIdBySupabaseIdMock: vi.fn(),
  getActiveNotarizationRequestMock: vi.fn(),
  createNotarizationRequestMock: vi.fn(),
  createNotarizationCodeMock: vi.fn(),
  updateDocumentMock: vi.fn(),
  upsertDocumentSystemValuesMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  enqueueWebhookMock: vi.fn(),
  createIlluminotarizationWorkflowMock: vi.fn(),
  createIlluminotarizationWorkflowDocumentMock: vi.fn(),
  createIlluminotarizationWorkflowStatusHistoryEntryMock: vi.fn(),
  transitionIlluminotarizationWorkflowStatusMock: vi.fn(),
  upsertIlluminotarizationWorkflowAssignmentMock: vi.fn(),
  createCodeDeliveryRecordMock: vi.fn(),
  queueNotaryNextStepNotificationMock: vi.fn(),
  queueNotarizationSubmissionConfirmationNotificationMock: vi.fn(),
  queueSelectedNotaryRequestNotificationMock: vi.fn(),
  runDueNotificationJobsMock: vi.fn(),
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
  getUserIdentityContextByUserIdMock: vi.fn(),
  getNotaryProfileByUserIdMock: vi.fn(),
  listAvailableNotariesByJurisdictionMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", () => ({
  getDocumentById: mocks.getDocumentByIdMock,
  listDocumentVersions: mocks.listDocumentVersionsMock,
  getUserIdBySupabaseId: mocks.getUserIdBySupabaseIdMock,
  getActiveNotarizationRequest: mocks.getActiveNotarizationRequestMock,
  createNotarizationRequest: mocks.createNotarizationRequestMock,
  createNotarizationCode: mocks.createNotarizationCodeMock,
  updateDocument: mocks.updateDocumentMock,
  upsertDocumentSystemValues: mocks.upsertDocumentSystemValuesMock,
}));

vi.mock("../../src/services/auditService", () => ({
  recordAuditEvent: mocks.recordAuditEventMock,
}));

vi.mock("../../src/worker/jobs", () => ({
  enqueueWebhook: mocks.enqueueWebhookMock,
}));

vi.mock("../../src/services/illuminotarizationWorkflowService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/illuminotarizationWorkflowService")>(
    "../../src/services/illuminotarizationWorkflowService",
  );

  return {
    ...actual,
    createIlluminotarizationWorkflow: mocks.createIlluminotarizationWorkflowMock,
    createIlluminotarizationWorkflowDocument: mocks.createIlluminotarizationWorkflowDocumentMock,
    createIlluminotarizationWorkflowStatusHistoryEntry:
      mocks.createIlluminotarizationWorkflowStatusHistoryEntryMock,
    transitionIlluminotarizationWorkflowStatus: mocks.transitionIlluminotarizationWorkflowStatusMock,
    upsertIlluminotarizationWorkflowAssignment: mocks.upsertIlluminotarizationWorkflowAssignmentMock,
    createCodeDeliveryRecord: mocks.createCodeDeliveryRecordMock,
  };
});

vi.mock("../../src/services/notificationService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/notificationService")>(
    "../../src/services/notificationService",
  );

  return {
    ...actual,
    queueNotaryNextStepNotification: mocks.queueNotaryNextStepNotificationMock,
    queueNotarizationSubmissionConfirmationNotification:
      mocks.queueNotarizationSubmissionConfirmationNotificationMock,
    queueSelectedNotaryRequestNotification:
      mocks.queueSelectedNotaryRequestNotificationMock,
  };
});

vi.mock("../../src/services/notificationOutboxService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/notificationOutboxService")>(
    "../../src/services/notificationOutboxService",
  );

  return {
    ...actual,
    runDueNotificationJobs: mocks.runDueNotificationJobsMock,
  };
});

vi.mock("../../src/services/userRoleService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/userRoleService")>(
    "../../src/services/userRoleService",
  );

  return {
    ...actual,
    getUserIdentityContextBySupabaseId: mocks.getUserIdentityContextBySupabaseIdMock,
    getUserIdentityContextByUserId: mocks.getUserIdentityContextByUserIdMock,
  };
});

vi.mock("../../src/services/notaryProfileService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/notaryProfileService")>(
    "../../src/services/notaryProfileService",
  );

  return {
    ...actual,
    getNotaryProfileByUserId: mocks.getNotaryProfileByUserIdMock,
    listAvailableNotariesByJurisdiction: mocks.listAvailableNotariesByJurisdictionMock,
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

const postWithLog = async (
  path: string,
  token: string,
  payload: Record<string, unknown>,
  label: string
) => {
  console.log("request", { method: "POST", path, payload });
  const response = await request(app)
    .post(path)
    .set("Authorization", `Bearer ${token}`)
    .send(payload);
  logResponse(label, response);
  return response;
};

const getWithLog = async (
  path: string,
  token: string,
  label: string,
) => {
  console.log("request", { method: "GET", path });
  const response = await request(app)
    .get(path)
    .set("Authorization", `Bearer ${token}`);
  logResponse(label, response);
  return response;
};

const workflowRecord = {
  id: "workflow-1",
  workflow_kind: "notarization",
  status: "submitted",
  selected_notary_user_id: null,
  assigned_notary_user_id: null,
  current_legacy_request_id: null,
};

const buildActiveNotaryIdentity = (overrides: Record<string, unknown> = {}) => ({
  id: "notary-1",
  supabaseUserId: "notary-supabase-1",
  email: "notary@example.com",
  phone: null,
  role: "notary",
  status: "active",
  firstName: "Nora",
  lastName: "Tary",
  emailConfirmedAt: null,
  phoneConfirmedAt: null,
  lastSignInAt: null,
  lastAuthSyncedAt: null,
  availableRoles: ["notary"],
  roleAssignments: [{
    id: "role-1",
    role: "notary",
    status: "active",
    isActiveProfile: true,
    grantedReason: null,
    createdAt: "2026-03-05T00:00:00.000Z",
    updatedAt: "2026-03-05T00:00:00.000Z",
  }],
  ...overrides,
});

const buildNotaryProfile = (overrides: Record<string, unknown> = {}) => ({
  id: "profile-1",
  userId: "notary-1",
  jurisdiction: "US-OH",
  serviceAreaKind: "county",
  serviceAreaName: "Franklin County",
  commissionNumber: null,
  commissionExpiresAt: "2027-01-01T00:00:00.000Z",
  sealStoragePath: null,
  signatureDataUrl: null,
  sealDataUrl: null,
  createdAt: "2026-03-05T00:00:00.000Z",
  updatedAt: "2026-03-05T00:00:00.000Z",
  ...overrides,
});

describe("submit notarization", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    process.env.NOTARIZATION_CODE_TTL_MINUTES = "30";
    mocks.getDocumentByIdMock.mockReset();
    mocks.listDocumentVersionsMock.mockReset();
    mocks.getUserIdBySupabaseIdMock.mockReset();
    mocks.getActiveNotarizationRequestMock.mockReset();
    mocks.createNotarizationRequestMock.mockReset();
    mocks.createNotarizationCodeMock.mockReset();
    mocks.updateDocumentMock.mockReset();
    mocks.upsertDocumentSystemValuesMock.mockReset();
    mocks.recordAuditEventMock.mockReset();
    mocks.enqueueWebhookMock.mockReset();
    mocks.createIlluminotarizationWorkflowMock.mockReset();
    mocks.createIlluminotarizationWorkflowDocumentMock.mockReset();
    mocks.createIlluminotarizationWorkflowStatusHistoryEntryMock.mockReset();
    mocks.transitionIlluminotarizationWorkflowStatusMock.mockReset();
    mocks.upsertIlluminotarizationWorkflowAssignmentMock.mockReset();
    mocks.createCodeDeliveryRecordMock.mockReset();
    mocks.queueNotaryNextStepNotificationMock.mockReset();
    mocks.queueNotarizationSubmissionConfirmationNotificationMock.mockReset();
    mocks.queueSelectedNotaryRequestNotificationMock.mockReset();
    mocks.runDueNotificationJobsMock.mockReset();
    mocks.getUserIdentityContextBySupabaseIdMock.mockReset();
    mocks.getUserIdentityContextByUserIdMock.mockReset();
    mocks.getNotaryProfileByUserIdMock.mockReset();
    mocks.listAvailableNotariesByJurisdictionMock.mockReset();
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue(null);
    mocks.getUserIdentityContextByUserIdMock.mockResolvedValue(null);
    mocks.getNotaryProfileByUserIdMock.mockResolvedValue(null);
    mocks.listAvailableNotariesByJurisdictionMock.mockResolvedValue([]);
    mocks.listDocumentVersionsMock.mockResolvedValue([
      {
        id: "ver-1",
        document_id: "doc-1",
        version: 1,
        storage_path: "documents/doc-1-signed.pdf",
        file_name: "doc-1-signed.pdf",
        mime_type: "application/pdf",
        size_bytes: 1234,
        is_final: false,
        generation_run_id: "run-1",
        created_by: "owner-1",
        created_at: "2026-03-05T00:00:00.000Z",
      },
    ]);
    mocks.upsertDocumentSystemValuesMock.mockResolvedValue(null);
    mocks.createIlluminotarizationWorkflowMock.mockResolvedValue(workflowRecord);
    mocks.createIlluminotarizationWorkflowDocumentMock.mockResolvedValue(null);
    mocks.createIlluminotarizationWorkflowStatusHistoryEntryMock.mockResolvedValue(null);
    mocks.transitionIlluminotarizationWorkflowStatusMock.mockResolvedValue({
      ...workflowRecord,
      status: "code_delivered",
      current_legacy_request_id: "req-1",
    });
    mocks.upsertIlluminotarizationWorkflowAssignmentMock.mockResolvedValue(null);
    mocks.createCodeDeliveryRecordMock.mockResolvedValue(null);
    mocks.queueNotaryNextStepNotificationMock.mockResolvedValue({ jobId: "job-1" });
    mocks.queueNotarizationSubmissionConfirmationNotificationMock.mockResolvedValue({ jobId: "job-2" });
    mocks.queueSelectedNotaryRequestNotificationMock.mockResolvedValue({
      jobId: "job-selected-notary",
      deliveryCount: 1,
      existing: false,
    });
    mocks.runDueNotificationJobsMock.mockResolvedValue({
      scannedCount: 1,
      claimedCount: 1,
      processedCount: 1,
      jobs: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates request and code", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-123",
      status: "pending_notary",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: null,
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.getActiveNotarizationRequestMock.mockResolvedValue(null);
    mocks.createNotarizationRequestMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      assigned_notary_id: null,
      status: "pending",
      submitted_at: "2026-03-05T00:00:10.000Z",
      created_at: "2026-03-05T00:00:10.000Z",
    });
    mocks.createNotarizationCodeMock.mockResolvedValue({
      id: "code-1",
      request_id: "req-1",
      code: "NTR-1234",
      status: "active",
      expires_at: "2026-03-05T00:30:00.000Z",
      created_at: "2026-03-05T00:00:10.000Z",
    });

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      {},
      "creates request and code"
    );

    expect(response.status).toBe(201);
    expect(response.body.request.id).toBe("req-1");
    expect(response.body.code.id).toBe("code-1");
    expect(response.body.document.status).toBe("pending_notary");
  });

  it("returns 404 when document is missing", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue(null);

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-404/submit-notarization",
      token,
      {},
      "returns 404 when document is missing"
    );

    expect(response.status).toBe(404);
  });

  it("uses TTL minutes for code expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T00:00:00.000Z"));
    process.env.NOTARIZATION_CODE_TTL_MINUTES = "45";

    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-123",
      status: "pending_notary",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: null,
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.getActiveNotarizationRequestMock.mockResolvedValue(null);
    mocks.createNotarizationRequestMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      assigned_notary_id: null,
      status: "pending",
      submitted_at: "2026-03-05T00:00:10.000Z",
      created_at: "2026-03-05T00:00:10.000Z",
    });
    mocks.createNotarizationCodeMock.mockResolvedValue({
      id: "code-1",
      request_id: "req-1",
      code: "NTR-1234",
      status: "active",
      expires_at: "2026-03-05T00:45:00.000Z",
      created_at: "2026-03-05T00:00:10.000Z",
    });

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      {},
      "uses TTL minutes for code expiry"
    );

    expect(response.status).toBe(201);
    expect(mocks.createNotarizationCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        expiresAt: "2026-03-05T00:45:00.000Z",
      })
    );
  });

  it("retries on code collision", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-123",
      status: "pending_notary",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: null,
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.getActiveNotarizationRequestMock.mockResolvedValue(null);
    mocks.createNotarizationRequestMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      assigned_notary_id: null,
      status: "pending",
      submitted_at: "2026-03-05T00:00:10.000Z",
      created_at: "2026-03-05T00:00:10.000Z",
    });
    mocks.createNotarizationCodeMock
      .mockRejectedValueOnce(new Error("duplicate key"))
      .mockResolvedValueOnce({
        id: "code-1",
        request_id: "req-1",
        code: "NTR-5678",
        status: "active",
        expires_at: "2026-03-05T00:30:00.000Z",
        created_at: "2026-03-05T00:00:10.000Z",
      });

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      {},
      "retries on code collision"
    );

    expect(response.status).toBe(201);
    expect(mocks.createNotarizationCodeMock).toHaveBeenCalledTimes(2);
    expect(response.body.code.code).toBe("NTR-5678");
  });

  it("rejects wrong status", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: null,
      status: "draft",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      {},
      "rejects wrong status"
    );

    expect(response.status).toBe(400);
  });

  it("rejects existing request", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: null,
      status: "pending_notary",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: null,
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.getActiveNotarizationRequestMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      assigned_notary_id: null,
      status: "pending",
      submitted_at: "2026-03-05T00:00:10.000Z",
      created_at: "2026-03-05T00:00:10.000Z",
    });

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      {},
      "rejects existing request"
    );

    expect(response.status).toBe(409);
  });

  it("rejects pending signature submissions without document notarization signature skip", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: null,
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: null,
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      {},
      "rejects pending signature without skip"
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Document signatures must be complete before notarization submission");
    expect(mocks.createNotarizationRequestMock).not.toHaveBeenCalled();
  });

  it("accepts document notarization signature skip from pending signature", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-123",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: "notarize_document",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.getActiveNotarizationRequestMock.mockResolvedValue(null);
    mocks.createNotarizationRequestMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      assigned_notary_id: null,
      status: "pending",
      submitted_at: "2026-03-05T00:00:10.000Z",
      created_at: "2026-03-05T00:00:10.000Z",
    });
    mocks.createNotarizationCodeMock.mockResolvedValue({
      id: "code-1",
      request_id: "req-1",
      code: "NTR-1234",
      status: "active",
      expires_at: "2026-03-05T00:30:00.000Z",
      created_at: "2026-03-05T00:00:10.000Z",
    });

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      { signatureSkipped: true, signatureSkipReason: "member_selected_no_signature" },
      "accepts document notarization signature skip"
    );

    expect(response.status).toBe(201);
    expect(mocks.updateDocumentMock).toHaveBeenCalledWith("doc-1", { status: "pending_notary" });
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "member.document_signature_skipped" }),
    );
  });

  it("rejects signature skip outside document notarization", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-123",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: "trust_bundle",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      { signatureSkipped: true },
      "rejects signature skip outside document notarization"
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Signature skip is only available for document notarization uploads");
  });

  it("accepts a selected same-jurisdiction notary", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-123",
      status: "pending_notary",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: "notarize_document",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.getUserIdentityContextByUserIdMock.mockResolvedValue({
      id: "notary-1",
      supabaseUserId: "notary-supabase-1",
      email: "notary@example.com",
      phone: null,
      role: "member",
      status: "active",
      firstName: "Nora",
      lastName: "Tary",
      emailConfirmedAt: null,
      phoneConfirmedAt: null,
      lastSignInAt: null,
      lastAuthSyncedAt: null,
      availableRoles: ["member", "notary"],
      roleAssignments: [{
        id: "role-1",
        role: "notary",
        status: "active",
        isActiveProfile: false,
        grantedReason: null,
        createdAt: "2026-03-05T00:00:00.000Z",
        updatedAt: "2026-03-05T00:00:00.000Z",
      }],
    });
    mocks.getNotaryProfileByUserIdMock.mockResolvedValue({
      id: "profile-1",
      userId: "notary-1",
      jurisdiction: "OH",
      serviceAreaKind: "county",
      serviceAreaName: "Franklin County",
      commissionNumber: null,
      commissionExpiresAt: "2027-01-01T00:00:00.000Z",
      sealStoragePath: null,
      signatureDataUrl: null,
      sealDataUrl: null,
      createdAt: "2026-03-05T00:00:00.000Z",
      updatedAt: "2026-03-05T00:00:00.000Z",
    });
    mocks.getActiveNotarizationRequestMock.mockResolvedValue(null);
    mocks.createNotarizationRequestMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      assigned_notary_id: null,
      status: "pending",
      submitted_at: "2026-03-05T00:00:10.000Z",
      created_at: "2026-03-05T00:00:10.000Z",
    });
    mocks.createNotarizationCodeMock.mockResolvedValue({
      id: "code-1",
      request_id: "req-1",
      code: "NTR-1234",
      status: "active",
      expires_at: "2026-03-05T00:30:00.000Z",
      created_at: "2026-03-05T00:00:10.000Z",
    });

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      { selectedNotaryUserId: "notary-1" },
      "accepts selected notary"
    );

    expect(response.status).toBe(201);
    expect(mocks.createIlluminotarizationWorkflowMock).toHaveBeenCalledWith(
      expect.objectContaining({ selectedNotaryUserId: "notary-1" }),
    );
    expect(mocks.upsertIlluminotarizationWorkflowAssignmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "workflow-1",
        assignmentKind: "selected_notary",
        userId: "notary-1",
        assignmentSource: "member_selection",
      }),
    );
    expect(mocks.queueSelectedNotaryRequestNotificationMock).toHaveBeenCalledWith({
      documentId: "doc-1",
      requestId: "req-1",
      selectedNotaryUserId: "notary-1",
      requestedBySupabaseUserId: "user-1",
    });
    expect(mocks.runDueNotificationJobsMock).toHaveBeenCalledWith({
      limit: 1,
      notificationJobIds: ["job-selected-notary"],
    });
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "system.selected_notary_notified",
        metadata: expect.objectContaining({
          notification_job_id: "job-selected-notary",
          inline_processed_count: 1,
        }),
      }),
    );
  });

  it("rejects a selected notary outside the document jurisdiction", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-123",
      status: "pending_notary",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: "notarize_document",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.getUserIdentityContextByUserIdMock.mockResolvedValue({
      id: "notary-1",
      supabaseUserId: "notary-supabase-1",
      email: "notary@example.com",
      phone: null,
      role: "notary",
      status: "active",
      firstName: "Nora",
      lastName: "Tary",
      emailConfirmedAt: null,
      phoneConfirmedAt: null,
      lastSignInAt: null,
      lastAuthSyncedAt: null,
      availableRoles: ["notary"],
      roleAssignments: [],
    });
    mocks.getNotaryProfileByUserIdMock.mockResolvedValue({
      id: "profile-1",
      userId: "notary-1",
      jurisdiction: "US-CA",
      serviceAreaKind: "county",
      serviceAreaName: "Los Angeles County",
      commissionNumber: null,
      commissionExpiresAt: "2027-01-01T00:00:00.000Z",
      sealStoragePath: null,
      signatureDataUrl: null,
      sealDataUrl: null,
      createdAt: "2026-03-05T00:00:00.000Z",
      updatedAt: "2026-03-05T00:00:00.000Z",
    });

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      { selectedNotaryUserId: "notary-1" },
      "rejects selected notary outside jurisdiction"
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Selected notary must belong to the document jurisdiction");
    expect(mocks.createNotarizationRequestMock).not.toHaveBeenCalled();
  });

  it("rejects an inactive selected notary", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-123",
      status: "pending_notary",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: "notarize_document",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.getUserIdentityContextByUserIdMock.mockResolvedValue(buildActiveNotaryIdentity({
      role: "member",
      availableRoles: ["member"],
      roleAssignments: [],
    }));

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      { selectedNotaryUserId: "notary-1" },
      "rejects inactive selected notary"
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Selected notary must be an active notary user");
    expect(mocks.getNotaryProfileByUserIdMock).not.toHaveBeenCalled();
    expect(mocks.createNotarizationRequestMock).not.toHaveBeenCalled();
  });

  it("rejects selected notary self-selection", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-123",
      status: "pending_notary",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: "notarize_document",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      { selectedNotaryUserId: "owner-1" },
      "rejects selected notary self-selection"
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Selected notary cannot be the document owner");
    expect(mocks.getUserIdentityContextByUserIdMock).not.toHaveBeenCalled();
    expect(mocks.createNotarizationRequestMock).not.toHaveBeenCalled();
  });

  it("rejects an expired selected notary commission", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-123",
      status: "pending_notary",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: "notarize_document",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.getUserIdentityContextByUserIdMock.mockResolvedValue(buildActiveNotaryIdentity());
    mocks.getNotaryProfileByUserIdMock.mockResolvedValue(buildNotaryProfile({
      commissionExpiresAt: "2025-01-01T00:00:00.000Z",
    }));

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      { selectedNotaryUserId: "notary-1" },
      "rejects expired selected notary commission"
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Selected notary commission is expired");
    expect(mocks.createNotarizationRequestMock).not.toHaveBeenCalled();
  });

  it("lists available notaries for the document jurisdiction", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-123",
      status: "pending_notary",
      document_type: "generic",
      jurisdiction: "OH",
      product_flow_mode: "notarize_document",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.getActiveNotarizationRequestMock.mockResolvedValue(null);
    mocks.listAvailableNotariesByJurisdictionMock.mockResolvedValue([
      {
        userId: "notary-1",
        displayName: "Nora Tary",
        jurisdiction: "US-OH",
        serviceAreaKind: "county",
        serviceAreaName: "Franklin County",
        commissionExpiresAt: "2027-01-01T00:00:00.000Z",
      },
    ]);

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await getWithLog(
      "/documents/doc-1/available-notaries",
      token,
      "lists available notaries"
    );

    expect(response.status).toBe(200);
    expect(response.body.document.normalizedJurisdiction).toBe("US-OH");
    expect(response.body.notaries).toEqual([
      expect.objectContaining({ userId: "notary-1", displayName: "Nora Tary" }),
    ]);
    expect(mocks.listAvailableNotariesByJurisdictionMock).toHaveBeenCalledWith({
      jurisdiction: "OH",
      excludeUserId: "owner-1",
    });
  });

  it("returns 404 when listing available notaries for a missing document", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue(null);

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await getWithLog(
      "/documents/doc-404/available-notaries",
      token,
      "available notaries missing document"
    );

    expect(response.status).toBe(404);
    expect(mocks.listAvailableNotariesByJurisdictionMock).not.toHaveBeenCalled();
  });

  it("returns 404 when a member lists available notaries for another member document", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-123",
      status: "pending_notary",
      document_type: "generic",
      jurisdiction: "OH",
      product_flow_mode: "notarize_document",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("other-user-1");

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await getWithLog(
      "/documents/doc-1/available-notaries",
      token,
      "available notaries non-owner"
    );

    expect(response.status).toBe(404);
    expect(mocks.listAvailableNotariesByJurisdictionMock).not.toHaveBeenCalled();
  });

  it("rejects available notary listing when document jurisdiction is missing", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-123",
      status: "pending_notary",
      document_type: "generic",
      jurisdiction: null,
      product_flow_mode: "notarize_document",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await getWithLog(
      "/documents/doc-1/available-notaries",
      token,
      "available notaries missing jurisdiction"
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Document jurisdiction is required to list available notaries");
    expect(mocks.listAvailableNotariesByJurisdictionMock).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listDocumentsMock: vi.fn(),
  listNotarizationRequestsMock: vi.fn(),
  getDocumentByIdMock: vi.fn(),
  getLatestNotarizationRequestForDocumentMock: vi.fn(),
  getIlluminotarizationWorkflowByIdMock: vi.fn(),
  listWorkflowStatusHistoryMock: vi.fn(),
  getLatestCodeDeliveryForRequestMock: vi.fn(),
  getMeetingByRequestIdMock: vi.fn(),
  getVerificationSnapshotByIdnMock: vi.fn(),
  getVerificationSnapshotForDocumentMock: vi.fn(),
  getLatestPublicVerificationCheckByIdnMock: vi.fn(),
  listRecentAuditEventsForDocumentIdsMock: vi.fn(),
  getWorkspaceIdentitySummaryByUserIdMock: vi.fn(),
  canViewerAccessFinalPackageMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/documentService")>(
    "../../src/services/documentService",
  );

  return {
    ...actual,
    listDocuments: mocks.listDocumentsMock,
    listNotarizationRequests: mocks.listNotarizationRequestsMock,
    getDocumentById: mocks.getDocumentByIdMock,
    getLatestNotarizationRequestForDocument:
      mocks.getLatestNotarizationRequestForDocumentMock,
  };
});

vi.mock("../../src/services/documentFinalizationService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/documentFinalizationService")>(
    "../../src/services/documentFinalizationService",
  );

  return {
    ...actual,
    getVerificationSnapshotByIdn: mocks.getVerificationSnapshotByIdnMock,
    getVerificationSnapshotForDocument:
      mocks.getVerificationSnapshotForDocumentMock,
    getLatestPublicVerificationCheckByIdn:
      mocks.getLatestPublicVerificationCheckByIdnMock,
  };
});

vi.mock("../../src/services/illuminotarizationWorkflowService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/illuminotarizationWorkflowService")>(
    "../../src/services/illuminotarizationWorkflowService",
  );

  return {
    ...actual,
    getIlluminotarizationWorkflowById:
      mocks.getIlluminotarizationWorkflowByIdMock,
    listWorkflowStatusHistory: mocks.listWorkflowStatusHistoryMock,
    getLatestCodeDeliveryForRequest:
      mocks.getLatestCodeDeliveryForRequestMock,
  };
});

vi.mock("../../src/services/meetingService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/meetingService")>(
    "../../src/services/meetingService",
  );

  return {
    ...actual,
    getMeetingByRequestId: mocks.getMeetingByRequestIdMock,
  };
});

vi.mock("../../src/services/auditService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/auditService")>(
    "../../src/services/auditService",
  );

  return {
    ...actual,
    listRecentAuditEventsForDocumentIds:
      mocks.listRecentAuditEventsForDocumentIdsMock,
  };
});

vi.mock("../../src/services/workspaceIdentitySummaryService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/workspaceIdentitySummaryService")>(
    "../../src/services/workspaceIdentitySummaryService",
  );

  return {
    ...actual,
    getWorkspaceIdentitySummaryByUserId:
      mocks.getWorkspaceIdentitySummaryByUserIdMock,
  };
});

vi.mock("../../src/services/billingPolicyService", () => ({
  canViewerAccessFinalPackage: mocks.canViewerAccessFinalPackageMock,
}));

import {
  getSharedVerificationDetail,
  listSharedVerifications,
} from "../../src/services/verificationReadModelService";

describe("verificationReadModelService", () => {
  beforeEach(() => {
    mocks.listDocumentsMock.mockReset();
    mocks.listNotarizationRequestsMock.mockReset();
    mocks.getDocumentByIdMock.mockReset();
    mocks.getLatestNotarizationRequestForDocumentMock.mockReset();
    mocks.getIlluminotarizationWorkflowByIdMock.mockReset();
    mocks.listWorkflowStatusHistoryMock.mockReset();
    mocks.getLatestCodeDeliveryForRequestMock.mockReset();
    mocks.getMeetingByRequestIdMock.mockReset();
    mocks.getVerificationSnapshotByIdnMock.mockReset();
    mocks.getVerificationSnapshotForDocumentMock.mockReset();
    mocks.getLatestPublicVerificationCheckByIdnMock.mockReset();
    mocks.listRecentAuditEventsForDocumentIdsMock.mockReset();
    mocks.getWorkspaceIdentitySummaryByUserIdMock.mockReset();
    mocks.canViewerAccessFinalPackageMock.mockReset();
    mocks.listDocumentsMock.mockResolvedValue([]);
    mocks.listNotarizationRequestsMock.mockResolvedValue([]);
    mocks.getDocumentByIdMock.mockResolvedValue(null);
    mocks.getLatestNotarizationRequestForDocumentMock.mockResolvedValue(null);
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue(null);
    mocks.listWorkflowStatusHistoryMock.mockResolvedValue([]);
    mocks.getLatestCodeDeliveryForRequestMock.mockResolvedValue(null);
    mocks.getMeetingByRequestIdMock.mockResolvedValue(null);
    mocks.canViewerAccessFinalPackageMock.mockResolvedValue(true);
    mocks.getVerificationSnapshotByIdnMock.mockResolvedValue({
      document: null,
      hashRecord: null,
      ledgerEntry: null,
      ledgerAnchorAttempt: null,
    });
    mocks.getVerificationSnapshotForDocumentMock.mockResolvedValue({
      document: null,
      hashRecord: null,
      ledgerEntry: null,
      ledgerAnchorAttempt: null,
    });
    mocks.getLatestPublicVerificationCheckByIdnMock.mockResolvedValue(null);
    mocks.listRecentAuditEventsForDocumentIdsMock.mockResolvedValue([]);
    mocks.getWorkspaceIdentitySummaryByUserIdMock.mockImplementation(async (userId?: string | null) => {
      const byId = {
        "member-db-1": {
          userId: "member-db-1",
          supabaseUserId: "member-1",
          displayName: "Member User",
          fullName: "Member User",
          email: "member@example.com",
          role: "member",
          status: "active",
        },
        "notary-db-1": {
          userId: "notary-db-1",
          supabaseUserId: "notary-1",
          displayName: "Notary User",
          fullName: "Notary User",
          email: "notary@example.com",
          role: "notary",
          status: "active",
        },
      } as const;

      return userId ? byId[userId as keyof typeof byId] ?? null : null;
    });
  });

  it("lists shared verification results for the current member", async () => {
    mocks.listDocumentsMock.mockResolvedValue([
      {
        id: "doc-1",
        owner_id: "member-db-1",
        idn: "IDN-1234567890",
        status: "completed",
        document_type: "power_of_attorney",
        jurisdiction: "US-CA",
        product_flow_mode: "poa_only",
        selected_families: null,
        output_bundle: [],
        intake_status: null,
        intake_schema_version: null,
        intake_last_saved_at: null,
        intake_submitted_at: null,
        created_at: "2026-04-22T09:00:00.000Z",
        updated_at: "2026-04-22T10:00:00.000Z",
      },
    ]);
    mocks.getVerificationSnapshotForDocumentMock.mockResolvedValue({
      document: { id: "doc-1", status: "completed" },
      hashRecord: {
        id: "hash-1",
        hash: "hash-value",
        status: "completed",
      },
      ledgerEntry: {
        id: "ledger-1",
        hash: "hash-value",
        ledger_tx_id: "tx-1",
        anchored_at: "2026-04-22T12:00:00.000Z",
      },
      ledgerAnchorAttempt: {
        id: "anchor-1",
        document_id: "doc-1",
        document_hash_record_id: "hash-1",
        ledger_entry_id: "ledger-1",
        status: "anchored",
        attempt_number: 1,
        requested_at: "2026-04-22T12:00:00.000Z",
        completed_at: "2026-04-22T12:00:00.000Z",
        failed_at: null,
        error_message: null,
        response_payload: {},
        created_at: "2026-04-22T12:00:00.000Z",
        updated_at: "2026-04-22T12:00:00.000Z",
      },
    });
    mocks.getLatestPublicVerificationCheckByIdnMock.mockResolvedValue({
      id: "check-1",
      created_at: "2026-04-22T12:30:00.000Z",
    });
    mocks.getLatestNotarizationRequestForDocumentMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      workflow_id: "wf-1",
      assigned_notary_id: "notary-db-1",
      status: "completed",
      submitted_at: "2026-04-22T10:00:00.000Z",
      created_at: "2026-04-22T10:00:00.000Z",
    });

    const results = await listSharedVerifications({
      role: "member",
      viewerUserId: "member-db-1",
      limit: 25,
      offset: 0,
    });

    expect(results).toEqual([
      expect.objectContaining({
        idn: "IDN-1234567890",
        documentId: "doc-1",
        status: "verified",
        owner: expect.objectContaining({ displayName: "Member User" }),
        notary: expect.objectContaining({ displayName: "Notary User" }),
        publicVerifyPath: "/verify/IDN-1234567890",
      }),
    ]);
  });

  it("gets a shared verification detail payload", async () => {
    mocks.getVerificationSnapshotByIdnMock.mockResolvedValue({
      document: {
        id: "doc-1",
        owner_id: "member-db-1",
        idn: "IDN-1234567890",
        status: "completed",
        document_type: "power_of_attorney",
        jurisdiction: "US-CA",
        product_flow_mode: "poa_only",
        selected_families: null,
        output_bundle: [],
        intake_status: null,
        intake_schema_version: null,
        intake_last_saved_at: null,
        intake_submitted_at: null,
        created_at: "2026-04-22T09:00:00.000Z",
        updated_at: "2026-04-22T10:00:00.000Z",
      },
      hashRecord: {
        id: "hash-1",
        hash: "hash-value",
        status: "completed",
      },
      ledgerEntry: {
        id: "ledger-1",
        hash: "hash-value",
        ledger_tx_id: "tx-1",
        anchored_at: "2026-04-22T12:00:00.000Z",
      },
      ledgerAnchorAttempt: {
        id: "anchor-1",
        document_id: "doc-1",
        document_hash_record_id: "hash-1",
        ledger_entry_id: "ledger-1",
        status: "anchored",
        attempt_number: 1,
        requested_at: "2026-04-22T12:00:00.000Z",
        completed_at: "2026-04-22T12:00:00.000Z",
        failed_at: null,
        error_message: null,
        response_payload: {},
        created_at: "2026-04-22T12:00:00.000Z",
        updated_at: "2026-04-22T12:00:00.000Z",
      },
    });
    mocks.getLatestNotarizationRequestForDocumentMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      workflow_id: "wf-1",
      assigned_notary_id: "notary-db-1",
      status: "completed",
      submitted_at: "2026-04-22T10:00:00.000Z",
      created_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.getMeetingByRequestIdMock.mockResolvedValue({
      id: "meeting-1",
      request_id: "req-1",
      workflow_id: "wf-1",
      scheduled_at: "2026-04-22T11:00:00.000Z",
      timezone: "America/Los_Angeles",
      location: "San Francisco",
      status: "completed",
      same_place_required: true,
      same_place_status: "verified",
      metadata: {},
      created_at: "2026-04-22T10:30:00.000Z",
      updated_at: "2026-04-22T11:30:00.000Z",
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
      id: "wf-1",
      owner_user_id: "member-db-1",
      created_by_user_id: "member-db-1",
      primary_document_id: "doc-1",
      workflow_kind: "single_document",
      status: "completed",
      selected_notary_user_id: "notary-db-1",
      assigned_notary_user_id: "notary-db-1",
      current_legacy_request_id: "req-1",
      submitted_at: "2026-04-22T10:00:00.000Z",
      last_code_generated_at: "2026-04-22T10:05:00.000Z",
      review_started_at: "2026-04-22T10:10:00.000Z",
      closed_at: "2026-04-22T12:10:00.000Z",
      context_json: {},
      metadata: {},
      created_at: "2026-04-22T10:00:00.000Z",
      updated_at: "2026-04-22T12:10:00.000Z",
    });
    mocks.listWorkflowStatusHistoryMock.mockResolvedValue([
      {
        id: "status-1",
        workflow_id: "wf-1",
        legacy_request_id: "req-1",
        previous_status: "in_review",
        next_status: "completed",
        changed_by_user_id: "notary-db-1",
        change_source: "review_decision",
        change_reason: null,
        metadata: {},
        created_at: "2026-04-22T12:10:00.000Z",
      },
    ]);
    mocks.getLatestCodeDeliveryForRequestMock.mockResolvedValue({
      id: "code-1",
      workflow_id: "wf-1",
      legacy_request_id: "req-1",
      illuminotarization_code_id: "legacy-code-1",
      notification_job_id: null,
      previous_code_delivery_id: null,
      recipient_user_id: "member-db-1",
      channel: "email",
      delivery_method: "notification_outbox",
      delivery_reason: "initial_submit",
      status: "delivered",
      recipient_address: "member@example.com",
      code_value_snapshot: "123456",
      expires_at: "2026-04-23T10:05:00.000Z",
      delivered_at: "2026-04-22T10:05:00.000Z",
      consumed_at: null,
      invalidated_at: null,
      metadata: {},
      created_at: "2026-04-22T10:05:00.000Z",
      updated_at: "2026-04-22T10:05:00.000Z",
    });
    mocks.getLatestPublicVerificationCheckByIdnMock.mockResolvedValue({
      id: "check-1",
      document_id: "doc-1",
      document_hash_record_id: "hash-1",
      ledger_entry_id: "ledger-1",
      idn: "IDN-1234567890",
      result_status: "verified",
      request_ip: null,
      user_agent: null,
      metadata: {},
      created_at: "2026-04-22T12:30:00.000Z",
    });
    mocks.listRecentAuditEventsForDocumentIdsMock.mockResolvedValue([
      {
        id: "audit-1",
        actor_id: null,
        entity_type: "verification",
        entity_id: "doc-1",
        action: "public.verification_requested",
        metadata: {},
        created_at: "2026-04-22T12:30:00.000Z",
      },
    ]);

    const detail = await getSharedVerificationDetail({
      idn: "IDN-1234567890",
      role: "member",
      viewerUserId: "member-db-1",
    });

    expect(detail).toMatchObject({
      verification: {
        idn: "IDN-1234567890",
        documentId: "doc-1",
        status: "verified",
        publicVerifyPath: "/verify/IDN-1234567890",
      },
      request: {
        id: "req-1",
        workflowId: "wf-1",
        meetingId: "meeting-1",
      },
      workflow: {
        id: "wf-1",
        latestStatus: "completed",
      },
      latestCodeDelivery: {
        id: "code-1",
        status: "delivered",
      },
      latestCheck: {
        id: "check-1",
        resultStatus: "verified",
      },
      anchorAttempt: {
        status: "anchored",
        attemptNumber: 1,
      },
      owner: {
        displayName: "Member User",
      },
      notary: {
        displayName: "Notary User",
      },
      documents: [
        {
          id: "doc-1",
          idn: "IDN-1234567890",
        },
      ],
      audit: [
        {
          action: "public.verification_requested",
          message: "Public Verification Requested",
        },
      ],
    });
  });
});

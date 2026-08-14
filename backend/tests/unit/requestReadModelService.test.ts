import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listDocumentsMock: vi.fn(),
  listNotarizationRequestsMock: vi.fn(),
  getNotarizationRequestByIdMock: vi.fn(),
  getDocumentByIdMock: vi.fn(),
  listDocumentGenerationRunsMock: vi.fn(),
  listDocumentVersionsMock: vi.fn(),
  buildDocumentWorkspaceSummaryMock: vi.fn(),
  getWorkspaceIdentitySummaryByUserIdMock: vi.fn(),
  listDocumentSystemValuesMock: vi.fn(),
  createDocumentDownloadUrlMock: vi.fn(),
  listFinalizationStatusHistoryMock: vi.fn(),
  getIlluminotarizationWorkflowByIdMock: vi.fn(),
  getLatestCodeDeliveryForRequestMock: vi.fn(),
  listWorkflowStatusHistoryMock: vi.fn(),
  getMeetingByRequestIdMock: vi.fn(),
  listMeetingsByRequestIdsMock: vi.fn(),
  listMeetingParticipantsMock: vi.fn(),
  listIdentityVerificationEventsMock: vi.fn(),
  listProximityEvaluationsMock: vi.fn(),
  listMeetingArtifactsMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/documentService")>(
    "../../src/services/documentService",
  );

  return {
    ...actual,
    listDocuments: mocks.listDocumentsMock,
    listNotarizationRequests: mocks.listNotarizationRequestsMock,
    getNotarizationRequestById: mocks.getNotarizationRequestByIdMock,
    getDocumentById: mocks.getDocumentByIdMock,
    listDocumentGenerationRuns: mocks.listDocumentGenerationRunsMock,
    listDocumentVersions: mocks.listDocumentVersionsMock,
    listDocumentSystemValues: mocks.listDocumentSystemValuesMock,
  };
});

vi.mock("../../src/services/storageService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/storageService")>(
    "../../src/services/storageService",
  );

  return {
    ...actual,
    createDocumentDownloadUrl: mocks.createDocumentDownloadUrlMock,
  };
});

vi.mock("../../src/services/documentWorkspaceReadModelService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/documentWorkspaceReadModelService")>(
    "../../src/services/documentWorkspaceReadModelService",
  );

  return {
    ...actual,
    buildDocumentWorkspaceSummary: mocks.buildDocumentWorkspaceSummaryMock,
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

vi.mock("../../src/services/documentFinalizationService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/documentFinalizationService")>(
    "../../src/services/documentFinalizationService",
  );

  return {
    ...actual,
    listFinalizationStatusHistory: mocks.listFinalizationStatusHistoryMock,
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
    getLatestCodeDeliveryForRequest:
      mocks.getLatestCodeDeliveryForRequestMock,
    listWorkflowStatusHistory: mocks.listWorkflowStatusHistoryMock,
  };
});

vi.mock("../../src/services/meetingService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/meetingService")>(
    "../../src/services/meetingService",
  );

  return {
    ...actual,
    getMeetingByRequestId: mocks.getMeetingByRequestIdMock,
    listMeetingsByRequestIds: mocks.listMeetingsByRequestIdsMock,
    listMeetingParticipants: mocks.listMeetingParticipantsMock,
    listIdentityVerificationEvents: mocks.listIdentityVerificationEventsMock,
    listProximityEvaluations: mocks.listProximityEvaluationsMock,
    listMeetingArtifacts: mocks.listMeetingArtifactsMock,
  };
});

import {
  getSharedRequestDetail,
  getSharedRequestTimeline,
  listSharedRequests,
  RequestReadModelServiceError,
} from "../../src/services/requestReadModelService";

describe("requestReadModelService", () => {
  beforeEach(() => {
    mocks.listDocumentsMock.mockReset();
    mocks.listNotarizationRequestsMock.mockReset();
    mocks.getNotarizationRequestByIdMock.mockReset();
    mocks.getDocumentByIdMock.mockReset();
    mocks.listDocumentGenerationRunsMock.mockReset();
    mocks.listDocumentVersionsMock.mockReset();
    mocks.buildDocumentWorkspaceSummaryMock.mockReset();
    mocks.getWorkspaceIdentitySummaryByUserIdMock.mockReset();
    mocks.listDocumentSystemValuesMock.mockReset();
    mocks.createDocumentDownloadUrlMock.mockReset();
    mocks.listFinalizationStatusHistoryMock.mockReset();
    mocks.getIlluminotarizationWorkflowByIdMock.mockReset();
    mocks.getLatestCodeDeliveryForRequestMock.mockReset();
    mocks.listWorkflowStatusHistoryMock.mockReset();
    mocks.getMeetingByRequestIdMock.mockReset();
    mocks.listMeetingsByRequestIdsMock.mockReset();
    mocks.listMeetingParticipantsMock.mockReset();
    mocks.listIdentityVerificationEventsMock.mockReset();
    mocks.listProximityEvaluationsMock.mockReset();
    mocks.listMeetingArtifactsMock.mockReset();
    mocks.listDocumentsMock.mockResolvedValue([]);
    mocks.listNotarizationRequestsMock.mockResolvedValue([]);
    mocks.getNotarizationRequestByIdMock.mockResolvedValue(null);
    mocks.getDocumentByIdMock.mockResolvedValue(null);
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([]);
    mocks.listDocumentVersionsMock.mockResolvedValue([]);
    mocks.createDocumentDownloadUrlMock.mockResolvedValue({ signedUrl: "https://signed.example/document.pdf" });
    mocks.buildDocumentWorkspaceSummaryMock.mockResolvedValue({
      workflow: {
        requestId: null,
        workflowId: null,
        requestStatus: null,
        latestWorkflowStatus: null,
        latestWorkflowStatusAt: null,
        submittedAt: null,
        assignedNotaryId: null,
        latestCodeStatus: null,
        latestCodeExpiresAt: null,
      },
      finalization: {
        latestStatus: null,
        latestStatusAt: null,
        isAnchored: false,
        isVerificationChecked: false,
      },
      verification: {
        status: "unavailable",
        idn: null,
        verifyPath: null,
      },
    });
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
    mocks.listDocumentSystemValuesMock.mockResolvedValue([]);
    mocks.listFinalizationStatusHistoryMock.mockResolvedValue([]);
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue(null);
    mocks.getLatestCodeDeliveryForRequestMock.mockResolvedValue(null);
    mocks.listWorkflowStatusHistoryMock.mockResolvedValue([]);
    mocks.getMeetingByRequestIdMock.mockResolvedValue(null);
    mocks.listMeetingsByRequestIdsMock.mockResolvedValue([]);
    mocks.listMeetingParticipantsMock.mockResolvedValue([]);
    mocks.listIdentityVerificationEventsMock.mockResolvedValue([]);
    mocks.listProximityEvaluationsMock.mockResolvedValue([]);
    mocks.listMeetingArtifactsMock.mockResolvedValue([]);
  });

  it("lists member-owned shared requests with meeting summaries", async () => {
    mocks.listDocumentsMock.mockResolvedValue([
      { id: "doc-1", owner_id: "member-db-1" },
    ]);
    mocks.listNotarizationRequestsMock.mockResolvedValue([
      {
        id: "req-1",
        document_id: "doc-1",
        workflow_id: "wf-1",
        assigned_notary_id: "notary-db-1",
        status: "pending",
        submitted_at: "2026-04-22T10:00:00.000Z",
        created_at: "2026-04-22T10:00:00.000Z",
      },
    ]);
    mocks.listMeetingsByRequestIdsMock.mockResolvedValue([
      {
        id: "meeting-1",
        request_id: "req-1",
        workflow_id: "wf-1",
        scheduled_at: "2026-04-22T14:00:00.000Z",
        timezone: "UTC",
        location: "Remote",
        status: "scheduled",
        same_place_required: true,
        same_place_status: null,
        evidence_retention_until: null,
        metadata: {},
        created_at: "2026-04-22T11:00:00.000Z",
        updated_at: "2026-04-22T11:00:00.000Z",
      },
    ]);

    const requests = await listSharedRequests({
      role: "member",
      viewerUserId: "member-db-1",
      status: "pending",
      limit: 25,
      offset: 0,
    });

    expect(mocks.listDocumentsMock).toHaveBeenCalledWith("member-db-1");
    expect(mocks.listNotarizationRequestsMock).toHaveBeenCalledWith({
      documentIds: ["doc-1"],
      status: "pending",
      limit: 25,
      offset: 0,
    });
    expect(requests).toEqual([
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
  });

  it("rejects memberId filtering for non-admin roles", async () => {
    await expect(
      listSharedRequests({
        role: "member",
        viewerUserId: "member-db-1",
        memberId: "other-user",
        limit: 50,
        offset: 0,
      }),
    ).rejects.toBeInstanceOf(RequestReadModelServiceError);
  });

  it("builds an enriched shared request detail response", async () => {
    mocks.getNotarizationRequestByIdMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      workflow_id: "wf-1",
      assigned_notary_id: "notary-db-1",
      status: "in_review",
      submitted_at: "2026-04-22T10:00:00.000Z",
      created_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "member-db-1",
      idn: "IDN-123",
      status: "pending_notary",
      document_type: "power_of_attorney",
      jurisdiction: "US-CA",
      product_flow_mode: "poa_only",
      selected_families: ["poa", "idn"],
      output_bundle: [{ outputKey: "poa", outputLabel: "POA" }],
      intake_status: "submitted",
      intake_schema_version: "v1",
      intake_last_saved_at: null,
      intake_submitted_at: "2026-04-22T09:30:00.000Z",
      created_at: "2026-04-22T09:00:00.000Z",
      updated_at: "2026-04-22T09:30:00.000Z",
    });
    mocks.buildDocumentWorkspaceSummaryMock.mockResolvedValue({
      workflow: {
        requestId: "req-1",
        workflowId: "wf-1",
        requestStatus: "in_review",
        latestWorkflowStatus: "in_review",
        latestWorkflowStatusAt: "2026-04-22T10:05:00.000Z",
        submittedAt: "2026-04-22T10:00:00.000Z",
        assignedNotaryId: "notary-db-1",
        latestCodeStatus: "expired",
        latestCodeExpiresAt: "2026-04-22T11:00:00.000Z",
      },
      finalization: {
        latestStatus: "watermark_applied",
        latestStatusAt: "2026-04-22T12:00:00.000Z",
        isAnchored: false,
        isVerificationChecked: false,
      },
      verification: {
        status: "pending_finalization",
        idn: "IDN-123",
        verifyPath: "/verify/IDN-123",
      },
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
      id: "wf-1",
      owner_user_id: "member-db-1",
      created_by_user_id: "member-db-1",
      primary_document_id: "doc-1",
      workflow_kind: "single_document",
      status: "in_review",
      selected_notary_user_id: "notary-db-1",
      assigned_notary_user_id: "notary-db-1",
      current_legacy_request_id: "req-1",
      submitted_at: "2026-04-22T10:00:00.000Z",
      last_code_generated_at: "2026-04-22T10:01:00.000Z",
      review_started_at: "2026-04-22T10:05:00.000Z",
      closed_at: null,
      context_json: {},
      metadata: {},
      created_at: "2026-04-22T10:00:00.000Z",
      updated_at: "2026-04-22T10:05:00.000Z",
    });
    mocks.getLatestCodeDeliveryForRequestMock.mockResolvedValue({
      id: "delivery-1",
      workflow_id: "wf-1",
      legacy_request_id: "req-1",
      illuminotarization_code_id: "code-1",
      notification_job_id: null,
      previous_code_delivery_id: null,
      recipient_user_id: "member-db-1",
      channel: "sms",
      delivery_method: "notification_outbox",
      delivery_reason: "resent",
      status: "expired",
      recipient_address: null,
      code_value_snapshot: "ABCD1234",
      expires_at: "2026-04-22T11:00:00.000Z",
      delivered_at: "2026-04-22T10:02:00.000Z",
      consumed_at: null,
      invalidated_at: "2026-04-22T11:01:00.000Z",
      metadata: {},
      created_at: "2026-04-22T10:01:00.000Z",
      updated_at: "2026-04-22T11:01:00.000Z",
    });
    mocks.listWorkflowStatusHistoryMock.mockResolvedValue([
      {
        id: "hist-1",
        workflow_id: "wf-1",
        legacy_request_id: "req-1",
        previous_status: "submitted",
        next_status: "in_review",
        changed_by_user_id: "notary-db-1",
        change_source: "review_decision",
        change_reason: null,
        metadata: {},
        created_at: "2026-04-22T10:05:00.000Z",
      },
    ]);
    mocks.getMeetingByRequestIdMock.mockResolvedValue({
      id: "meeting-1",
      request_id: "req-1",
      workflow_id: "wf-1",
      scheduled_at: "2026-04-22T14:00:00.000Z",
      timezone: "UTC",
      location: "Remote",
      status: "scheduled",
      same_place_required: true,
      same_place_status: null,
      evidence_retention_until: null,
      metadata: {
        proposedSlots: ["2026-04-22T14:00:00.000Z"],
      },
      created_at: "2026-04-22T10:10:00.000Z",
      updated_at: "2026-04-22T10:10:00.000Z",
    });
    mocks.listMeetingParticipantsMock.mockResolvedValue([
      {
        id: "participant-1",
        meeting_id: "meeting-1",
        user_id: "member-db-1",
        document_party_id: null,
        participant_role: "member",
        status: "confirmed",
        presence_required: true,
        participant_label: "Member",
        arrived_at: null,
        departed_at: null,
        metadata: {},
        created_at: "2026-04-22T10:10:00.000Z",
        updated_at: "2026-04-22T10:10:00.000Z",
      },
    ]);
    mocks.listIdentityVerificationEventsMock.mockResolvedValue([
      {
        id: "identity-1",
        meeting_id: "meeting-1",
        meeting_participant_id: "participant-1",
        verification_method: "in_person_document",
        status: "verified",
        subject_name_snapshot: "Member User",
        document_type: "driver_license",
        document_last4: "1234",
        issuing_jurisdiction: "US-CA",
        verified_at: "2026-04-22T14:12:00.000Z",
        notes: null,
        metadata: {},
        created_at: "2026-04-22T14:12:00.000Z",
        updated_at: "2026-04-22T14:12:00.000Z",
      },
    ]);
    mocks.listProximityEvaluationsMock.mockResolvedValue([
      {
        id: "proximity-1",
        meeting_id: "meeting-1",
        evaluation_kind: "same_place",
        status: "passed",
        member_sample_id: "geo-member-1",
        notary_sample_id: "geo-notary-1",
        threshold_meters: 50,
        observed_distance_meters: 8.2,
        evaluated_at: "2026-04-22T14:08:00.000Z",
        notes: null,
        metadata: {},
        created_at: "2026-04-22T14:08:00.000Z",
        updated_at: "2026-04-22T14:08:00.000Z",
      },
    ]);
    mocks.listMeetingArtifactsMock.mockResolvedValue([
      {
        id: "artifact-1",
        meeting_id: "meeting-1",
        meeting_participant_id: "participant-1",
        meeting_checkin_id: null,
        identity_verification_event_id: "identity-1",
        artifact_kind: "venue_capture",
        status: "active",
        storage_bucket: null,
        storage_path: null,
        mime_type: "application/json",
        size_bytes: null,
        captured_at: "2026-04-22T14:15:00.000Z",
        retention_until: null,
        metadata: {},
        created_at: "2026-04-22T14:15:00.000Z",
        updated_at: "2026-04-22T14:15:00.000Z",
      },
    ]);
    mocks.listDocumentVersionsMock.mockResolvedValue([
      {
        id: "version-1",
        document_id: "doc-1",
        version: 1,
        storage_path: "documents/doc-1/generated-v1.pdf",
        file_name: "generated-v1.pdf",
        mime_type: "application/pdf",
        size_bytes: 12345,
        is_final: false,
        generation_run_id: "generation-1",
        created_by: "member-db-1",
        created_at: "2026-04-22T09:35:00.000Z",
      },
      {
        id: "version-2",
        document_id: "doc-1",
        version: 2,
        storage_path: "documents/doc-1/generated-signed.pdf",
        file_name: "generated-signed.pdf",
        mime_type: "application/pdf",
        size_bytes: 23456,
        is_final: false,
        generation_run_id: "generation-1",
        created_by: "notary-db-1",
        created_at: "2026-04-22T10:20:00.000Z",
      },
      {
        id: "version-3",
        document_id: "doc-1",
        version: 3,
        storage_path: "documents/doc-1/generated-signed-finalized-v3.pdf",
        file_name: "generated-signed-finalized-v3.pdf",
        mime_type: "application/pdf",
        size_bytes: 24567,
        is_final: false,
        generation_run_id: "generation-1",
        created_by: "notary-db-1",
        created_at: "2026-04-22T10:30:00.000Z",
      },
    ]);

    const detail = await getSharedRequestDetail({
      requestId: "req-1",
      role: "notary",
      viewerUserId: "notary-db-1",
    });

    expect(detail).toMatchObject({
      request: {
        id: "req-1",
        documentId: "doc-1",
        workflowId: "wf-1",
        status: "in_review",
      },
      document: {
        id: "doc-1",
        idn: "IDN-123",
        status: "pending_notary",
        documentType: "power_of_attorney",
        jurisdiction: "US-CA",
        productFlowMode: "poa_only",
        selectedFamilies: ["poa", "idn"],
        outputBundle: [{ outputKey: "poa", outputLabel: "POA" }],
        reviewDocuments: [
          {
            id: "version-3",
            label: "generated-signed-finalized-v3.pdf",
            downloadUrl: "https://signed.example/document.pdf",
          },
        ],
        summary: {
          verification: {
            status: "pending_finalization",
            verifyPath: "/verify/IDN-123",
          },
        },
      },
      workflow: {
        id: "wf-1",
        status: "in_review",
        latestStatus: "in_review",
        latestStatusAt: "2026-04-22T10:05:00.000Z",
        selectedNotaryUserId: "notary-db-1",
        assignedNotaryUserId: "notary-db-1",
      },
      meeting: {
        meetingId: "meeting-1",
        identityVerifications: [
          {
            id: "identity-1",
            participantRole: "member",
            status: "verified",
          },
        ],
        proximityEvaluations: [
          {
            id: "proximity-1",
            status: "passed",
          },
        ],
        artifacts: [
          {
            id: "artifact-1",
            artifactKind: "venue_capture",
            status: "active",
          },
        ],
      },
      latestCodeDelivery: {
        id: "delivery-1",
        channel: "sms",
        deliveryMethod: "notification_outbox",
        deliveryReason: "resent",
        status: "expired",
      },
      owner: {
        userId: "member-db-1",
        displayName: "Member User",
      },
      notary: {
        userId: "notary-db-1",
        displayName: "Notary User",
      },
      capabilities: {
        canViewDocument: true,
        canViewTimeline: true,
        canManageMeeting: true,
        canReviewRequest: true,
        canFinalizeDocument: true,
        canOpenVerification: true,
      },
      nextAction: "Resend or regenerate the access code before continuing the request.",
    });
    expect(detail?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "code_expired" }),
        expect.objectContaining({ code: "awaiting_review" }),
      ]),
    );
  });

  it("labels shared package review documents from generation run output labels", async () => {
    mocks.getNotarizationRequestByIdMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      workflow_id: null,
      assigned_notary_id: "notary-db-1",
      status: "pending_notary",
      submitted_at: "2026-04-22T10:00:00.000Z",
      created_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "member-db-1",
      idn: "IDN-123",
      status: "pending_notary",
      document_type: "trust_bundle",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      selected_families: ["trust", "poa"],
      output_bundle: [
        { outputKey: "trust_certificate", outputLabel: "Certificate of Trust" },
        { outputKey: "trust_rrr", outputLabel: "Trust Registration Amendment" },
        { outputKey: "poa_document_tm2", outputLabel: "Power of Attorney - Mina Patel" },
      ],
      intake_status: "submitted",
      intake_schema_version: "v1",
      intake_last_saved_at: null,
      intake_submitted_at: "2026-04-22T09:30:00.000Z",
      created_at: "2026-04-22T09:00:00.000Z",
      updated_at: "2026-04-22T09:30:00.000Z",
    });
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([
      { id: "run-rrr", output_key: "trust_rrr" },
      { id: "run-cert", output_key: "trust_certificate" },
      { id: "run-poa-tm2", output_key: "poa_document_tm2" },
    ]);
    mocks.listDocumentVersionsMock.mockResolvedValue([
      {
        id: "version-cert",
        document_id: "doc-1",
        version: 3,
        storage_path: "documents/doc-1/cert-finalized-v3.pdf",
        file_name: "cert-finalized-v3.pdf",
        mime_type: "application/pdf",
        size_bytes: 12345,
        is_final: false,
        generation_run_id: "run-cert",
        created_by: "member-db-1",
        created_at: "2026-04-22T09:35:00.000Z",
      },
      {
        id: "version-rrr",
        document_id: "doc-1",
        version: 4,
        storage_path: "documents/doc-1/rrr-finalized-v4.pdf",
        file_name: "rrr-finalized-v4.pdf",
        mime_type: "application/pdf",
        size_bytes: 23456,
        is_final: false,
        generation_run_id: "run-rrr",
        created_by: "member-db-1",
        created_at: "2026-04-22T09:36:00.000Z",
      },
      {
        id: "version-poa-tm2",
        document_id: "doc-1",
        version: 5,
        storage_path: "documents/doc-1/poa-trustmaker-2-finalized-v5.pdf",
        file_name: "poa-trustmaker-2-finalized-v5.pdf",
        mime_type: "application/pdf",
        size_bytes: 34567,
        is_final: false,
        generation_run_id: "run-poa-tm2",
        created_by: "member-db-1",
        created_at: "2026-04-22T09:37:00.000Z",
      },
    ]);

    const detail = await getSharedRequestDetail({
      requestId: "req-1",
      role: "member",
      viewerUserId: "member-db-1",
    });

    expect(detail?.document.reviewDocuments.map((document) => document.label)).toEqual([
      "Certificate of Trust",
      "Trust Registration Amendment",
      "Power of Attorney - Mina Patel",
    ]);
  });

  it("includes uploaded notarization source PDFs in shared request review documents", async () => {
    mocks.getNotarizationRequestByIdMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      workflow_id: null,
      assigned_notary_id: "notary-db-1",
      status: "in_review",
      submitted_at: "2026-04-22T10:00:00.000Z",
      created_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "member-db-1",
      idn: "IDN-123",
      status: "pending_notary",
      document_type: "notarize_document",
      jurisdiction: "US-OH",
      product_flow_mode: "notarize_document",
      selected_families: [],
      output_bundle: [],
      intake_status: "submitted",
      intake_schema_version: "v1",
      intake_last_saved_at: null,
      intake_submitted_at: "2026-04-22T09:30:00.000Z",
      created_at: "2026-04-22T09:00:00.000Z",
      updated_at: "2026-04-22T09:30:00.000Z",
    });
    mocks.listDocumentVersionsMock.mockResolvedValue([
      {
        id: "version-source",
        document_id: "doc-1",
        version: 1,
        storage_path: "documents/doc-1/source.pdf",
        file_name: "commission.pdf",
        mime_type: "application/pdf",
        size_bytes: 12345,
        is_final: false,
        generation_run_id: null,
        created_by: "member-db-1",
        created_at: "2026-04-22T09:35:00.000Z",
      },
    ]);

    const detail = await getSharedRequestDetail({
      requestId: "req-1",
      role: "member",
      viewerUserId: "member-db-1",
    });

    expect(detail?.document.reviewDocuments).toMatchObject([
      {
        id: "version-source",
        label: "commission.pdf",
        downloadUrl: "https://signed.example/document.pdf",
      },
    ]);
  });

  it("builds a shared request timeline for an authorized member", async () => {
    mocks.getNotarizationRequestByIdMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      workflow_id: null,
      assigned_notary_id: "notary-db-1",
      status: "pending",
      submitted_at: "2026-04-22T10:00:00.000Z",
      created_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "member-db-1",
      status: "pending_notary",
      created_at: "2026-04-22T09:00:00.000Z",
      intake_submitted_at: null,
    });
    mocks.listFinalizationStatusHistoryMock.mockResolvedValue([
      {
        id: "fin-1",
        document_id: "doc-1",
        execution_run_id: null,
        document_hash_record_id: null,
        ledger_anchor_attempt_id: null,
        changed_by_user_id: "notary-db-1",
        status: "ledger_anchored",
        change_source: "system",
        change_reason: null,
        metadata: {},
        created_at: "2026-04-22T12:00:00.000Z",
      },
    ]);

    const timeline = await getSharedRequestTimeline({
      requestId: "req-1",
      role: "member",
      viewerUserId: "member-db-1",
    });

    expect(timeline).toEqual([
      {
        action: "Document created",
        timestamp: "2026-04-22T09:00:00.000Z",
      },
      {
        action: "Notarization submitted",
        timestamp: "2026-04-22T10:00:00.000Z",
      },
      {
        action: "Ledger anchored",
        timestamp: "2026-04-22T12:00:00.000Z",
        actorId: "notary-db-1",
      },
    ]);
  });

  it("builds shared request detail when workflow enrichment temporarily fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.getNotarizationRequestByIdMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      workflow_id: "wf-1",
      assigned_notary_id: "notary-db-1",
      status: "pending",
      submitted_at: "2026-04-22T10:00:00.000Z",
      created_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "member-db-1",
      idn: "IDN-123",
      status: "pending_notary",
      document_type: "power_of_attorney",
      jurisdiction: "US-CA",
      product_flow_mode: "poa_only",
      selected_families: [],
      output_bundle: [],
      created_at: "2026-04-22T09:00:00.000Z",
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockRejectedValue(new Error("TypeError: fetch failed"));
    mocks.listWorkflowStatusHistoryMock.mockRejectedValue(new Error("TypeError: fetch failed"));

    try {
      const detail = await getSharedRequestDetail({
        requestId: "req-1",
        role: "notary",
        viewerUserId: "notary-db-1",
      });

      expect(detail).toMatchObject({
        request: {
          id: "req-1",
          workflowId: "wf-1",
        },
        workflow: {
          id: "wf-1",
          latestStatus: "pending",
          assignedNotaryUserId: "notary-db-1",
        },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        "Request read model enrichment fallback used",
        expect.objectContaining({ operation: "workflow_lookup" }),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        "Request read model enrichment fallback used",
        expect.objectContaining({ operation: "workflow_status_history" }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("builds shared request timeline when history enrichment temporarily fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.getNotarizationRequestByIdMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      workflow_id: "wf-1",
      assigned_notary_id: "notary-db-1",
      status: "pending",
      submitted_at: "2026-04-22T10:00:00.000Z",
      created_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "member-db-1",
      status: "pending_notary",
      created_at: "2026-04-22T09:00:00.000Z",
      intake_submitted_at: null,
    });
    mocks.listFinalizationStatusHistoryMock.mockRejectedValue(new Error("TypeError: fetch failed"));
    mocks.listWorkflowStatusHistoryMock.mockRejectedValue(new Error("TypeError: fetch failed"));

    try {
      const timeline = await getSharedRequestTimeline({
        requestId: "req-1",
        role: "member",
        viewerUserId: "member-db-1",
      });

      expect(timeline).toEqual([
        {
          action: "Document created",
          timestamp: "2026-04-22T09:00:00.000Z",
        },
        {
          action: "Notarization submitted",
          timestamp: "2026-04-22T10:00:00.000Z",
        },
      ]);
      expect(warnSpy).toHaveBeenCalledWith(
        "Request read model enrichment fallback used",
        expect.objectContaining({ operation: "finalization_status_history" }),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        "Request read model enrichment fallback used",
        expect.objectContaining({ operation: "workflow_status_history" }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
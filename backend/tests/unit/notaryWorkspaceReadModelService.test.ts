import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listNotarizationRequestsMock: vi.fn(),
  getNotarizationRequestByIdMock: vi.fn(),
  getDocumentByIdMock: vi.fn(),
  listDocumentsByIdsMock: vi.fn(),
  listDocumentGenerationRunsMock: vi.fn(),
  listDocumentVersionsMock: vi.fn(),
  buildDocumentWorkspaceSummaryMock: vi.fn(),
  getVerificationSnapshotForDocumentMock: vi.fn(),
  getLatestPublicVerificationCheckByIdnMock: vi.fn(),
  listFinalizationStatusHistoryMock: vi.fn(),
  getIlluminotarizationWorkflowByIdMock: vi.fn(),
  getIlluminotarizationWorkflowByLegacyRequestIdMock: vi.fn(),
  getLatestCodeDeliveryForRequestMock: vi.fn(),
  listWorkflowStatusHistoryMock: vi.fn(),
  getMeetingByRequestIdMock: vi.fn(),
  listMeetingParticipantsMock: vi.fn(),
  listMeetingCheckinsMock: vi.fn(),
  listMeetingGeolocationSamplesMock: vi.fn(),
  listIdentityVerificationEventsMock: vi.fn(),
  listProximityEvaluationsMock: vi.fn(),
  listMeetingArtifactsMock: vi.fn(),
  getWorkspaceIdentitySummaryByUserIdMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/documentService")>(
    "../../src/services/documentService",
  );

  return {
    ...actual,
    listNotarizationRequests: mocks.listNotarizationRequestsMock,
    getNotarizationRequestById: mocks.getNotarizationRequestByIdMock,
    getDocumentById: mocks.getDocumentByIdMock,
    listDocumentsByIds: mocks.listDocumentsByIdsMock,
    listDocumentGenerationRuns: mocks.listDocumentGenerationRunsMock,
    listDocumentVersions: mocks.listDocumentVersionsMock,
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

vi.mock("../../src/services/documentFinalizationService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/documentFinalizationService")>(
    "../../src/services/documentFinalizationService",
  );

  return {
    ...actual,
    getVerificationSnapshotForDocument: mocks.getVerificationSnapshotForDocumentMock,
    getLatestPublicVerificationCheckByIdn:
      mocks.getLatestPublicVerificationCheckByIdnMock,
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
    getIlluminotarizationWorkflowByLegacyRequestId:
      mocks.getIlluminotarizationWorkflowByLegacyRequestIdMock,
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
    listMeetingParticipants: mocks.listMeetingParticipantsMock,
    listMeetingCheckins: mocks.listMeetingCheckinsMock,
    listMeetingGeolocationSamples: mocks.listMeetingGeolocationSamplesMock,
    listIdentityVerificationEvents: mocks.listIdentityVerificationEventsMock,
    listProximityEvaluations: mocks.listProximityEvaluationsMock,
    listMeetingArtifacts: mocks.listMeetingArtifactsMock,
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

import {
  getNotaryRequestContext,
  listNotaryQueue,
} from "../../src/services/notaryWorkspaceReadModelService";

describe("notaryWorkspaceReadModelService", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.listNotarizationRequestsMock.mockResolvedValue([]);
    mocks.getNotarizationRequestByIdMock.mockResolvedValue(null);
    mocks.getDocumentByIdMock.mockResolvedValue(null);
    mocks.listDocumentsByIdsMock.mockImplementation(async (documentIds: string[]) => {
      const documents = await Promise.all(documentIds.map((documentId) => mocks.getDocumentByIdMock(documentId)));
      return documents.filter((document) => document !== null);
    });
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([]);
    mocks.listDocumentVersionsMock.mockResolvedValue([]);
    mocks.buildDocumentWorkspaceSummaryMock.mockResolvedValue({
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
    });
    mocks.getVerificationSnapshotForDocumentMock.mockResolvedValue({
      document: null,
      hashRecord: {
        id: "hash-1",
        hash: "hash-value",
        status: "completed",
      },
      ledgerEntry: {
        id: "ledger-1",
        hash: "hash-value",
        ledger_tx_id: "tx-1",
        anchored_at: "2026-04-22T13:00:00.000Z",
      },
      ledgerAnchorAttempt: {
        id: "anchor-1",
        document_id: "doc-1",
        document_hash_record_id: "hash-1",
        ledger_entry_id: "ledger-1",
        status: "anchored",
        attempt_number: 1,
        requested_at: "2026-04-22T13:00:00.000Z",
        completed_at: "2026-04-22T13:00:00.000Z",
        failed_at: null,
        error_message: null,
        response_payload: {},
        created_at: "2026-04-22T13:00:00.000Z",
        updated_at: "2026-04-22T13:00:00.000Z",
      },
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
      created_at: "2026-04-22T13:10:00.000Z",
    });
    mocks.listFinalizationStatusHistoryMock.mockResolvedValue([
      {
        id: "final-1",
        document_id: "doc-1",
        execution_run_id: null,
        document_hash_record_id: "hash-1",
        ledger_anchor_attempt_id: "anchor-1",
        changed_by_user_id: "notary-db-1",
        status: "ledger_anchored",
        change_source: "system",
        change_reason: null,
        metadata: {},
        created_at: "2026-04-22T13:00:00.000Z",
      },
    ]);
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
      id: "wf-1",
      owner_user_id: "member-db-1",
      created_by_user_id: "member-db-1",
      primary_document_id: "doc-1",
      workflow_kind: "single_document",
      status: "approved",
      selected_notary_user_id: "notary-db-1",
      assigned_notary_user_id: "notary-db-1",
      current_legacy_request_id: "req-1",
      submitted_at: "2026-04-22T10:00:00.000Z",
      last_code_generated_at: "2026-04-22T10:05:00.000Z",
      review_started_at: "2026-04-22T10:10:00.000Z",
      closed_at: null,
      context_json: {},
      metadata: {},
      created_at: "2026-04-22T10:00:00.000Z",
      updated_at: "2026-04-22T12:00:00.000Z",
    });
    mocks.getIlluminotarizationWorkflowByLegacyRequestIdMock.mockResolvedValue(null);
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
    mocks.listWorkflowStatusHistoryMock.mockResolvedValue([
      {
        id: "status-1",
        workflow_id: "wf-1",
        legacy_request_id: "req-1",
        previous_status: "in_review",
        next_status: "approved",
        changed_by_user_id: "notary-db-1",
        change_source: "review_decision",
        change_reason: null,
        metadata: {},
        created_at: "2026-04-22T12:00:00.000Z",
      },
    ]);
    mocks.getMeetingByRequestIdMock.mockResolvedValue({
      id: "meeting-1",
      request_id: "req-1",
      workflow_id: "wf-1",
      scheduled_at: "2026-04-22T11:00:00.000Z",
      timezone: "America/Los_Angeles",
      location: "San Francisco",
      status: "completed",
      same_place_required: true,
      same_place_status: "passed",
      evidence_retention_until: null,
      metadata: { proposedSlots: ["2026-04-22T11:00:00.000Z"] },
      created_at: "2026-04-22T10:30:00.000Z",
      updated_at: "2026-04-22T11:30:00.000Z",
    });
    mocks.listMeetingParticipantsMock.mockResolvedValue([
      {
        id: "participant-1",
        meeting_id: "meeting-1",
        user_id: "member-db-1",
        document_party_id: null,
        participant_role: "member",
        status: "checked_in",
        presence_required: true,
        participant_label: "Member",
        arrived_at: "2026-04-22T10:55:00.000Z",
        departed_at: null,
        metadata: {},
        created_at: "2026-04-22T10:30:00.000Z",
        updated_at: "2026-04-22T10:55:00.000Z",
      },
    ]);
    mocks.listMeetingCheckinsMock.mockResolvedValue([
      {
        id: "checkin-1",
        meeting_id: "meeting-1",
        meeting_participant_id: "participant-1",
        recorded_by_user_id: "notary-db-1",
        checkin_kind: "identity",
        status: "recorded",
        recorded_at: "2026-04-22T11:05:00.000Z",
        notes: null,
        metadata: {},
        created_at: "2026-04-22T11:05:00.000Z",
        updated_at: "2026-04-22T11:05:00.000Z",
      },
    ]);
    mocks.listMeetingGeolocationSamplesMock.mockResolvedValue([
      {
        id: "geo-1",
        meeting_id: "meeting-1",
        meeting_participant_id: "participant-1",
        meeting_checkin_id: "checkin-1",
        captured_by_user_id: "notary-db-1",
        sample_kind: "device_gps",
        capture_stage: "checkin_confirmation",
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy_meters: 10,
        altitude_meters: null,
        captured_at: "2026-04-22T11:05:00.000Z",
        expires_at: null,
        metadata: {},
        created_at: "2026-04-22T11:05:00.000Z",
      },
    ]);
    mocks.listIdentityVerificationEventsMock.mockResolvedValue([
      {
        id: "identity-1",
        meeting_id: "meeting-1",
        meeting_participant_id: "participant-1",
        verified_by_user_id: "notary-db-1",
        verification_method: "in_person_document",
        status: "verified",
        subject_name_snapshot: "Member User",
        document_type: "drivers_license",
        document_last4: "1234",
        issuing_jurisdiction: "CA",
        verified_at: "2026-04-22T11:06:00.000Z",
        notes: null,
        metadata: {},
        created_at: "2026-04-22T11:06:00.000Z",
        updated_at: "2026-04-22T11:06:00.000Z",
      },
    ]);
    mocks.listProximityEvaluationsMock.mockResolvedValue([
      {
        id: "proximity-1",
        meeting_id: "meeting-1",
        evaluated_by_user_id: "notary-db-1",
        member_sample_id: "geo-1",
        notary_sample_id: null,
        evaluation_kind: "same_place",
        status: "passed",
        threshold_meters: 100,
        observed_distance_meters: 3,
        evaluated_at: "2026-04-22T11:07:00.000Z",
        notes: null,
        metadata: {},
        created_at: "2026-04-22T11:07:00.000Z",
        updated_at: "2026-04-22T11:07:00.000Z",
      },
    ]);
    mocks.listMeetingArtifactsMock.mockResolvedValue([
      {
        id: "artifact-1",
        meeting_id: "meeting-1",
        meeting_participant_id: "participant-1",
        meeting_checkin_id: "checkin-1",
        identity_verification_event_id: "identity-1",
        uploaded_by_user_id: "notary-db-1",
        artifact_kind: "identity_document",
        status: "active",
        storage_bucket: "artifacts",
        storage_path: "identity/doc-1.png",
        mime_type: "image/png",
        size_bytes: 123,
        captured_at: "2026-04-22T11:06:30.000Z",
        retention_until: null,
        redacted_at: null,
        metadata: {},
        created_at: "2026-04-22T11:06:30.000Z",
        updated_at: "2026-04-22T11:06:30.000Z",
      },
    ]);
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

  it("lists the notary queue for the assigned notary", async () => {
    mocks.listNotarizationRequestsMock.mockResolvedValue([
      {
        id: "req-1",
        document_id: "doc-1",
        workflow_id: "wf-1",
        assigned_notary_id: "notary-db-1",
        status: "in_review",
        submitted_at: "2026-04-22T10:00:00.000Z",
        created_at: "2026-04-22T10:00:00.000Z",
      },
    ]);
    mocks.getDocumentByIdMock.mockResolvedValue({
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
    });

    const queue = await listNotaryQueue({
      role: "notary",
      viewerUserId: "notary-db-1",
      limit: 25,
      offset: 0,
    });

    expect(queue.counts.total).toBe(1);
    expect(queue.requests[0]).toMatchObject({
      request: {
        id: "req-1",
        queueStatus: "approved",
      },
      owner: {
        displayName: "Member User",
      },
      latestCodeDelivery: {
        id: "code-1",
      },
      meeting: {
        id: "meeting-1",
      },
      finalization: {
        verificationStatus: "verified",
      },
    });
  });

  it("returns a degraded queue when document lookup temporarily fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.listNotarizationRequestsMock.mockResolvedValue([
      {
        id: "req-1",
        document_id: "doc-1",
        workflow_id: "wf-1",
        assigned_notary_id: "notary-db-1",
        status: "in_review",
        submitted_at: "2026-04-22T10:00:00.000Z",
        created_at: "2026-04-22T10:00:00.000Z",
      },
    ]);
    mocks.listDocumentsByIdsMock.mockRejectedValue(new Error("<html><h1>502 Bad Gateway</h1></html>"));

    try {
      const queue = await listNotaryQueue({
        role: "notary",
        viewerUserId: "notary-db-1",
        limit: 25,
        offset: 0,
      });

      expect(queue.requests).toEqual([]);
      expect(queue.meetings).toEqual([]);
      expect(queue.counts).toEqual({
        pending: 0,
        scheduled: 0,
        readyForInPerson: 0,
        completed: 0,
        total: 0,
      });
      expect(warnSpy).toHaveBeenCalledWith(
        "Notary workspace read model enrichment fallback used",
        expect.objectContaining({ operation: "document_lookup", documentCount: 1 }),
      );
      expect(mocks.getIlluminotarizationWorkflowByIdMock).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("lists assigned notary queue requests when workflow lookup temporarily fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.listNotarizationRequestsMock.mockResolvedValue([
      {
        id: "req-1",
        document_id: "doc-1",
        workflow_id: "wf-1",
        assigned_notary_id: "notary-db-1",
        status: "in_review",
        submitted_at: "2026-04-22T10:00:00.000Z",
        created_at: "2026-04-22T10:00:00.000Z",
      },
    ]);
    mocks.getDocumentByIdMock.mockResolvedValue({
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
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockRejectedValue(new Error("TypeError: fetch failed"));

    try {
      const queue = await listNotaryQueue({
        role: "notary",
        viewerUserId: "notary-db-1",
        limit: 25,
        offset: 0,
      });

      expect(queue.counts.total).toBe(1);
      expect(queue.requests[0]?.request.id).toBe("req-1");
      expect(warnSpy).toHaveBeenCalledWith(
        "Notary workspace read model enrichment fallback used",
        expect.objectContaining({ operation: "workflow_lookup" }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("lists notary queue requests when workflow history temporarily fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.listNotarizationRequestsMock.mockResolvedValue([
      {
        id: "req-1",
        document_id: "doc-1",
        workflow_id: "wf-1",
        assigned_notary_id: "notary-db-1",
        status: "in_review",
        submitted_at: "2026-04-22T10:00:00.000Z",
        created_at: "2026-04-22T10:00:00.000Z",
      },
    ]);
    mocks.getDocumentByIdMock.mockResolvedValue({
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
    });
    mocks.listWorkflowStatusHistoryMock.mockRejectedValue(new Error("TypeError: fetch failed"));

    try {
      const queue = await listNotaryQueue({
        role: "notary",
        viewerUserId: "notary-db-1",
        limit: 25,
        offset: 0,
      });

      expect(queue.counts.total).toBe(1);
      expect(queue.requests[0]?.request.queueStatus).toBe("approved");
      expect(warnSpy).toHaveBeenCalledWith(
        "Notary workspace read model enrichment fallback used",
        expect.objectContaining({ operation: "workflow_status_history" }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("gets the notary request context with evidence and finalization state", async () => {
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
    });
    mocks.listDocumentVersionsMock.mockResolvedValue([
      {
        id: "ver-1",
        document_id: "doc-1",
        version: 1,
        storage_path: "documents/doc-1.pdf",
        file_name: "doc-1.pdf",
        mime_type: "application/pdf",
        size_bytes: 1234,
        is_final: true,
        generation_run_id: null,
        created_by: null,
        created_at: "2026-04-22T09:30:00.000Z",
      },
    ]);

    const context = await getNotaryRequestContext({
      requestId: "req-1",
      role: "notary",
      viewerUserId: "notary-db-1",
    });

    expect(context).toMatchObject({
      request: {
        id: "req-1",
      },
      document: {
        id: "doc-1",
        versions: [
          {
            id: "ver-1",
          },
        ],
      },
      notary: {
        displayName: "Notary User",
      },
      meeting: {
        meetingId: "meeting-1",
      },
      evidence: {
        checkins: [
          {
            id: "checkin-1",
          },
        ],
        identityVerifications: [
          {
            id: "identity-1",
          },
        ],
        artifacts: [
          {
            id: "artifact-1",
          },
        ],
      },
      finalization: {
        hash: "hash-value",
        anchorAttempt: {
          id: "anchor-1",
        },
      },
      capabilities: {
        canOpenVerification: true,
      },
    });
  });

  it("labels package review documents from generation run output labels", async () => {
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
      idn: "IDN-1234567890",
      status: "completed",
      document_type: "trust_bundle",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      selected_families: null,
      output_bundle: [
        { outputKey: "trust_certificate", outputLabel: "Certificate of Trust" },
        { outputKey: "trust_rrr", outputLabel: "Trust Registration Amendment" },
        { outputKey: "poa_document_tm1", outputLabel: "Power of Attorney - Jorge Lopez" },
      ],
      intake_status: null,
      intake_schema_version: null,
      intake_last_saved_at: null,
      intake_submitted_at: null,
      created_at: "2026-04-22T09:00:00.000Z",
      updated_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([
      { id: "run-cert", output_key: "trust_certificate" },
      { id: "run-rrr", output_key: "trust_rrr" },
      { id: "run-poa-tm1", output_key: "poa_document_tm1" },
    ]);
    mocks.listDocumentVersionsMock.mockResolvedValue([
      {
        id: "ver-cert",
        document_id: "doc-1",
        version: 4,
        storage_path: "documents/doc-1/trust-certificate-finalized-v4.pdf",
        file_name: "trust-certificate-finalized-v4.pdf",
        mime_type: "application/pdf",
        size_bytes: 1234,
        is_final: false,
        generation_run_id: "run-cert",
        created_by: null,
        created_at: "2026-04-22T09:30:00.000Z",
      },
      {
        id: "ver-rrr",
        document_id: "doc-1",
        version: 5,
        storage_path: "documents/doc-1/trust-rrr-finalized-v5.pdf",
        file_name: "trust-rrr-finalized-v5.pdf",
        mime_type: "application/pdf",
        size_bytes: 2345,
        is_final: false,
        generation_run_id: "run-rrr",
        created_by: null,
        created_at: "2026-04-22T09:31:00.000Z",
      },
      {
        id: "ver-poa-tm1",
        document_id: "doc-1",
        version: 6,
        storage_path: "documents/doc-1/poa-trustmaker-1-finalized-v6.pdf",
        file_name: "poa-trustmaker-1-finalized-v6.pdf",
        mime_type: "application/pdf",
        size_bytes: 3456,
        is_final: false,
        generation_run_id: "run-poa-tm1",
        created_by: null,
        created_at: "2026-04-22T09:32:00.000Z",
      },
    ]);

    const context = await getNotaryRequestContext({
      requestId: "req-1",
      role: "notary",
      viewerUserId: "notary-db-1",
    });

    expect(context?.document.reviewDocuments.map((document) => document.label)).toEqual([
      "Certificate of Trust",
      "Trust Registration Amendment",
      "Power of Attorney - Jorge Lopez",
    ]);
  });

  it("gets notary request context when finalization history temporarily fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
    });
    mocks.listDocumentVersionsMock.mockResolvedValue([]);
    mocks.listFinalizationStatusHistoryMock.mockRejectedValue(new Error("TypeError: fetch failed"));

    try {
      const context = await getNotaryRequestContext({
        requestId: "req-1",
        role: "notary",
        viewerUserId: "notary-db-1",
      });

      expect(context?.request.id).toBe("req-1");
      expect(context?.finalization.history).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        "Notary workspace read model enrichment fallback used",
        expect.objectContaining({ operation: "finalization_status_history" }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("excludes selected-notary requests from the queue before assignment", async () => {
    mocks.listNotarizationRequestsMock.mockResolvedValue([
      {
        id: "req-1",
        document_id: "doc-1",
        workflow_id: "wf-1",
        assigned_notary_id: null,
        status: "pending",
        submitted_at: "2026-04-22T10:00:00.000Z",
        created_at: "2026-04-22T10:00:00.000Z",
      },
    ]);
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "member-db-1",
      idn: "IDN-1234567890",
      status: "pending_notary",
      document_type: "uploaded_document",
      jurisdiction: "US-CA",
      product_flow_mode: "notarize_document",
      selected_families: null,
      output_bundle: [],
      intake_status: null,
      intake_schema_version: null,
      intake_last_saved_at: null,
      intake_submitted_at: null,
      created_at: "2026-04-22T09:00:00.000Z",
      updated_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
      id: "wf-1",
      owner_user_id: "member-db-1",
      created_by_user_id: "member-db-1",
      primary_document_id: "doc-1",
      workflow_kind: "single_document",
      status: "submitted",
      selected_notary_user_id: "notary-db-1",
      assigned_notary_user_id: null,
      current_legacy_request_id: "req-1",
      submitted_at: "2026-04-22T10:00:00.000Z",
      last_code_generated_at: "2026-04-22T10:05:00.000Z",
      review_started_at: null,
      closed_at: null,
      context_json: {},
      metadata: {},
      created_at: "2026-04-22T10:00:00.000Z",
      updated_at: "2026-04-22T10:00:00.000Z",
    });

    const queue = await listNotaryQueue({
      role: "notary",
      viewerUserId: "notary-db-1",
      limit: 25,
      offset: 0,
    });

    expect(queue.counts.total).toBe(0);
    expect(queue.requests).toEqual([]);
  });

  it("excludes unsigned selected-notary requests from the notary queue", async () => {
    mocks.listNotarizationRequestsMock.mockResolvedValue([
      {
        id: "req-1",
        document_id: "doc-1",
        workflow_id: "wf-1",
        assigned_notary_id: null,
        status: "pending",
        submitted_at: "2026-04-22T10:00:00.000Z",
        created_at: "2026-04-22T10:00:00.000Z",
      },
    ]);
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "member-db-1",
      idn: "IDN-1234567890",
      status: "pending_signature",
      document_type: "uploaded_document",
      jurisdiction: "US-CA",
      product_flow_mode: "notarize_document",
      selected_families: null,
      output_bundle: [],
      intake_status: null,
      intake_schema_version: null,
      intake_last_saved_at: null,
      intake_submitted_at: null,
      created_at: "2026-04-22T09:00:00.000Z",
      updated_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
      id: "wf-1",
      owner_user_id: "member-db-1",
      created_by_user_id: "member-db-1",
      primary_document_id: "doc-1",
      workflow_kind: "single_document",
      status: "submitted",
      selected_notary_user_id: "notary-db-1",
      assigned_notary_user_id: null,
      current_legacy_request_id: "req-1",
      submitted_at: "2026-04-22T10:00:00.000Z",
      last_code_generated_at: "2026-04-22T10:05:00.000Z",
      review_started_at: null,
      closed_at: null,
      context_json: {},
      metadata: {},
      created_at: "2026-04-22T10:00:00.000Z",
      updated_at: "2026-04-22T10:00:00.000Z",
    });

    const queue = await listNotaryQueue({
      role: "notary",
      viewerUserId: "notary-db-1",
      limit: 25,
      offset: 0,
    });

    expect(queue.counts.total).toBe(0);
    expect(queue.requests).toEqual([]);
  });

  it("excludes assigned notary requests when the document is not ready for review", async () => {
    mocks.listNotarizationRequestsMock.mockResolvedValue([
      {
        id: "req-1",
        document_id: "doc-1",
        workflow_id: "wf-1",
        assigned_notary_id: "notary-db-1",
        status: "in_review",
        submitted_at: "2026-04-22T10:00:00.000Z",
        created_at: "2026-04-22T10:00:00.000Z",
      },
    ]);
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "member-db-1",
      idn: "IDN-1234567890",
      status: "pending_signature",
      document_type: "uploaded_document",
      jurisdiction: "US-CA",
      product_flow_mode: "notarize_document",
      selected_families: null,
      output_bundle: [],
      intake_status: null,
      intake_schema_version: null,
      intake_last_saved_at: null,
      intake_submitted_at: null,
      created_at: "2026-04-22T09:00:00.000Z",
      updated_at: "2026-04-22T10:00:00.000Z",
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
      last_code_generated_at: "2026-04-22T10:05:00.000Z",
      review_started_at: "2026-04-22T10:06:00.000Z",
      closed_at: null,
      context_json: {},
      metadata: {},
      created_at: "2026-04-22T10:00:00.000Z",
      updated_at: "2026-04-22T10:00:00.000Z",
    });

    const queue = await listNotaryQueue({
      role: "notary",
      viewerUserId: "notary-db-1",
      limit: 25,
      offset: 0,
    });

    expect(queue.counts.total).toBe(0);
    expect(queue.requests).toEqual([]);
  });

  it("denies selected notary context before assignment", async () => {
    mocks.getNotarizationRequestByIdMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      workflow_id: "wf-1",
      assigned_notary_id: null,
      status: "pending",
      submitted_at: "2026-04-22T10:00:00.000Z",
      created_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "member-db-1",
      idn: "IDN-1234567890",
      status: "pending_notary",
      document_type: "uploaded_document",
      jurisdiction: "US-CA",
      product_flow_mode: "notarize_document",
      selected_families: null,
      output_bundle: [],
      intake_status: null,
      intake_schema_version: null,
      intake_last_saved_at: null,
      intake_submitted_at: null,
      created_at: "2026-04-22T09:00:00.000Z",
      updated_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
      id: "wf-1",
      owner_user_id: "member-db-1",
      created_by_user_id: "member-db-1",
      primary_document_id: "doc-1",
      workflow_kind: "single_document",
      status: "submitted",
      selected_notary_user_id: "notary-db-1",
      assigned_notary_user_id: null,
      current_legacy_request_id: "req-1",
      submitted_at: "2026-04-22T10:00:00.000Z",
      last_code_generated_at: "2026-04-22T10:05:00.000Z",
      review_started_at: null,
      closed_at: null,
      context_json: {},
      metadata: {},
      created_at: "2026-04-22T10:00:00.000Z",
      updated_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.listDocumentVersionsMock.mockResolvedValue([]);

    const context = await getNotaryRequestContext({
      requestId: "req-1",
      role: "notary",
      viewerUserId: "notary-db-1",
    });

    expect(context).toBeNull();
  });

  it("denies context for unsigned selected-notary requests", async () => {
    mocks.getNotarizationRequestByIdMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      workflow_id: "wf-1",
      assigned_notary_id: null,
      status: "pending",
      submitted_at: "2026-04-22T10:00:00.000Z",
      created_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "member-db-1",
      idn: "IDN-1234567890",
      status: "draft",
      document_type: "uploaded_document",
      jurisdiction: "US-CA",
      product_flow_mode: "notarize_document",
      selected_families: null,
      output_bundle: [],
      intake_status: null,
      intake_schema_version: null,
      intake_last_saved_at: null,
      intake_submitted_at: null,
      created_at: "2026-04-22T09:00:00.000Z",
      updated_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
      id: "wf-1",
      owner_user_id: "member-db-1",
      created_by_user_id: "member-db-1",
      primary_document_id: "doc-1",
      workflow_kind: "single_document",
      status: "submitted",
      selected_notary_user_id: "notary-db-1",
      assigned_notary_user_id: null,
      current_legacy_request_id: "req-1",
      submitted_at: "2026-04-22T10:00:00.000Z",
      last_code_generated_at: "2026-04-22T10:05:00.000Z",
      review_started_at: null,
      closed_at: null,
      context_json: {},
      metadata: {},
      created_at: "2026-04-22T10:00:00.000Z",
      updated_at: "2026-04-22T10:00:00.000Z",
    });

    const context = await getNotaryRequestContext({
      requestId: "req-1",
      role: "notary",
      viewerUserId: "notary-db-1",
    });

    expect(context).toBeNull();
  });

  it("denies context for wrong notary when request is selected for another notary", async () => {
    mocks.getNotarizationRequestByIdMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      workflow_id: "wf-1",
      assigned_notary_id: null,
      status: "pending",
      submitted_at: "2026-04-22T10:00:00.000Z",
      created_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "member-db-1",
      idn: "IDN-1234567890",
      status: "pending_notary",
      document_type: "uploaded_document",
      jurisdiction: "US-CA",
      product_flow_mode: "notarize_document",
      selected_families: null,
      output_bundle: [],
      intake_status: null,
      intake_schema_version: null,
      intake_last_saved_at: null,
      intake_submitted_at: null,
      created_at: "2026-04-22T09:00:00.000Z",
      updated_at: "2026-04-22T10:00:00.000Z",
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
      id: "wf-1",
      owner_user_id: "member-db-1",
      created_by_user_id: "member-db-1",
      primary_document_id: "doc-1",
      workflow_kind: "single_document",
      status: "submitted",
      selected_notary_user_id: "notary-db-1",
      assigned_notary_user_id: null,
      current_legacy_request_id: "req-1",
      submitted_at: "2026-04-22T10:00:00.000Z",
      last_code_generated_at: "2026-04-22T10:05:00.000Z",
      review_started_at: null,
      closed_at: null,
      context_json: {},
      metadata: {},
      created_at: "2026-04-22T10:00:00.000Z",
      updated_at: "2026-04-22T10:00:00.000Z",
    });

    const context = await getNotaryRequestContext({
      requestId: "req-1",
      role: "notary",
      viewerUserId: "notary-db-2",
    });

    expect(context).toBeNull();
  });

  it("includes only signed and finalized PDF versions in notary review documents", async () => {
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
    });
    mocks.listDocumentVersionsMock.mockResolvedValue([
      {
        id: "ver-draft-1",
        document_id: "doc-1",
        version: 1,
        storage_path: "documents/doc-1-draft.pdf",
        file_name: "doc-1-draft.pdf",
        mime_type: "application/pdf",
        size_bytes: 1234,
        is_final: false,
        generation_run_id: "run-1",
        created_by: null,
        created_at: "2026-04-22T09:30:00.000Z",
      },
      {
        id: "ver-signed-1",
        document_id: "doc-1",
        version: 2,
        storage_path: "documents/doc-1-signed.pdf",
        file_name: "doc-1-signed.pdf",
        mime_type: "application/pdf",
        size_bytes: 1456,
        is_final: false,
        generation_run_id: "run-1",
        created_by: null,
        created_at: "2026-04-22T09:40:00.000Z",
      },
      {
        id: "ver-acknowledged-1",
        document_id: "doc-1",
        version: 3,
        storage_path: "documents/doc-1-signed-acknowledged-v3.pdf",
        file_name: "doc-1-signed-acknowledged-v3.pdf",
        mime_type: "application/pdf",
        size_bytes: 1678,
        is_final: false,
        generation_run_id: "run-1",
        created_by: null,
        created_at: "2026-04-22T09:50:00.000Z",
      },
      {
        id: "ver-finalized-1",
        document_id: "doc-1",
        version: 4,
        storage_path: "documents/doc-1-signed-acknowledged-v3-finalized-v4.pdf",
        file_name: "doc-1-signed-acknowledged-v3-finalized-v4.pdf",
        mime_type: "application/pdf",
        size_bytes: 1890,
        is_final: false,
        generation_run_id: "run-1",
        created_by: null,
        created_at: "2026-04-22T10:00:00.000Z",
      },
    ]);

    const context = await getNotaryRequestContext({
      requestId: "req-1",
      role: "notary",
      viewerUserId: "notary-db-1",
    });

    expect(context).not.toBeNull();
    expect(context?.document.versions).toHaveLength(4);
    expect(context?.document.reviewDocuments).toMatchObject([
      {
        id: "ver-finalized-1",
        versionId: "ver-finalized-1",
        fileName: "doc-1-signed-acknowledged-v3-finalized-v4.pdf",
        mimeType: "application/pdf",
        isFinal: false,
      },
    ]);
  });
});
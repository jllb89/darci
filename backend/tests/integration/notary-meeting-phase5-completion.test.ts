import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
  getUserIdentityContextByUserIdMock: vi.fn(),
  getNotarizationRequestByIdMock: vi.fn(),
  getDocumentByIdMock: vi.fn(),
  getIlluminotarizationWorkflowByIdMock: vi.fn(),
  getIlluminotarizationWorkflowByLegacyRequestIdMock: vi.fn(),
  getMeetingByRequestIdMock: vi.fn(),
  updateMeetingMock: vi.fn(),
  listMeetingParticipantsMock: vi.fn(),
  updateMeetingParticipantMock: vi.fn(),
  createMeetingCheckinMock: vi.fn(),
  createIdentityVerificationEventMock: vi.fn(),
  createProximityEvaluationMock: vi.fn(),
  createMeetingArtifactMock: vi.fn(),
  listMeetingArtifactsMock: vi.fn(),
  listIdentityVerificationEventsMock: vi.fn(),
  listMeetingGeolocationSamplesMock: vi.fn(),
  getGeolocationSampleByIdMock: vi.fn(),
  getMeetingCheckinByIdMock: vi.fn(),
  getIdentityVerificationEventByIdMock: vi.fn(),
  appendAcknowledgmentPageMock: vi.fn(),
  watermarkWithNoticeMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  broadcastRequestRealtimeInvalidationMock: vi.fn(),
  queueMeetingScheduledConfirmationNotificationMock: vi.fn(),
  getNotaryProfileByUserIdMock: vi.fn(),
}));

vi.mock("../../src/services/userRoleService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/userRoleService")>();
  return {
    ...actual,
    getUserIdentityContextBySupabaseId: mocks.getUserIdentityContextBySupabaseIdMock,
    getUserIdentityContextByUserId: mocks.getUserIdentityContextByUserIdMock,
  };
});

vi.mock("../../src/services/notaryProfileService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/notaryProfileService")>();
  return {
    ...actual,
    getNotaryProfileByUserId: mocks.getNotaryProfileByUserIdMock,
  };
});

vi.mock("../../src/services/documentService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/documentService")>();
  return {
    ...actual,
    getNotarizationRequestById: mocks.getNotarizationRequestByIdMock,
    getDocumentById: mocks.getDocumentByIdMock,
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
  };
});

vi.mock("../../src/services/meetingService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/meetingService")>();
  return {
    ...actual,
    getMeetingByRequestId: mocks.getMeetingByRequestIdMock,
    updateMeeting: mocks.updateMeetingMock,
    listMeetingParticipants: mocks.listMeetingParticipantsMock,
    updateMeetingParticipant: mocks.updateMeetingParticipantMock,
    createMeetingCheckin: mocks.createMeetingCheckinMock,
    createIdentityVerificationEvent: mocks.createIdentityVerificationEventMock,
    createProximityEvaluation: mocks.createProximityEvaluationMock,
    createMeetingArtifact: mocks.createMeetingArtifactMock,
    listMeetingArtifacts: mocks.listMeetingArtifactsMock,
    listIdentityVerificationEvents: mocks.listIdentityVerificationEventsMock,
    listMeetingGeolocationSamples: mocks.listMeetingGeolocationSamplesMock,
    getGeolocationSampleById: mocks.getGeolocationSampleByIdMock,
    getMeetingCheckinById: mocks.getMeetingCheckinByIdMock,
    getIdentityVerificationEventById: mocks.getIdentityVerificationEventByIdMock,
  };
});

vi.mock("../../src/services/documentFinalizationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/documentFinalizationService")>();
  return {
    ...actual,
    appendAcknowledgmentPage: mocks.appendAcknowledgmentPageMock,
    watermarkWithNotice: mocks.watermarkWithNoticeMock,
  };
});

vi.mock("../../src/services/auditService", () => ({
  recordAuditEvent: mocks.recordAuditEventMock,
}));

vi.mock("../../src/services/realtimeBroadcastService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/realtimeBroadcastService")>();
  return {
    ...actual,
    broadcastRequestRealtimeInvalidation: mocks.broadcastRequestRealtimeInvalidationMock,
  };
});

vi.mock("../../src/services/notificationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/notificationService")>();
  return {
    ...actual,
    queueMeetingScheduledConfirmationNotification:
      mocks.queueMeetingScheduledConfirmationNotificationMock,
  };
});

import { app } from "../../src/index";

type TokenPayload = {
  sub: string;
  app_metadata?: { role?: string };
};

const signToken = (payload: TokenPayload) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
};

const baseRequest = {
  id: "req-1",
  document_id: "doc-1",
  workflow_id: "workflow-1",
  assigned_notary_id: "notary-1",
  status: "in_review",
  submitted_at: "2026-04-20T10:00:00.000Z",
  created_at: "2026-04-20T10:00:00.000Z",
};

const baseDocument = {
  id: "doc-1",
  owner_id: "owner-1",
  idn: "IDN-900",
  status: "pending_notary",
  document_type: "generic",
  jurisdiction: "US-OH",
  product_flow_mode: "notarize_document",
  selected_families: [],
  output_bundle: [],
  intake_status: "submitted",
  intake_schema_version: null,
  intake_last_saved_at: null,
  intake_submitted_at: null,
  created_at: "2026-04-20T09:00:00.000Z",
  updated_at: "2026-04-20T09:00:00.000Z",
};

const baseWorkflow = {
  id: "workflow-1",
  owner_user_id: "owner-1",
  created_by_user_id: "owner-1",
  primary_document_id: "doc-1",
  workflow_kind: "single_document",
  status: "approved",
  selected_notary_user_id: null,
  assigned_notary_user_id: "notary-1",
  current_legacy_request_id: "req-1",
  submitted_at: "2026-04-20T10:00:00.000Z",
  last_code_generated_at: null,
  review_started_at: "2026-04-20T10:05:00.000Z",
  closed_at: null,
  context_json: {},
  metadata: {},
  created_at: "2026-04-20T10:00:00.000Z",
  updated_at: "2026-04-20T10:05:00.000Z",
};

const buildMeeting = (overrides: Record<string, unknown> = {}) => ({
  id: "meeting-1",
  request_id: "req-1",
  workflow_id: "workflow-1",
  scheduled_at: "2026-04-22T15:00:00.000Z",
  timezone: "America/New_York",
  location: "DARCi HQ",
  status: "scheduled",
  same_place_required: true,
  same_place_status: "pending",
  evidence_retention_until: null,
  metadata: {},
  created_at: "2026-04-20T11:00:00.000Z",
  updated_at: "2026-04-20T11:00:00.000Z",
  ...overrides,
});

const buildParticipants = (
  overrides: {
    member?: Record<string, unknown>;
    notary?: Record<string, unknown>;
  } = {},
) => {
  return [
    {
      id: "participant-member",
      meeting_id: "meeting-1",
      user_id: "owner-1",
      document_party_id: null,
      participant_role: "member",
      status: "expected",
      presence_required: true,
      participant_label: null,
      arrived_at: null,
      departed_at: null,
      metadata: {},
      created_at: "2026-04-20T11:00:00.000Z",
      updated_at: "2026-04-20T11:00:00.000Z",
      ...overrides.member,
    },
    {
      id: "participant-notary",
      meeting_id: "meeting-1",
      user_id: "notary-1",
      document_party_id: null,
      participant_role: "notary",
      status: "expected",
      presence_required: true,
      participant_label: null,
      arrived_at: null,
      departed_at: null,
      metadata: {},
      created_at: "2026-04-20T11:00:00.000Z",
      updated_at: "2026-04-20T11:00:00.000Z",
      ...overrides.notary,
    },
  ];
};

const buildFinalizationVersion = (overrides: Record<string, unknown> = {}) => ({
  id: "version-final-1",
  document_id: "doc-1",
  version: 3,
  storage_path: "documents/doc-1/final.pdf",
  file_name: "final.pdf",
  mime_type: "application/pdf",
  size_bytes: 4096,
  checksum_sha256: "hash-final",
  is_final: true,
  finalization_stage: "final_watermark",
  source_version_id: "version-ack-1",
  created_by_user_id: "notary-1",
  created_at: "2026-04-22T15:30:00.000Z",
  ...overrides,
});

const buildFinalizationExecution = (overrides: Record<string, unknown> = {}) => ({
  id: "execution-1",
  document_id: "doc-1",
  notarization_request_id: "req-1",
  execution_kind: "acknowledgment_append",
  status: "completed",
  source_document_version_id: "version-source-1",
  output_document_version_id: "version-ack-1",
  template_id: null,
  template_version: null,
  watermark_text: null,
  error_message: null,
  completed_at: "2026-04-22T15:30:00.000Z",
  metadata: {},
  created_at: "2026-04-22T15:30:00.000Z",
  updated_at: "2026-04-22T15:30:00.000Z",
  ...overrides,
});

const buildVerifiedIdentityEvent = () => ({
  id: "identity-1",
  meeting_id: "meeting-1",
  meeting_participant_id: "participant-member",
  verified_by_user_id: "notary-1",
  verification_method: "in_person_document",
  status: "verified",
  subject_name_snapshot: "Mina Member",
  document_type: "passport",
  document_last4: "1234",
  issuing_jurisdiction: "US",
  verified_at: "2026-04-22T15:05:00.000Z",
  notes: "Passport verified",
  metadata: {},
  created_at: "2026-04-22T15:05:00.000Z",
  updated_at: "2026-04-22T15:05:00.000Z",
});

const buildVenueCaptureArtifact = (overrides: Record<string, unknown> = {}) => ({
  id: "artifact-venue-1",
  meeting_id: "meeting-1",
  meeting_participant_id: "participant-notary",
  meeting_checkin_id: "checkin-identity-1",
  identity_verification_event_id: "identity-1",
  uploaded_by_user_id: "notary-1",
  artifact_kind: "venue_capture",
  status: "active",
  storage_bucket: null,
  storage_path: null,
  mime_type: null,
  size_bytes: null,
  captured_at: "2026-04-22T15:20:00.000Z",
  retention_until: null,
  redacted_at: null,
  metadata: {
    venue: {
      state: "OH",
      county: "Franklin",
      city: "Columbus",
      addressLine1: "123 Session Way",
      locationLabel: "DARCi HQ",
      completedAt: "2026-04-22T15:20:00.000Z",
    },
  },
  created_at: "2026-04-22T15:20:00.000Z",
  updated_at: "2026-04-22T15:20:00.000Z",
  ...overrides,
});

const buildSealPreviewArtifact = (overrides: Record<string, unknown> = {}) => ({
  id: "artifact-seal-1",
  meeting_id: "meeting-1",
  meeting_participant_id: "participant-notary",
  meeting_checkin_id: null,
  identity_verification_event_id: null,
  uploaded_by_user_id: "notary-1",
  artifact_kind: "seal_preview",
  status: "active",
  storage_bucket: null,
  storage_path: null,
  mime_type: null,
  size_bytes: null,
  captured_at: "2026-04-22T15:21:00.000Z",
  retention_until: null,
  redacted_at: null,
  metadata: {},
  created_at: "2026-04-22T15:21:00.000Z",
  updated_at: "2026-04-22T15:21:00.000Z",
  ...overrides,
});

const buildWatermarkResult = (overrides: Record<string, unknown> = {}) => ({
  document: { ...baseDocument, status: "completed" },
  request: { ...baseRequest, status: "completed" },
  execution: buildFinalizationExecution({
    id: "execution-watermark-1",
    execution_kind: "watermark_notice",
    output_document_version_id: "version-final-1",
    watermark_text: "DARCi verified",
  }),
  version: buildFinalizationVersion(),
  hashRecord: {
    id: "hash-1",
    document_id: "doc-1",
    document_version_id: "version-final-1",
    algorithm: "sha256",
    hash: "hash-final",
    status: "recorded",
    completed_at: "2026-04-22T15:35:00.000Z",
    metadata: {},
    created_at: "2026-04-22T15:35:00.000Z",
    updated_at: "2026-04-22T15:35:00.000Z",
  },
  ledgerEntry: {
    id: "ledger-1",
    document_id: "doc-1",
    document_version_id: "version-final-1",
    hash_record_id: "hash-1",
    ledger_tx_id: "tx-1",
    anchored_at: "2026-04-22T15:36:00.000Z",
    metadata: {},
    created_at: "2026-04-22T15:36:00.000Z",
    updated_at: "2026-04-22T15:36:00.000Z",
  },
  ledgerAnchorAttempt: {
    id: "anchor-attempt-1",
    ledger_entry_id: "ledger-1",
    status: "anchored",
    attempt_number: 1,
    requested_at: "2026-04-22T15:35:00.000Z",
    completed_at: "2026-04-22T15:36:00.000Z",
    failed_at: null,
    error_message: null,
    metadata: {},
    created_at: "2026-04-22T15:35:00.000Z",
    updated_at: "2026-04-22T15:36:00.000Z",
  },
  ...overrides,
});

const buildLedgerFailureWatermarkResult = () => buildWatermarkResult({
  document: { ...baseDocument, status: "pending_notary" },
  request: { ...baseRequest, status: "in_review" },
  ledgerEntry: {
    id: "ledger-1",
    document_id: "doc-1",
    document_version_id: "version-final-1",
    hash_record_id: "hash-1",
    ledger_tx_id: null,
    anchored_at: null,
    metadata: {},
    created_at: "2026-04-22T15:36:00.000Z",
    updated_at: "2026-04-22T15:36:00.000Z",
  },
  ledgerAnchorAttempt: {
    id: "anchor-attempt-1",
    ledger_entry_id: "ledger-1",
    status: "failed",
    attempt_number: 1,
    requested_at: "2026-04-22T15:35:00.000Z",
    completed_at: null,
    failed_at: "2026-04-22T15:36:00.000Z",
    error_message: "Ledger provider unavailable",
    metadata: {},
    created_at: "2026-04-22T15:35:00.000Z",
    updated_at: "2026-04-22T15:36:00.000Z",
  },
});

const seedMeetingContext = (input: {
  role?: "member" | "notary";
  actorUserId?: string;
  actorSupabaseId?: string;
  request?: Record<string, unknown>;
  document?: Record<string, unknown>;
  workflow?: Record<string, unknown>;
  meeting?: Record<string, unknown>;
  participants?: Array<Record<string, unknown>>;
}) => {
  const role = input.role ?? "notary";
  const actorUserId = input.actorUserId ?? (role === "member" ? "owner-1" : "notary-1");
  const actorSupabaseId = input.actorSupabaseId ?? (role === "member" ? "member-sub" : "notary-sub");

  mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
    id: actorUserId,
    supabaseUserId: actorSupabaseId,
    email: `${role}@example.com`,
    role,
    status: "active",
    firstName: role === "member" ? "Mina" : "Nora",
    lastName: role === "member" ? "Member" : "Tary",
    availableRoles: [role],
    roleAssignments: [],
  });
  mocks.getUserIdentityContextByUserIdMock.mockResolvedValue({
    id: "notary-1",
    supabaseUserId: "notary-sub",
    email: "notary@example.com",
    role: "notary",
    status: "active",
    firstName: "Nora",
    lastName: "Tary",
    availableRoles: ["notary"],
    roleAssignments: [],
  });
  mocks.getNotaryProfileByUserIdMock.mockResolvedValue({
    id: "profile-1",
    userId: "notary-1",
    jurisdiction: "US-OH",
    serviceAreaKind: "county",
    serviceAreaName: "Franklin County",
    commissionNumber: "OH-12345",
    commissionExpiresAt: "2028-04-22",
    sealStoragePath: null,
    signatureDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    sealDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z",
  });
  mocks.getNotarizationRequestByIdMock.mockResolvedValue({
    ...baseRequest,
    ...(input.request ?? {}),
  });
  mocks.getDocumentByIdMock.mockResolvedValue({
    ...baseDocument,
    ...(input.document ?? {}),
  });
  mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
    ...baseWorkflow,
    ...(input.workflow ?? {}),
  });
  mocks.getMeetingByRequestIdMock.mockResolvedValue({
    ...buildMeeting(),
    ...(input.meeting ?? {}),
  });
  mocks.listMeetingParticipantsMock.mockResolvedValue(
    input.participants ?? buildParticipants(),
  );
};

describe("Phase 5 meeting runtime completion", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.broadcastRequestRealtimeInvalidationMock.mockResolvedValue({
      status: "sent",
      channels: ["request:req-1", "notary-queue"],
    });
  });

  it("confirms a meeting and queues the meeting notification", async () => {
    seedMeetingContext({
      role: "notary",
      meeting: {
        status: "rescheduled",
        same_place_status: "not_started",
        metadata: {
          proposalState: "proposed",
          memberConfirmedAt: "2026-04-20T12:00:00.000Z",
        },
      },
    });
    mocks.updateMeetingMock.mockResolvedValue(
      buildMeeting({
        status: "scheduled",
        same_place_status: "not_started",
        scheduled_at: "2026-04-23T14:00:00.000Z",
        metadata: {
          proposalState: "confirmed",
          memberConfirmedAt: "2026-04-20T12:00:00.000Z",
          notaryConfirmedAt: "2026-04-20T12:10:00.000Z",
        },
      }),
    );
    mocks.updateMeetingParticipantMock.mockResolvedValue({
      ...buildParticipants()[1],
      status: "confirmed",
    });
    mocks.queueMeetingScheduledConfirmationNotificationMock.mockResolvedValue({
      jobId: "job-meeting-1",
      deliveryCount: 1,
      existing: false,
    });

    const response = await request(app)
      .post("/notary/requests/req-1/meeting/confirm")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({
        scheduledAt: "2026-04-23T14:00:00.000Z",
        timezone: "America/New_York",
        location: "DARCi HQ",
      });

    expect(response.status).toBe(200);
    expect(response.body.meeting.status).toBe("scheduled");
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "notary.meeting_time_confirmed" }),
    );
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "notary.meeting_scheduled" }),
    );
    expect(mocks.queueMeetingScheduledConfirmationNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        documentId: "doc-1",
        scheduledAt: "2026-04-23T14:00:00.000Z",
      }),
    );
  });

  it("reschedules a meeting and resets prior confirmations", async () => {
    seedMeetingContext({
      role: "notary",
      meeting: {
        metadata: {
          memberConfirmedAt: "2026-04-20T12:00:00.000Z",
          notaryConfirmedAt: "2026-04-20T12:05:00.000Z",
        },
      },
      participants: buildParticipants({
        member: { status: "confirmed" },
        notary: { status: "confirmed" },
      }),
    });
    mocks.updateMeetingMock.mockResolvedValue(
      buildMeeting({
        status: "rescheduled",
        scheduled_at: "2026-04-24T16:00:00.000Z",
        metadata: {
          proposalState: "rescheduled",
        },
      }),
    );
    mocks.updateMeetingParticipantMock
      .mockResolvedValueOnce({
        ...buildParticipants({ member: { status: "expected" } })[0],
        status: "expected",
      })
      .mockResolvedValueOnce({
        ...buildParticipants({ notary: { status: "expected" } })[1],
        status: "expected",
      });
    mocks.queueMeetingScheduledConfirmationNotificationMock.mockResolvedValue({
      jobId: "job-meeting-2",
      deliveryCount: 1,
      existing: false,
    });

    const response = await request(app)
      .post("/notary/requests/req-1/meeting/reschedule")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({
        scheduledAt: "2026-04-24T16:00:00.000Z",
        timezone: "America/New_York",
        location: "DARCi HQ",
        rescheduleReason: "Weather delay",
      });

    expect(response.status).toBe(200);
    expect(response.body.meeting.status).toBe("rescheduled");
    expect(mocks.updateMeetingParticipantMock).toHaveBeenCalledTimes(2);
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "notary.meeting_rescheduled" }),
    );
  });

  it("cancels a meeting and marks participants canceled", async () => {
    seedMeetingContext({
      role: "member",
      participants: buildParticipants({
        member: { status: "confirmed" },
        notary: { status: "confirmed" },
      }),
    });
    mocks.updateMeetingMock.mockResolvedValue(
      buildMeeting({
        status: "cancelled",
        metadata: {
          proposalState: "cancelled",
          cancelledBy: "member",
        },
      }),
    );
    mocks.updateMeetingParticipantMock
      .mockResolvedValueOnce({
        ...buildParticipants({ member: { status: "canceled" } })[0],
        status: "canceled",
      })
      .mockResolvedValueOnce({
        ...buildParticipants({ notary: { status: "canceled" } })[1],
        status: "canceled",
      });

    const response = await request(app)
      .post("/notary/requests/req-1/meeting/cancel")
      .set("Authorization", `Bearer ${signToken({ sub: "member-sub", app_metadata: { role: "member" } })}`)
      .send({
        cancelledBy: "member",
        cancellationReason: "Unable to attend",
      });

    expect(response.status).toBe(200);
    expect(response.body.meeting.status).toBe("cancelled");
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "notary.meeting_cancelled" }),
    );
  });

  it("records a member no-show against the meeting", async () => {
    seedMeetingContext({
      role: "notary",
      participants: buildParticipants({
        member: { status: "expected" },
        notary: { status: "confirmed" },
      }),
    });
    mocks.updateMeetingMock.mockResolvedValue(
      buildMeeting({
        status: "no_show",
        metadata: {
          noShowParty: "member",
        },
      }),
    );
    mocks.updateMeetingParticipantMock.mockResolvedValue({
      ...buildParticipants({ member: { status: "no_show" } })[0],
      status: "no_show",
    });

    const response = await request(app)
      .post("/notary/requests/req-1/meeting/no-show")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({
        noShowParty: "member",
        recordedAt: "2026-04-22T15:30:00.000Z",
      });

    expect(response.status).toBe(200);
    expect(response.body.meeting.status).toBe("no_show");
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "system.meeting_no_show_recorded" }),
    );
  });

  it("blocks in-person session start when the illuminotary signature or seal is missing", async () => {
    seedMeetingContext({ role: "notary" });
    mocks.getNotaryProfileByUserIdMock.mockResolvedValue({
      id: "profile-1",
      userId: "notary-1",
      jurisdiction: "US-OH",
      serviceAreaKind: "county",
      serviceAreaName: "Franklin County",
      commissionNumber: "OH-12345",
      commissionExpiresAt: "2028-04-22",
      sealStoragePath: null,
      signatureDataUrl: null,
      sealDataUrl: "",
      createdAt: "2026-04-20T10:00:00.000Z",
      updatedAt: "2026-04-20T10:00:00.000Z",
    });

    const response = await request(app)
      .post("/notary/requests/req-1/meeting/start")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({
        recordedAt: "2026-04-22T15:00:00.000Z",
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: "conflict",
      code: "notary_assets_required",
      message: "Your illuminotary signature and seal must be set before starting an in-person session.",
      details: {
        missingAssets: ["signature", "seal"],
      },
    });
    expect(mocks.updateMeetingParticipantMock).not.toHaveBeenCalled();
    expect(mocks.createMeetingCheckinMock).not.toHaveBeenCalled();
  });

  it("blocks meeting-start check-ins when the illuminotary seal is missing", async () => {
    seedMeetingContext({ role: "notary" });
    mocks.getNotaryProfileByUserIdMock.mockResolvedValue({
      id: "profile-1",
      userId: "notary-1",
      jurisdiction: "US-OH",
      serviceAreaKind: "county",
      serviceAreaName: "Franklin County",
      commissionNumber: "OH-12345",
      commissionExpiresAt: "2028-04-22",
      sealStoragePath: null,
      signatureDataUrl: "data:image/png;base64,iVBORw0KGgo=",
      sealDataUrl: null,
      createdAt: "2026-04-20T10:00:00.000Z",
      updatedAt: "2026-04-20T10:00:00.000Z",
    });

    const response = await request(app)
      .post("/notary/requests/req-1/meeting/check-in")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({
        participantRole: "notary",
        checkinKind: "meeting_start",
        recordedAt: "2026-04-22T15:00:00.000Z",
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: "conflict",
      code: "notary_assets_required",
      details: {
        missingAssets: ["seal"],
      },
    });
    expect(mocks.createMeetingCheckinMock).not.toHaveBeenCalled();
  });

  it("records identity verification through the dedicated Phase 5 endpoint", async () => {
    seedMeetingContext({
      role: "notary",
      participants: buildParticipants({
        member: { status: "checked_in", arrived_at: "2026-04-22T14:55:00.000Z" },
      }),
    });
    mocks.createMeetingCheckinMock.mockResolvedValue({
      id: "checkin-identity-1",
      meeting_id: "meeting-1",
      meeting_participant_id: "participant-member",
      recorded_by_user_id: "notary-1",
      checkin_kind: "identity",
      status: "recorded",
      recorded_at: "2026-04-22T15:05:00.000Z",
      notes: "Passport verified",
      metadata: {},
      created_at: "2026-04-22T15:05:00.000Z",
      updated_at: "2026-04-22T15:05:00.000Z",
    });
    mocks.createIdentityVerificationEventMock.mockResolvedValue({
      id: "identity-1",
      meeting_id: "meeting-1",
      meeting_participant_id: "participant-member",
      verified_by_user_id: "notary-1",
      verification_method: "in_person_document",
      status: "verified",
      subject_name_snapshot: "Mina Member",
      document_type: "passport",
      document_last4: "1234",
      issuing_jurisdiction: "US",
      verified_at: "2026-04-22T15:05:00.000Z",
      notes: "Passport verified",
      metadata: {},
      created_at: "2026-04-22T15:05:00.000Z",
      updated_at: "2026-04-22T15:05:00.000Z",
    });
    mocks.createMeetingArtifactMock.mockResolvedValue({
      id: "artifact-venue-1",
      meeting_id: "meeting-1",
      meeting_participant_id: "participant-notary",
      meeting_checkin_id: "checkin-identity-1",
      identity_verification_event_id: "identity-1",
      uploaded_by_user_id: "notary-1",
      artifact_kind: "venue_capture",
      status: "active",
      storage_bucket: null,
      storage_path: null,
      mime_type: null,
      size_bytes: null,
      captured_at: "2026-04-22T15:05:00.000Z",
      retention_until: null,
      redacted_at: null,
      metadata: {
        venue: {
          state: "OH",
          county: "Franklin",
          city: "Columbus",
          completedAt: "2026-04-22T15:05:00.000Z",
        },
      },
      created_at: "2026-04-22T15:05:00.000Z",
      updated_at: "2026-04-22T15:05:00.000Z",
    });

    const response = await request(app)
      .post("/notary/requests/req-1/meeting/identity-verification")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({
        verificationMethod: "in_person_document",
        participantRole: "member",
        subjectName: "Mina Member",
        documentType: "passport",
        documentNumberTail: "1234",
        issuingJurisdiction: "US",
        documentExpirationDate: "2031-04-22",
        venue: {
          state: "OH",
          county: "Franklin",
          city: "Columbus",
          completedAt: "2026-04-22T15:05:00.000Z",
        },
        verifiedAt: "2026-04-22T15:05:00.000Z",
        notes: "Passport verified",
      });

    expect(response.status).toBe(201);
    expect(response.body.identityVerification.status).toBe("verified");
    expect(response.body.venueCapture.artifactKind).toBe("venue_capture");
    expect(response.body.checkin.checkinKind).toBe("identity");
    expect(mocks.createMeetingArtifactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactKind: "venue_capture",
        meetingParticipantId: "participant-notary",
        meetingCheckinId: "checkin-identity-1",
        identityVerificationEventId: "identity-1",
        metadata: expect.objectContaining({
          venue: expect.objectContaining({ state: "OH", county: "Franklin" }),
        }),
      }),
    );
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "notary.identity_verified" }),
    );
  });

  it("records a passing same-place proximity evaluation from the latest samples", async () => {
    seedMeetingContext({
      role: "notary",
      meeting: {
        same_place_status: "pending",
      },
      participants: buildParticipants({
        member: { status: "checked_in" },
        notary: { status: "checked_in" },
      }),
    });
    mocks.listMeetingGeolocationSamplesMock
      .mockResolvedValueOnce([
        {
          id: "geo-member-1",
          meeting_id: "meeting-1",
          meeting_participant_id: "participant-member",
          meeting_checkin_id: "checkin-member-1",
          captured_by_user_id: "owner-1",
          sample_kind: "device_gps",
          capture_stage: "checkin",
          latitude: 41.4993,
          longitude: -81.6944,
          accuracy_meters: 8,
          altitude_meters: null,
          captured_at: "2026-04-22T15:00:00.000Z",
          expires_at: null,
          metadata: {},
          created_at: "2026-04-22T15:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "geo-notary-1",
          meeting_id: "meeting-1",
          meeting_participant_id: "participant-notary",
          meeting_checkin_id: "checkin-notary-1",
          captured_by_user_id: "notary-1",
          sample_kind: "device_gps",
          capture_stage: "checkin",
          latitude: 41.49935,
          longitude: -81.69435,
          accuracy_meters: 7,
          altitude_meters: null,
          captured_at: "2026-04-22T15:00:10.000Z",
          expires_at: null,
          metadata: {},
          created_at: "2026-04-22T15:00:10.000Z",
        },
      ]);
    mocks.createProximityEvaluationMock.mockResolvedValue({
      id: "prox-1",
      meeting_id: "meeting-1",
      evaluated_by_user_id: "notary-1",
      member_sample_id: "geo-member-1",
      notary_sample_id: "geo-notary-1",
      evaluation_kind: "same_place",
      status: "passed",
      threshold_meters: 100,
      observed_distance_meters: 6.9,
      evaluated_at: "2026-04-22T15:01:00.000Z",
      notes: "Within same-place threshold",
      metadata: {},
      created_at: "2026-04-22T15:01:00.000Z",
      updated_at: "2026-04-22T15:01:00.000Z",
    });
    mocks.updateMeetingMock.mockResolvedValue(
      buildMeeting({
        same_place_status: "passed",
        metadata: {
          lastProximityEvaluationStatus: "passed",
        },
      }),
    );

    const response = await request(app)
      .post("/notary/requests/req-1/meeting/proximity-evaluation")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({
        thresholdMeters: 100,
        evaluatedAt: "2026-04-22T15:01:00.000Z",
        notes: "Within same-place threshold",
      });

    expect(response.status).toBe(201);
    expect(response.body.evaluation.status).toBe("passed");
    expect(response.body.meeting.samePlaceStatus).toBe("passed");
  });

  it("advances a session by recording same-place proximity when fresh samples exist", async () => {
    seedMeetingContext({
      role: "notary",
      meeting: { same_place_status: "pending" },
      participants: buildParticipants({
        member: { status: "checked_in" },
        notary: { status: "checked_in" },
      }),
    });
    mocks.listMeetingGeolocationSamplesMock
      .mockResolvedValueOnce([
        {
          id: "geo-member-1",
          meeting_id: "meeting-1",
          meeting_participant_id: "participant-member",
          meeting_checkin_id: "checkin-member-1",
          captured_by_user_id: "owner-1",
          sample_kind: "device_gps",
          capture_stage: "checkin",
          latitude: 41.4993,
          longitude: -81.6944,
          accuracy_meters: 8,
          altitude_meters: null,
          captured_at: "2026-04-22T15:00:00.000Z",
          expires_at: null,
          metadata: {},
          created_at: "2026-04-22T15:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "geo-notary-1",
          meeting_id: "meeting-1",
          meeting_participant_id: "participant-notary",
          meeting_checkin_id: "checkin-notary-1",
          captured_by_user_id: "notary-1",
          sample_kind: "device_gps",
          capture_stage: "checkin",
          latitude: 41.49935,
          longitude: -81.69435,
          accuracy_meters: 7,
          altitude_meters: null,
          captured_at: "2026-04-22T15:00:10.000Z",
          expires_at: null,
          metadata: {},
          created_at: "2026-04-22T15:00:10.000Z",
        },
      ]);
    mocks.createProximityEvaluationMock.mockResolvedValue({
      id: "prox-advance-1",
      meeting_id: "meeting-1",
      evaluated_by_user_id: "notary-1",
      member_sample_id: "geo-member-1",
      notary_sample_id: "geo-notary-1",
      evaluation_kind: "same_place",
      status: "passed",
      threshold_meters: 100,
      observed_distance_meters: 6.9,
      evaluated_at: "2026-04-22T15:01:00.000Z",
      notes: "Session advancement evaluated same-place evidence.",
      metadata: {},
      created_at: "2026-04-22T15:01:00.000Z",
      updated_at: "2026-04-22T15:01:00.000Z",
    });
    mocks.updateMeetingMock.mockResolvedValue(
      buildMeeting({ same_place_status: "passed" }),
    );

    const response = await request(app)
      .post("/notary/requests/req-1/session/advance")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({
        thresholdMeters: 100,
        evaluatedAt: "2026-04-22T15:01:00.000Z",
      });

    expect(response.status).toBe(201);
    expect(response.body.advancedStep).toBe("same_place_evaluated");
    expect(response.body.nextAction).toBe("seal_acknowledgment");
    expect(response.body.evaluation.status).toBe("passed");
  });

  it("creates a meeting artifact linked to an identity verification event", async () => {
    seedMeetingContext({
      role: "notary",
      participants: buildParticipants({
        member: { status: "checked_in" },
      }),
    });
    mocks.getMeetingCheckinByIdMock.mockResolvedValue({
      id: "checkin-identity-1",
      meeting_id: "meeting-1",
      meeting_participant_id: "participant-member",
      recorded_by_user_id: "notary-1",
      checkin_kind: "identity",
      status: "recorded",
      recorded_at: "2026-04-22T15:05:00.000Z",
      notes: "Passport verified",
      metadata: {},
      created_at: "2026-04-22T15:05:00.000Z",
      updated_at: "2026-04-22T15:05:00.000Z",
    });
    mocks.getIdentityVerificationEventByIdMock.mockResolvedValue({
      id: "identity-1",
      meeting_id: "meeting-1",
      meeting_participant_id: "participant-member",
      verified_by_user_id: "notary-1",
      verification_method: "in_person_document",
      status: "verified",
      subject_name_snapshot: "Mina Member",
      document_type: "passport",
      document_last4: "1234",
      issuing_jurisdiction: "US",
      verified_at: "2026-04-22T15:05:00.000Z",
      notes: "Passport verified",
      metadata: {},
      created_at: "2026-04-22T15:05:00.000Z",
      updated_at: "2026-04-22T15:05:00.000Z",
    });
    mocks.createMeetingArtifactMock.mockResolvedValue({
      id: "artifact-1",
      meeting_id: "meeting-1",
      meeting_participant_id: "participant-member",
      meeting_checkin_id: "checkin-identity-1",
      identity_verification_event_id: "identity-1",
      uploaded_by_user_id: "notary-1",
      artifact_kind: "identity_document",
      status: "active",
      storage_bucket: "documents",
      storage_path: "meeting-evidence/identity-doc.pdf",
      mime_type: "application/pdf",
      size_bytes: 2048,
      captured_at: "2026-04-22T15:05:30.000Z",
      retention_until: "2026-07-21T15:05:30.000Z",
      redacted_at: null,
      metadata: {},
      created_at: "2026-04-22T15:05:30.000Z",
      updated_at: "2026-04-22T15:05:30.000Z",
    });

    const response = await request(app)
      .post("/notary/requests/req-1/meeting/artifacts")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({
        participantRole: "member",
        meetingCheckinId: "checkin-identity-1",
        identityVerificationEventId: "identity-1",
        artifactKind: "identity_document",
        storageBucket: "documents",
        storagePath: "meeting-evidence/identity-doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        capturedAt: "2026-04-22T15:05:30.000Z",
        retentionUntil: "2026-07-21T15:05:30.000Z",
      });

    expect(response.status).toBe(201);
    expect(response.body.artifact.artifactKind).toBe("identity_document");
    expect(mocks.createMeetingArtifactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: "meeting-1",
        meetingParticipantId: "participant-member",
        meetingCheckinId: "checkin-identity-1",
        identityVerificationEventId: "identity-1",
      }),
    );
  });

  it("appends a notarial acknowledgment and stores the seal artifact", async () => {
    seedMeetingContext({
      role: "notary",
      meeting: {
        status: "in_progress",
        same_place_status: "passed",
      },
      participants: buildParticipants({
        member: { status: "checked_in" },
        notary: { status: "checked_in" },
      }),
    });
    mocks.listIdentityVerificationEventsMock.mockResolvedValue([buildVerifiedIdentityEvent()]);
    mocks.listMeetingArtifactsMock.mockResolvedValue([
      {
        id: "artifact-venue-1",
        meeting_id: "meeting-1",
        meeting_participant_id: "participant-notary",
        meeting_checkin_id: "checkin-identity-1",
        identity_verification_event_id: "identity-1",
        uploaded_by_user_id: "notary-1",
        artifact_kind: "venue_capture",
        status: "active",
        storage_bucket: null,
        storage_path: null,
        mime_type: null,
        size_bytes: null,
        captured_at: "2026-04-22T15:20:00.000Z",
        retention_until: null,
        redacted_at: null,
        metadata: {
          venue: {
            state: "OH",
            county: "Franklin",
            city: "Columbus",
            addressLine1: "123 Session Way",
            locationLabel: "DARCi HQ",
            completedAt: "2026-04-22T15:20:00.000Z",
          },
        },
        created_at: "2026-04-22T15:20:00.000Z",
        updated_at: "2026-04-22T15:20:00.000Z",
      },
    ]);
    mocks.appendAcknowledgmentPageMock.mockResolvedValue({
      document: baseDocument,
      request: baseRequest,
      acknowledgmentPage: {
        id: "ack-page-1",
        document_id: "doc-1",
        jurisdiction: "US-OH",
        content: "Acknowledgment content",
        metadata: {},
        created_at: "2026-04-22T15:20:00.000Z",
      },
      execution: buildFinalizationExecution(),
      version: buildFinalizationVersion({
        id: "version-ack-1",
        version: 2,
        is_final: false,
        finalization_stage: "acknowledgment_appended",
      }),
    });
    mocks.createMeetingArtifactMock.mockResolvedValue({
      id: "artifact-seal-1",
      meeting_id: "meeting-1",
      meeting_participant_id: "participant-notary",
      meeting_checkin_id: null,
      identity_verification_event_id: null,
      uploaded_by_user_id: "notary-1",
      artifact_kind: "seal_preview",
      status: "active",
      storage_bucket: null,
      storage_path: null,
      mime_type: null,
      size_bytes: null,
      captured_at: "2026-04-22T15:21:00.000Z",
      retention_until: null,
      redacted_at: null,
      metadata: {},
      created_at: "2026-04-22T15:21:00.000Z",
      updated_at: "2026-04-22T15:21:00.000Z",
    });

    const response = await request(app)
      .post("/notary/requests/req-1/sign")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({
        acknowledgment: {
          signerAppeared: true,
          signerAcknowledged: true,
        },
        sealLabel: "DARCi illuminotary seal",
        signatureLabel: "Nora Tary",
        notes: "Verified in person",
      });

    expect(response.status).toBe(200);
    expect(response.body.acknowledgmentPage.id).toBe("ack-page-1");
    expect(response.body.venueCapture.artifactKind).toBe("venue_capture");
    expect(response.body.sealArtifact.artifactKind).toBe("seal_preview");
    expect(mocks.appendAcknowledgmentPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        actorSupabaseId: "notary-sub",
        meetingId: "meeting-1",
        venue: expect.objectContaining({ county: "Franklin", state: "OH" }),
        notaryProfile: expect.objectContaining({
          notaryName: "Nora Tary",
          jurisdiction: "US-OH",
          commissionNumber: "OH-12345",
          commissionExpiresAt: "2028-04-22",
        }),
      }),
    );
    expect(mocks.createMeetingArtifactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: "meeting-1",
        meetingParticipantId: "participant-notary",
        artifactKind: "seal_preview",
        metadata: expect.objectContaining({ venueCaptureArtifactId: "artifact-venue-1" }),
      }),
    );
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "notary.notarial_acknowledgment_signed" }),
    );
  });

  it("advances a ready session by sealing the acknowledgment", async () => {
    seedMeetingContext({
      role: "notary",
      meeting: {
        status: "in_progress",
        same_place_status: "passed",
      },
      participants: buildParticipants({
        member: { status: "checked_in" },
        notary: { status: "checked_in" },
      }),
    });
    mocks.listIdentityVerificationEventsMock.mockResolvedValue([buildVerifiedIdentityEvent()]);
    mocks.listMeetingArtifactsMock.mockResolvedValue([buildVenueCaptureArtifact()]);
    mocks.appendAcknowledgmentPageMock.mockResolvedValue({
      document: baseDocument,
      request: baseRequest,
      acknowledgmentPage: {
        id: "ack-page-1",
        document_id: "doc-1",
        jurisdiction: "US-OH",
        content: "Acknowledgment content",
        metadata: {},
        created_at: "2026-04-22T15:20:00.000Z",
      },
      execution: buildFinalizationExecution(),
      version: buildFinalizationVersion({
        id: "version-ack-1",
        version: 2,
        is_final: false,
        finalization_stage: "acknowledgment_appended",
      }),
    });
    mocks.createMeetingArtifactMock.mockResolvedValue(buildSealPreviewArtifact());

    const response = await request(app)
      .post("/notary/requests/req-1/session/advance")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({
        acknowledgment: {
          signerAppeared: true,
          signerAcknowledged: true,
        },
        sealLabel: "DARCi illuminotary seal",
        signatureLabel: "Nora Tary",
      });

    expect(response.status).toBe(200);
    expect(response.body.advancedStep).toBe("acknowledgment_sealed");
    expect(response.body.nextAction).toBe("complete_meeting");
    expect(response.body.sealArtifact.artifactKind).toBe("seal_preview");
    expect(mocks.appendAcknowledgmentPageMock).toHaveBeenCalledWith(
      expect.objectContaining({ meetingId: "meeting-1" }),
    );
  });

  it("advances a sealed in-progress session by completing the meeting", async () => {
    seedMeetingContext({
      role: "notary",
      meeting: {
        status: "in_progress",
        same_place_status: "passed",
      },
      participants: buildParticipants({
        member: { status: "checked_in" },
        notary: { status: "checked_in" },
      }),
    });
    mocks.listMeetingArtifactsMock.mockResolvedValue([buildSealPreviewArtifact()]);
    mocks.listIdentityVerificationEventsMock.mockResolvedValue([]);
    mocks.updateMeetingParticipantMock.mockResolvedValue({
      ...buildParticipants({ notary: { status: "completed" } })[1],
      status: "completed",
      arrived_at: "2026-04-22T15:00:00.000Z",
      departed_at: "2026-04-22T15:25:00.000Z",
    });
    mocks.createMeetingCheckinMock.mockResolvedValue({
      id: "checkin-meeting-end-1",
      meeting_id: "meeting-1",
      meeting_participant_id: "participant-notary",
      recorded_by_user_id: "notary-1",
      checkin_kind: "meeting_end",
      status: "recorded",
      recorded_at: "2026-04-22T15:25:00.000Z",
      notes: "In-person session completed by session advancement.",
      metadata: {},
      created_at: "2026-04-22T15:25:00.000Z",
      updated_at: "2026-04-22T15:25:00.000Z",
    });
    mocks.updateMeetingMock.mockResolvedValue(
      buildMeeting({ status: "completed", same_place_status: "passed" }),
    );

    const response = await request(app)
      .post("/notary/requests/req-1/session/advance")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({ advancedAt: "2026-04-22T15:25:00.000Z" });

    expect(response.status).toBe(201);
    expect(response.body.advancedStep).toBe("meeting_completed");
    expect(response.body.nextAction).toBe("submit_final_package");
    expect(response.body.meeting.status).toBe("completed");
    expect(mocks.createMeetingCheckinMock).toHaveBeenCalledWith(
      expect.objectContaining({ checkinKind: "meeting_end" }),
    );
    expect(mocks.watermarkWithNoticeMock).not.toHaveBeenCalled();
  });

  it("auto-submits the final package after completing a sealed ready session", async () => {
    seedMeetingContext({
      role: "notary",
      meeting: {
        status: "in_progress",
        same_place_status: "passed",
      },
      participants: buildParticipants({
        member: { status: "checked_in" },
        notary: { status: "checked_in" },
      }),
    });
    mocks.listMeetingArtifactsMock.mockResolvedValue([buildSealPreviewArtifact()]);
    mocks.listIdentityVerificationEventsMock.mockResolvedValue([buildVerifiedIdentityEvent()]);
    mocks.updateMeetingParticipantMock.mockResolvedValue({
      ...buildParticipants({ notary: { status: "completed" } })[1],
      status: "completed",
      arrived_at: "2026-04-22T15:00:00.000Z",
      departed_at: "2026-04-22T15:25:00.000Z",
    });
    mocks.createMeetingCheckinMock.mockResolvedValue({
      id: "checkin-meeting-end-1",
      meeting_id: "meeting-1",
      meeting_participant_id: "participant-notary",
      recorded_by_user_id: "notary-1",
      checkin_kind: "meeting_end",
      status: "recorded",
      recorded_at: "2026-04-22T15:25:00.000Z",
      notes: "In-person session completed by session advancement.",
      metadata: {},
      created_at: "2026-04-22T15:25:00.000Z",
      updated_at: "2026-04-22T15:25:00.000Z",
    });
    mocks.updateMeetingMock.mockResolvedValue(
      buildMeeting({ status: "completed", same_place_status: "passed" }),
    );
    mocks.watermarkWithNoticeMock.mockResolvedValue(buildWatermarkResult());

    const response = await request(app)
      .post("/notary/requests/req-1/session/advance")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({ advancedAt: "2026-04-22T15:25:00.000Z" });

    expect(response.status).toBe(200);
    expect(response.body.advancedStep).toBe("final_package_submitted");
    expect(response.body.advancedSteps).toEqual(["meeting_completed", "final_package_submitted"]);
    expect(response.body.nextAction).toBeNull();
    expect(response.body.meeting.status).toBe("completed");
    expect(response.body.finalizationStatus.verificationReady).toBe(true);
    expect(mocks.watermarkWithNoticeMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1", actorSupabaseId: "notary-sub" }),
    );
    expect(mocks.broadcastRequestRealtimeInvalidationMock).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-1", reason: "meeting_completed" }),
    );
    expect(mocks.broadcastRequestRealtimeInvalidationMock).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-1", reason: "final_package_submitted" }),
    );
  });

  it("keeps the completed meeting and returns retry when chained final package anchoring fails", async () => {
    seedMeetingContext({
      role: "notary",
      meeting: {
        status: "in_progress",
        same_place_status: "passed",
      },
      participants: buildParticipants({
        member: { status: "checked_in" },
        notary: { status: "checked_in" },
      }),
    });
    mocks.listMeetingArtifactsMock.mockResolvedValue([buildSealPreviewArtifact()]);
    mocks.listIdentityVerificationEventsMock.mockResolvedValue([buildVerifiedIdentityEvent()]);
    mocks.updateMeetingParticipantMock.mockResolvedValue({
      ...buildParticipants({ notary: { status: "completed" } })[1],
      status: "completed",
      arrived_at: "2026-04-22T15:00:00.000Z",
      departed_at: "2026-04-22T15:25:00.000Z",
    });
    mocks.createMeetingCheckinMock.mockResolvedValue({
      id: "checkin-meeting-end-1",
      meeting_id: "meeting-1",
      meeting_participant_id: "participant-notary",
      recorded_by_user_id: "notary-1",
      checkin_kind: "meeting_end",
      status: "recorded",
      recorded_at: "2026-04-22T15:25:00.000Z",
      notes: "In-person session completed by session advancement.",
      metadata: {},
      created_at: "2026-04-22T15:25:00.000Z",
      updated_at: "2026-04-22T15:25:00.000Z",
    });
    mocks.updateMeetingMock.mockResolvedValue(
      buildMeeting({ status: "completed", same_place_status: "passed" }),
    );
    mocks.watermarkWithNoticeMock.mockResolvedValue(buildLedgerFailureWatermarkResult());

    const response = await request(app)
      .post("/notary/requests/req-1/session/advance")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({ advancedAt: "2026-04-22T15:25:00.000Z" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("ledger_anchor_failed");
    expect(response.body.advancedStep).toBe("final_package_submitted");
    expect(response.body.advancedSteps).toEqual(["meeting_completed", "final_package_submitted"]);
    expect(response.body.nextAction).toBe("retry_final_package_submission");
    expect(response.body.meeting.status).toBe("completed");
    expect(response.body.finalizationStatus.recoveryAction).toBe("retry_final_package_submission");
    expect(mocks.broadcastRequestRealtimeInvalidationMock).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-1", reason: "meeting_completed" }),
    );
    expect(mocks.broadcastRequestRealtimeInvalidationMock).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-1", reason: "final_package_submitted" }),
    );
  });

  it("submits the final package through watermark, hash, and ledger closeout", async () => {
    seedMeetingContext({
      role: "notary",
      meeting: {
        status: "completed",
        same_place_status: "passed",
      },
      participants: buildParticipants({
        member: { status: "completed" },
        notary: { status: "completed" },
      }),
    });
    mocks.listIdentityVerificationEventsMock.mockResolvedValue([buildVerifiedIdentityEvent()]);
    mocks.watermarkWithNoticeMock.mockResolvedValue({
      document: { ...baseDocument, status: "completed" },
      request: { ...baseRequest, status: "completed" },
      execution: buildFinalizationExecution({
        id: "execution-watermark-1",
        execution_kind: "watermark_notice",
        output_document_version_id: "version-final-1",
        watermark_text: "DARCi verified",
      }),
      version: buildFinalizationVersion(),
      hashRecord: {
        id: "hash-1",
        document_id: "doc-1",
        document_version_id: "version-final-1",
        algorithm: "sha256",
        hash: "hash-final",
        status: "recorded",
        completed_at: "2026-04-22T15:35:00.000Z",
        metadata: {},
        created_at: "2026-04-22T15:35:00.000Z",
        updated_at: "2026-04-22T15:35:00.000Z",
      },
      ledgerEntry: {
        id: "ledger-1",
        document_id: "doc-1",
        document_version_id: "version-final-1",
        hash_record_id: "hash-1",
        ledger_tx_id: "tx-1",
        anchored_at: "2026-04-22T15:36:00.000Z",
        metadata: {},
        created_at: "2026-04-22T15:36:00.000Z",
        updated_at: "2026-04-22T15:36:00.000Z",
      },
      ledgerAnchorAttempt: {
        id: "anchor-attempt-1",
        ledger_entry_id: "ledger-1",
        status: "anchored",
        attempt_number: 1,
        requested_at: "2026-04-22T15:35:00.000Z",
        completed_at: "2026-04-22T15:36:00.000Z",
        failed_at: null,
        error_message: null,
        metadata: {},
        created_at: "2026-04-22T15:35:00.000Z",
        updated_at: "2026-04-22T15:36:00.000Z",
      },
    });

    const response = await request(app)
      .post("/notary/requests/req-1/submit")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({ notes: "Final package ready" });

    expect(response.status).toBe(200);
    expect(response.body.documentStatus).toBe("completed");
    expect(response.body.requestStatus).toBe("completed");
    expect(response.body.version.isFinal).toBe(true);
    expect(response.body.hashRecord.hash).toBe("hash-final");
    expect(response.body.ledger.status).toBe("anchored");
    expect(response.body.finalizationStatus).toEqual({
      watermarked: true,
      hashRecorded: true,
      ledgerAnchored: true,
      verificationReady: true,
      recoveryAction: null,
    });
    expect(mocks.watermarkWithNoticeMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1", actorSupabaseId: "notary-sub" }),
    );
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "notary.final_package_submitted" }),
    );
  });

  it("advances a completed sealed session by submitting the final package", async () => {
    seedMeetingContext({
      role: "notary",
      meeting: {
        status: "completed",
        same_place_status: "passed",
      },
      participants: buildParticipants({
        member: { status: "completed" },
        notary: { status: "completed" },
      }),
    });
    mocks.listMeetingArtifactsMock.mockResolvedValue([buildSealPreviewArtifact()]);
    mocks.listIdentityVerificationEventsMock.mockResolvedValue([buildVerifiedIdentityEvent()]);
    mocks.watermarkWithNoticeMock.mockResolvedValue({
      document: { ...baseDocument, status: "completed" },
      request: { ...baseRequest, status: "completed" },
      execution: buildFinalizationExecution({
        id: "execution-watermark-1",
        execution_kind: "watermark_notice",
        output_document_version_id: "version-final-1",
        watermark_text: "DARCi verified",
      }),
      version: buildFinalizationVersion(),
      hashRecord: {
        id: "hash-1",
        document_id: "doc-1",
        document_version_id: "version-final-1",
        algorithm: "sha256",
        hash: "hash-final",
        status: "recorded",
        completed_at: "2026-04-22T15:35:00.000Z",
        metadata: {},
        created_at: "2026-04-22T15:35:00.000Z",
        updated_at: "2026-04-22T15:35:00.000Z",
      },
      ledgerEntry: {
        id: "ledger-1",
        document_id: "doc-1",
        document_version_id: "version-final-1",
        hash_record_id: "hash-1",
        ledger_tx_id: "tx-1",
        anchored_at: "2026-04-22T15:36:00.000Z",
        metadata: {},
        created_at: "2026-04-22T15:36:00.000Z",
        updated_at: "2026-04-22T15:36:00.000Z",
      },
      ledgerAnchorAttempt: {
        id: "anchor-attempt-1",
        ledger_entry_id: "ledger-1",
        status: "anchored",
        attempt_number: 1,
        requested_at: "2026-04-22T15:35:00.000Z",
        completed_at: "2026-04-22T15:36:00.000Z",
        failed_at: null,
        error_message: null,
        metadata: {},
        created_at: "2026-04-22T15:35:00.000Z",
        updated_at: "2026-04-22T15:36:00.000Z",
      },
    });

    const response = await request(app)
      .post("/notary/requests/req-1/session/advance")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({ notes: "Final package ready" });

    expect(response.status).toBe(200);
    expect(response.body.advancedStep).toBe("final_package_submitted");
    expect(response.body.nextAction).toBeNull();
    expect(response.body.finalizationStatus.verificationReady).toBe(true);
    expect(mocks.watermarkWithNoticeMock).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1", actorSupabaseId: "notary-sub" }),
    );
  });

  it("returns a recoverable failure when ledger anchoring fails", async () => {
    seedMeetingContext({
      role: "notary",
      meeting: {
        status: "completed",
        same_place_status: "passed",
      },
      participants: buildParticipants({
        member: { status: "completed" },
        notary: { status: "completed" },
      }),
    });
    mocks.listIdentityVerificationEventsMock.mockResolvedValue([buildVerifiedIdentityEvent()]);
    mocks.watermarkWithNoticeMock.mockResolvedValue({
      document: { ...baseDocument, status: "pending_notary" },
      request: { ...baseRequest, status: "in_review" },
      execution: buildFinalizationExecution({
        id: "execution-watermark-1",
        execution_kind: "watermark_notice",
        output_document_version_id: "version-final-1",
        watermark_text: "DARCi verified",
      }),
      version: buildFinalizationVersion(),
      hashRecord: {
        id: "hash-1",
        document_id: "doc-1",
        document_version_id: "version-final-1",
        algorithm: "sha256",
        hash: "hash-final",
        status: "recorded",
        completed_at: "2026-04-22T15:35:00.000Z",
        metadata: {},
        created_at: "2026-04-22T15:35:00.000Z",
        updated_at: "2026-04-22T15:35:00.000Z",
      },
      ledgerEntry: {
        id: "ledger-1",
        document_id: "doc-1",
        document_version_id: "version-final-1",
        hash_record_id: "hash-1",
        ledger_tx_id: null,
        anchored_at: null,
        metadata: {},
        created_at: "2026-04-22T15:36:00.000Z",
        updated_at: "2026-04-22T15:36:00.000Z",
      },
      ledgerAnchorAttempt: {
        id: "anchor-attempt-1",
        ledger_entry_id: "ledger-1",
        status: "failed",
        attempt_number: 1,
        requested_at: "2026-04-22T15:35:00.000Z",
        completed_at: null,
        failed_at: "2026-04-22T15:36:00.000Z",
        error_message: "Ledger provider unavailable",
        metadata: {},
        created_at: "2026-04-22T15:35:00.000Z",
        updated_at: "2026-04-22T15:36:00.000Z",
      },
    });

    const response = await request(app)
      .post("/notary/requests/req-1/submit")
      .set("Authorization", `Bearer ${signToken({ sub: "notary-sub", app_metadata: { role: "notary" } })}`)
      .send({ notes: "Final package ready" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("ledger_anchor_failed");
    expect(response.body.documentStatus).toBe("pending_notary");
    expect(response.body.requestStatus).toBe("in_review");
    expect(response.body.hashRecord.hash).toBe("hash-final");
    expect(response.body.ledger).toEqual(
      expect.objectContaining({
        status: "failed",
        ledgerTxId: null,
        anchoredAt: null,
        errorMessage: "Ledger provider unavailable",
      }),
    );
    expect(response.body.finalizationStatus).toEqual({
      watermarked: true,
      hashRecorded: true,
      ledgerAnchored: false,
      verificationReady: false,
      recoveryAction: "retry_final_package_submission",
    });
  });
});
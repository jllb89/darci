import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
  getNotarizationRequestByIdMock: vi.fn(),
  getDocumentByIdMock: vi.fn(),
  getIlluminotarizationWorkflowByIdMock: vi.fn(),
  getIlluminotarizationWorkflowByLegacyRequestIdMock: vi.fn(),
  getMeetingByRequestIdMock: vi.fn(),
  createMeetingMock: vi.fn(),
  updateMeetingMock: vi.fn(),
  listMeetingParticipantsMock: vi.fn(),
  createMeetingParticipantMock: vi.fn(),
  updateMeetingParticipantMock: vi.fn(),
  createMeetingCheckinMock: vi.fn(),
  createGeolocationSampleMock: vi.fn(),
  createIdentityVerificationEventMock: vi.fn(),
  getGeolocationSampleByIdMock: vi.fn(),
  listMeetingGeolocationSamplesMock: vi.fn(),
  createProximityEvaluationMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  queueInPersonSessionStartedNotificationMock: vi.fn(),
  runDueNotificationJobsMock: vi.fn(),
  getNotaryProfileByUserIdMock: vi.fn(),
  broadcastRequestRealtimeInvalidationMock: vi.fn(),
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
    createMeeting: mocks.createMeetingMock,
    updateMeeting: mocks.updateMeetingMock,
    listMeetingParticipants: mocks.listMeetingParticipantsMock,
    createMeetingParticipant: mocks.createMeetingParticipantMock,
    updateMeetingParticipant: mocks.updateMeetingParticipantMock,
    createMeetingCheckin: mocks.createMeetingCheckinMock,
    createGeolocationSample: mocks.createGeolocationSampleMock,
    createIdentityVerificationEvent: mocks.createIdentityVerificationEventMock,
    getGeolocationSampleById: mocks.getGeolocationSampleByIdMock,
    listMeetingGeolocationSamples: mocks.listMeetingGeolocationSamplesMock,
    createProximityEvaluation: mocks.createProximityEvaluationMock,
  };
});

vi.mock("../../src/services/auditService", () => ({
  recordAuditEvent: mocks.recordAuditEventMock,
}));

vi.mock("../../src/services/notificationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/notificationService")>();
  return {
    ...actual,
    queueInPersonSessionStartedNotification: mocks.queueInPersonSessionStartedNotificationMock,
  };
});

vi.mock("../../src/services/notificationOutboxService", () => ({
  runDueNotificationJobs: mocks.runDueNotificationJobsMock,
}));

vi.mock("../../src/services/notaryProfileService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/notaryProfileService")>();
  return {
    ...actual,
    getNotaryProfileByUserId: mocks.getNotaryProfileByUserIdMock,
  };
});

vi.mock("../../src/services/realtimeBroadcastService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/realtimeBroadcastService")>();
  return {
    ...actual,
    broadcastRequestRealtimeInvalidation: mocks.broadcastRequestRealtimeInvalidationMock,
  };
});

import { app } from "../../src/index";
import { resolveMissingNotarySessionProfileFields } from "../../src/controllers/notaryController";

type TokenPayload = {
  sub: string;
  app_metadata?: { role?: string };
};

const signToken = (payload: TokenPayload) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
};

const proximityParticipants = [
  {
    id: "participant-member-4",
    meeting_id: "meeting-4",
    user_id: "owner-4",
    document_party_id: null,
    participant_role: "member",
    status: "checked_in",
    presence_required: true,
    participant_label: null,
    arrived_at: "2026-05-27T15:00:00.000Z",
    departed_at: null,
    metadata: {},
    created_at: "2026-05-27T15:00:00.000Z",
    updated_at: "2026-05-27T15:00:00.000Z",
  },
  {
    id: "participant-notary-4",
    meeting_id: "meeting-4",
    user_id: "notary-4",
    document_party_id: null,
    participant_role: "notary",
    status: "checked_in",
    presence_required: true,
    participant_label: null,
    arrived_at: "2026-05-27T15:00:00.000Z",
    departed_at: null,
    metadata: {},
    created_at: "2026-05-27T15:00:00.000Z",
    updated_at: "2026-05-27T15:00:00.000Z",
  },
];

const buildProximitySample = (overrides: Record<string, unknown>) => ({
  id: "geo-member-4",
  meeting_id: "meeting-4",
  meeting_participant_id: "participant-member-4",
  meeting_checkin_id: "checkin-member-4",
  captured_by_user_id: "owner-4",
  sample_kind: "device_gps",
  capture_stage: "checkin",
  latitude: 41.4993,
  longitude: -81.6944,
  accuracy_meters: 9,
  altitude_meters: null,
  captured_at: "2026-05-27T15:00:00.000Z",
  expires_at: null,
  metadata: {},
  created_at: "2026-05-27T15:00:00.000Z",
  ...overrides,
});

const setupProximityScenario = () => {
  mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
    id: "notary-4",
    supabaseUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    email: "notary@example.com",
    role: "notary",
    status: "active",
    firstName: "Nora",
    lastName: "Tary",
    availableRoles: ["notary"],
    roleAssignments: [],
  });
  mocks.getNotarizationRequestByIdMock.mockResolvedValue({
    id: "req-4",
    document_id: "doc-4",
    workflow_id: "workflow-4",
    assigned_notary_id: "notary-4",
    status: "in_review",
    submitted_at: "2026-05-27T14:00:00.000Z",
    created_at: "2026-05-27T14:00:00.000Z",
  });
  mocks.getDocumentByIdMock.mockResolvedValue({
    id: "doc-4",
    owner_id: "owner-4",
    idn: "IDN-999",
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
    created_at: "2026-05-27T14:00:00.000Z",
    updated_at: "2026-05-27T14:00:00.000Z",
  });
  mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
    id: "workflow-4",
    owner_user_id: "owner-4",
    created_by_user_id: "owner-4",
    primary_document_id: "doc-4",
    workflow_kind: "single_document",
    status: "approved",
    selected_notary_user_id: null,
    assigned_notary_user_id: "notary-4",
    current_legacy_request_id: "req-4",
    submitted_at: "2026-05-27T14:00:00.000Z",
    last_code_generated_at: null,
    review_started_at: "2026-05-27T14:05:00.000Z",
    closed_at: null,
    context_json: {},
    metadata: {},
    created_at: "2026-05-27T14:00:00.000Z",
    updated_at: "2026-05-27T14:05:00.000Z",
  });
  mocks.getMeetingByRequestIdMock.mockResolvedValue({
    id: "meeting-4",
    request_id: "req-4",
    workflow_id: "workflow-4",
    scheduled_at: "2026-05-27T15:00:00.000Z",
    timezone: null,
    location: null,
    status: "in_progress",
    same_place_required: true,
    same_place_status: "pending",
    evidence_retention_until: null,
    metadata: {},
    created_at: "2026-05-27T15:00:00.000Z",
    updated_at: "2026-05-27T15:00:00.000Z",
  });
  mocks.listMeetingParticipantsMock.mockResolvedValue(proximityParticipants);
};

const postProximityEvaluation = (body: Record<string, unknown>) => {
  const token = signToken({
    sub: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    app_metadata: { role: "notary" },
  });

  return request(app)
    .post("/notary/requests/req-4/meeting/proximity-evaluation")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
};

const postIdentityVerification = (body: Record<string, unknown>) => {
  const token = signToken({
    sub: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    app_metadata: { role: "notary" },
  });

  return request(app)
    .post("/notary/requests/req-4/meeting/identity-verification")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
};

describe("Phase 5 meeting runtime slice", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getNotaryProfileByUserIdMock.mockResolvedValue({
      id: "notary-profile-1",
      userId: "11111111-1111-1111-1111-111111111111",
      jurisdiction: "US-OH",
      serviceAreaKind: "county",
      serviceAreaName: "Cuyahoga County",
      commissionNumber: "OH-12345",
      commissionExpiresAt: "2028-05-27T00:00:00.000Z",
      sealStoragePath: null,
      signatureDataUrl: "data:image/png;base64,aGVsbG8=",
      sealDataUrl: "data:image/png;base64,aGVsbG8=",
      createdAt: "2026-05-27T14:00:00.000Z",
      updatedAt: "2026-05-27T14:00:00.000Z",
    });
  });

  it("requires complete current notary profile fields before session start", () => {
    expect(resolveMissingNotarySessionProfileFields({
      id: "profile-1",
      userId: "notary-1",
      jurisdiction: "US-CA",
      serviceAreaKind: "county",
      serviceAreaName: "Orange County",
      commissionNumber: "CA-456345",
      commissionExpiresAt: "2093-05-06T23:59:59.999Z",
      sealStoragePath: null,
      signatureDataUrl: "data:image/png;base64,AAAA",
      sealDataUrl: "data:image/png;base64,AAAA",
      createdAt: "2026-06-29T21:20:16.000Z",
      updatedAt: "2026-06-29T21:20:16.000Z",
    })).toEqual([]);

    expect(resolveMissingNotarySessionProfileFields({
      id: "profile-2",
      userId: "notary-2",
      jurisdiction: "US-CA",
      serviceAreaKind: "county",
      serviceAreaName: null,
      commissionNumber: "",
      commissionExpiresAt: "2025-05-06T23:59:59.999Z",
      sealStoragePath: null,
      signatureDataUrl: null,
      sealDataUrl: null,
      createdAt: "2026-06-29T21:20:16.000Z",
      updatedAt: "2026-06-29T21:20:16.000Z",
    })).toEqual([
      "service area",
      "commission number",
      "current commission expiration",
      "signature",
      "seal",
    ]);
  });

  it("creates a meeting proposal and seeds default participants", async () => {
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
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-123",
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
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
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
      updated_at: "2026-04-20T10:05:00.000Z",
    });
    mocks.getMeetingByRequestIdMock.mockResolvedValue(null);
    mocks.createMeetingMock.mockResolvedValue({
      id: "meeting-1",
      request_id: "req-1",
      workflow_id: "workflow-1",
      scheduled_at: "2026-04-22T15:00:00.000Z",
      timezone: "America/New_York",
      location: "DARCi HQ",
      status: "scheduled",
      same_place_required: true,
      same_place_status: "not_started",
      evidence_retention_until: null,
      metadata: {
        proposedSlots: [
          "2026-04-22T15:00:00.000Z",
          "2026-04-22T16:00:00.000Z",
        ],
      },
      created_at: "2026-04-20T11:00:00.000Z",
      updated_at: "2026-04-20T11:00:00.000Z",
    });
    mocks.listMeetingParticipantsMock.mockResolvedValue([]);
    mocks.createMeetingParticipantMock
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        id: "participant-notary",
        meeting_id: "meeting-1",
        user_id: "11111111-1111-1111-1111-111111111111",
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
      });

    const token = signToken({
      sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      app_metadata: { role: "notary" },
    });

    const response = await request(app)
      .post("/notary/requests/req-1/meeting/propose")
      .set("Authorization", `Bearer ${token}`)
      .send({
        proposedSlots: [
          "2026-04-22T15:00:00.000Z",
          "2026-04-22T16:00:00.000Z",
        ],
        timezone: "America/New_York",
        location: "DARCi HQ",
      });

    expect(response.status).toBe(200);
    expect(response.body.meeting.participants).toHaveLength(2);
    expect(mocks.createMeetingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        workflowId: "workflow-1",
      }),
    );
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "notary.meeting_time_proposed",
      }),
    );
  });

  it("records a member arrival check-in with geolocation", async () => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
      id: "owner-1",
      supabaseUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      email: "member@example.com",
      role: "member",
      status: "active",
      firstName: "Mina",
      lastName: "Member",
      availableRoles: ["member"],
      roleAssignments: [],
    });
    mocks.getNotarizationRequestByIdMock.mockResolvedValue({
      id: "req-2",
      document_id: "doc-2",
      workflow_id: "workflow-2",
      assigned_notary_id: "notary-2",
      status: "in_review",
      submitted_at: "2026-04-20T10:00:00.000Z",
      created_at: "2026-04-20T10:00:00.000Z",
    });
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-2",
      owner_id: "owner-1",
      idn: "IDN-456",
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
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
      id: "workflow-2",
      owner_user_id: "owner-1",
      created_by_user_id: "owner-1",
      primary_document_id: "doc-2",
      workflow_kind: "single_document",
      status: "approved",
      selected_notary_user_id: null,
      assigned_notary_user_id: "notary-2",
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
    mocks.getMeetingByRequestIdMock
      .mockResolvedValueOnce({
        id: "meeting-2",
        request_id: "req-2",
        workflow_id: "workflow-2",
        scheduled_at: "2026-04-22T15:00:00.000Z",
        timezone: "America/New_York",
        location: "DARCi HQ",
        status: "scheduled",
        same_place_required: true,
        same_place_status: "not_started",
        evidence_retention_until: null,
        metadata: {},
        created_at: "2026-04-20T11:00:00.000Z",
        updated_at: "2026-04-20T11:00:00.000Z",
      })
      .mockResolvedValueOnce({
        id: "meeting-2",
        request_id: "req-2",
        workflow_id: "workflow-2",
        scheduled_at: "2026-04-22T15:00:00.000Z",
        timezone: "America/New_York",
        location: "DARCi HQ",
        status: "scheduled",
        same_place_required: true,
        same_place_status: "pending",
        evidence_retention_until: null,
        metadata: { lastCheckinAt: "2026-04-20T11:30:00.000Z" },
        created_at: "2026-04-20T11:00:00.000Z",
        updated_at: "2026-04-20T11:30:00.000Z",
      });
    mocks.listMeetingParticipantsMock.mockResolvedValue([
      {
        id: "participant-member",
        meeting_id: "meeting-2",
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
      },
      {
        id: "participant-notary",
        meeting_id: "meeting-2",
        user_id: "notary-2",
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
      },
    ]);
    mocks.updateMeetingParticipantMock.mockResolvedValue({
      id: "participant-member",
      meeting_id: "meeting-2",
      user_id: "owner-1",
      document_party_id: null,
      participant_role: "member",
      status: "checked_in",
      presence_required: true,
      participant_label: null,
      arrived_at: "2026-04-20T11:30:00.000Z",
      departed_at: null,
      metadata: {},
      created_at: "2026-04-20T11:00:00.000Z",
      updated_at: "2026-04-20T11:30:00.000Z",
    });
    mocks.createMeetingCheckinMock.mockResolvedValue({
      id: "checkin-1",
      meeting_id: "meeting-2",
      meeting_participant_id: "participant-member",
      recorded_by_user_id: "owner-1",
      checkin_kind: "arrival",
      status: "recorded",
      recorded_at: "2026-04-20T11:30:00.000Z",
      notes: "Arrived in lobby",
      metadata: {},
      created_at: "2026-04-20T11:30:00.000Z",
      updated_at: "2026-04-20T11:30:00.000Z",
    });
    mocks.createGeolocationSampleMock.mockResolvedValue({
      id: "geo-1",
      meeting_id: "meeting-2",
      meeting_participant_id: "participant-member",
      meeting_checkin_id: "checkin-1",
      captured_by_user_id: "owner-1",
      sample_kind: "device_gps",
      capture_stage: "checkin",
      latitude: 41.4993,
      longitude: -81.6944,
      accuracy_meters: 9,
      altitude_meters: null,
      captured_at: "2026-04-20T11:30:00.000Z",
      expires_at: null,
      metadata: {},
      created_at: "2026-04-20T11:30:00.000Z",
    });
    mocks.updateMeetingMock.mockResolvedValue({
      id: "meeting-2",
      request_id: "req-2",
      workflow_id: "workflow-2",
      scheduled_at: "2026-04-22T15:00:00.000Z",
      timezone: "America/New_York",
      location: "DARCi HQ",
      status: "scheduled",
      same_place_required: true,
      same_place_status: "pending",
      evidence_retention_until: null,
      metadata: { lastCheckinAt: "2026-04-20T11:30:00.000Z" },
      created_at: "2026-04-20T11:00:00.000Z",
      updated_at: "2026-04-20T11:30:00.000Z",
    });

    const token = signToken({
      sub: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .post("/notary/requests/req-2/meeting/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({
        checkinKind: "arrival",
        recordedAt: "2026-04-20T11:30:00.000Z",
        notes: "Arrived in lobby",
        geolocation: {
          latitude: 41.4993,
          longitude: -81.6944,
          accuracyMeters: 9,
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.participant.status).toBe("checked_in");
    expect(response.body.checkin.geolocation.latitude).toBe(41.4993);
    expect(mocks.createMeetingCheckinMock).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: "meeting-2",
        checkinKind: "arrival",
      }),
    );
    expect(mocks.recordAuditEventMock).not.toHaveBeenCalled();
  });

  it("auto-records same-place proximity when member arrival completes a fresh sample pair", async () => {
    setupProximityScenario();
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
      id: "owner-4",
      supabaseUserId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      email: "member@example.com",
      role: "member",
      status: "active",
      firstName: "Mina",
      lastName: "Member",
      availableRoles: ["member"],
      roleAssignments: [],
    });
    const participants = proximityParticipants.map((participant) =>
      participant.participant_role === "member"
        ? { ...participant, status: "expected", arrived_at: null }
        : participant,
    );
    mocks.listMeetingParticipantsMock.mockResolvedValue(participants);
    mocks.updateMeetingParticipantMock.mockResolvedValue({
      ...proximityParticipants[0],
      status: "checked_in",
      arrived_at: "2026-05-27T15:05:00.000Z",
      updated_at: "2026-05-27T15:05:00.000Z",
    });
    mocks.createMeetingCheckinMock.mockResolvedValue({
      id: "checkin-member-auto",
      meeting_id: "meeting-4",
      meeting_participant_id: "participant-member-4",
      recorded_by_user_id: "owner-4",
      checkin_kind: "arrival",
      status: "recorded",
      recorded_at: "2026-05-27T15:05:00.000Z",
      notes: null,
      metadata: {},
      created_at: "2026-05-27T15:05:00.000Z",
      updated_at: "2026-05-27T15:05:00.000Z",
    });
    mocks.createGeolocationSampleMock.mockResolvedValue(
      buildProximitySample({
        id: "geo-member-auto",
        captured_at: "2026-05-27T15:05:00.000Z",
        created_at: "2026-05-27T15:05:00.000Z",
      }),
    );
    mocks.listMeetingGeolocationSamplesMock.mockResolvedValueOnce([
      buildProximitySample({
        id: "geo-notary-auto",
        meeting_participant_id: "participant-notary-4",
        meeting_checkin_id: "checkin-notary-4",
        captured_by_user_id: "notary-4",
        capture_stage: "meeting_start",
        latitude: 41.49931,
        longitude: -81.69441,
        captured_at: "2026-05-27T15:04:30.000Z",
        created_at: "2026-05-27T15:04:30.000Z",
      }),
    ]);
    mocks.createProximityEvaluationMock.mockImplementation(async (input) => ({
      id: "proximity-auto-pass",
      meeting_id: input.meetingId,
      evaluated_by_user_id: input.evaluatedByUserId,
      member_sample_id: input.memberSampleId,
      notary_sample_id: input.notarySampleId,
      evaluation_kind: "same_place",
      status: input.status,
      threshold_meters: input.thresholdMeters,
      observed_distance_meters: input.observedDistanceMeters,
      evaluated_at: input.evaluatedAt,
      notes: input.notes,
      metadata: input.metadata,
      created_at: input.evaluatedAt,
      updated_at: input.evaluatedAt,
    }));
    mocks.updateMeetingMock.mockResolvedValue({
      id: "meeting-4",
      request_id: "req-4",
      workflow_id: "workflow-4",
      scheduled_at: "2026-05-27T15:00:00.000Z",
      timezone: null,
      location: null,
      status: "in_progress",
      same_place_required: true,
      same_place_status: "passed",
      evidence_retention_until: null,
      metadata: { lastProximityEvaluationStatus: "passed" },
      created_at: "2026-05-27T15:00:00.000Z",
      updated_at: "2026-05-27T15:05:00.000Z",
    });

    const response = await request(app)
      .post("/notary/requests/req-4/meeting/check-in")
      .set(
        "Authorization",
        `Bearer ${signToken({ sub: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", app_metadata: { role: "member" } })}`,
      )
      .send({
        participantRole: "member",
        checkinKind: "arrival",
        recordedAt: "2026-05-27T15:05:00.000Z",
        geolocation: {
          latitude: 41.4993,
          longitude: -81.6944,
          accuracyMeters: 9,
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.meeting.samePlaceStatus).toBe("passed");
    expect(response.body.autoProximityEvaluation.status).toBe("passed");
    expect(mocks.createProximityEvaluationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluatedByUserId: null,
        memberSampleId: "geo-member-auto",
        notarySampleId: "geo-notary-auto",
        metadata: expect.objectContaining({
          trigger: "automatic_checkin",
          policy: expect.objectContaining({ policyVersion: "same_place_v1" }),
        }),
      }),
    );
    expect(mocks.updateMeetingMock).toHaveBeenCalledWith(
      "meeting-4",
      expect.objectContaining({ same_place_status: "passed" }),
    );
  });

  it("keeps member geolocation check-in successful when the notary sample is not ready", async () => {
    setupProximityScenario();
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
      id: "owner-4",
      supabaseUserId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      email: "member@example.com",
      role: "member",
      status: "active",
      firstName: "Mina",
      lastName: "Member",
      availableRoles: ["member"],
      roleAssignments: [],
    });
    const participants = proximityParticipants.map((participant) =>
      participant.participant_role === "member"
        ? { ...participant, status: "expected", arrived_at: null }
        : participant,
    );
    mocks.listMeetingParticipantsMock.mockResolvedValue(participants);
    mocks.updateMeetingParticipantMock.mockResolvedValue({
      ...proximityParticipants[0],
      status: "checked_in",
      arrived_at: "2026-05-27T15:05:00.000Z",
      updated_at: "2026-05-27T15:05:00.000Z",
    });
    mocks.createMeetingCheckinMock.mockResolvedValue({
      id: "checkin-member-auto-missing",
      meeting_id: "meeting-4",
      meeting_participant_id: "participant-member-4",
      recorded_by_user_id: "owner-4",
      checkin_kind: "arrival",
      status: "recorded",
      recorded_at: "2026-05-27T15:05:00.000Z",
      notes: null,
      metadata: {},
      created_at: "2026-05-27T15:05:00.000Z",
      updated_at: "2026-05-27T15:05:00.000Z",
    });
    mocks.createGeolocationSampleMock.mockResolvedValue(
      buildProximitySample({
        id: "geo-member-auto-missing",
        captured_at: "2026-05-27T15:05:00.000Z",
        created_at: "2026-05-27T15:05:00.000Z",
      }),
    );
    mocks.listMeetingGeolocationSamplesMock.mockResolvedValueOnce([]);

    const response = await request(app)
      .post("/notary/requests/req-4/meeting/check-in")
      .set(
        "Authorization",
        `Bearer ${signToken({ sub: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", app_metadata: { role: "member" } })}`,
      )
      .send({
        participantRole: "member",
        checkinKind: "arrival",
        recordedAt: "2026-05-27T15:05:00.000Z",
        geolocation: {
          latitude: 41.4993,
          longitude: -81.6944,
          accuracyMeters: 9,
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.meeting.samePlaceStatus).toBe("pending");
    expect(response.body.autoProximityEvaluation).toBeUndefined();
    expect(mocks.createProximityEvaluationMock).not.toHaveBeenCalled();
    expect(mocks.updateMeetingMock).not.toHaveBeenCalled();
  });

  it("keeps check-in successful and broadcasts when automatic proximity persistence fails", async () => {
    setupProximityScenario();
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
      id: "owner-4",
      supabaseUserId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      email: "member@example.com",
      role: "member",
      status: "active",
      firstName: "Mina",
      lastName: "Member",
      availableRoles: ["member"],
      roleAssignments: [],
    });
    const participants = proximityParticipants.map((participant) =>
      participant.participant_role === "member"
        ? { ...participant, status: "expected", arrived_at: null }
        : participant,
    );
    mocks.listMeetingParticipantsMock.mockResolvedValue(participants);
    mocks.updateMeetingParticipantMock.mockResolvedValue({
      ...proximityParticipants[0],
      status: "checked_in",
      arrived_at: "2026-08-01T19:38:00.055Z",
      updated_at: "2026-08-01T19:38:00.055Z",
    });
    mocks.createMeetingCheckinMock.mockResolvedValue({
      id: "checkin-member-overflow",
      meeting_id: "meeting-4",
      meeting_participant_id: "participant-member-4",
      recorded_by_user_id: "owner-4",
      checkin_kind: "arrival",
      status: "recorded",
      recorded_at: "2026-08-01T19:38:00.055Z",
      notes: null,
      metadata: {},
      created_at: "2026-08-01T19:38:00.055Z",
      updated_at: "2026-08-01T19:38:00.055Z",
    });
    mocks.createGeolocationSampleMock.mockResolvedValue(
      buildProximitySample({
        id: "geo-member-overflow",
        latitude: 20.696899758457597,
        longitude: -103.3768016973687,
        captured_at: "2026-08-01T19:38:00.055Z",
        created_at: "2026-08-01T19:38:00.055Z",
      }),
    );
    mocks.listMeetingGeolocationSamplesMock.mockResolvedValueOnce([
      buildProximitySample({
        id: "geo-notary-overflow",
        meeting_participant_id: "participant-notary-4",
        meeting_checkin_id: "checkin-notary-4",
        captured_by_user_id: "notary-4",
        capture_stage: "meeting_start",
        latitude: 39.9612,
        longitude: -82.9988,
        captured_at: "2026-08-01T19:37:30.000Z",
        created_at: "2026-08-01T19:37:30.000Z",
      }),
    ]);
    mocks.createProximityEvaluationMock.mockRejectedValue(new Error("numeric field overflow"));
    const consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request(app)
      .post("/notary/requests/req-4/meeting/check-in")
      .set(
        "Authorization",
        `Bearer ${signToken({ sub: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", app_metadata: { role: "member" } })}`,
      )
      .send({
        participantRole: "member",
        checkinKind: "arrival",
        recordedAt: "2026-08-01T19:38:00.055Z",
        geolocation: {
          latitude: 20.696899758457597,
          longitude: -103.3768016973687,
          accuracyMeters: 94,
        },
      });

    consoleErrorMock.mockRestore();
    expect(response.status).toBe(201);
    expect(response.body.checkin.id).toBe("checkin-member-overflow");
    expect(response.body.autoProximityEvaluation).toBeUndefined();
    expect(mocks.broadcastRequestRealtimeInvalidationMock).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-4", reason: "meeting_checkin_recorded" }),
    );
  });

  it("rejects notary-created member geolocation check-ins", async () => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
      id: "notary-2",
      supabaseUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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
      assigned_notary_id: "notary-2",
      status: "in_review",
      submitted_at: "2026-04-20T10:00:00.000Z",
      created_at: "2026-04-20T10:00:00.000Z",
    });
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-2",
      owner_id: "owner-1",
      idn: "IDN-456",
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
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
      id: "workflow-2",
      owner_user_id: "owner-1",
      created_by_user_id: "owner-1",
      primary_document_id: "doc-2",
      workflow_kind: "single_document",
      status: "approved",
      selected_notary_user_id: null,
      assigned_notary_user_id: "notary-2",
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
    mocks.getMeetingByRequestIdMock.mockResolvedValue({
      id: "meeting-2",
      request_id: "req-2",
      workflow_id: "workflow-2",
      scheduled_at: "2026-04-22T15:00:00.000Z",
      timezone: "America/New_York",
      location: "DARCi HQ",
      status: "in_progress",
      same_place_required: true,
      same_place_status: "not_started",
      evidence_retention_until: null,
      metadata: {},
      created_at: "2026-04-20T11:00:00.000Z",
      updated_at: "2026-04-20T11:00:00.000Z",
    });

    const token = signToken({
      sub: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      app_metadata: { role: "notary" },
    });

    const response = await request(app)
      .post("/notary/requests/req-2/meeting/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({
        participantRole: "member",
        checkinKind: "arrival",
        geolocation: {
          latitude: 41.4993,
          longitude: -81.6944,
          accuracyMeters: 9,
        },
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toContain("member account");
    expect(mocks.createMeetingCheckinMock).not.toHaveBeenCalled();
    expect(mocks.createGeolocationSampleMock).not.toHaveBeenCalled();
  });

  it("starts an in-person session from an approved request without an existing meeting", async () => {
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
      id: "req-3",
      document_id: "doc-3",
      workflow_id: "workflow-3",
      assigned_notary_id: "11111111-1111-1111-1111-111111111111",
      status: "approved",
      submitted_at: "2026-04-20T10:00:00.000Z",
      created_at: "2026-04-20T10:00:00.000Z",
    });
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-3",
      owner_id: "owner-3",
      idn: "IDN-789",
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
    });
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue({
      id: "workflow-3",
      owner_user_id: "owner-3",
      created_by_user_id: "owner-3",
      primary_document_id: "doc-3",
      workflow_kind: "single_document",
      status: "approved",
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
    mocks.getMeetingByRequestIdMock.mockResolvedValue(null);
    mocks.createMeetingMock.mockResolvedValue({
      id: "meeting-3",
      request_id: "req-3",
      workflow_id: "workflow-3",
      scheduled_at: "2026-05-27T15:00:00.000Z",
      timezone: null,
      location: null,
      status: "scheduled",
      same_place_required: true,
      same_place_status: "not_started",
      evidence_retention_until: null,
      metadata: {},
      created_at: "2026-05-27T15:00:00.000Z",
      updated_at: "2026-05-27T15:00:00.000Z",
    });
    mocks.listMeetingParticipantsMock.mockResolvedValue([]);
    mocks.createMeetingParticipantMock
      .mockResolvedValueOnce({
        id: "participant-member-3",
        meeting_id: "meeting-3",
        user_id: "owner-3",
        document_party_id: null,
        participant_role: "member",
        status: "expected",
        presence_required: true,
        participant_label: null,
        arrived_at: null,
        departed_at: null,
        metadata: {},
        created_at: "2026-05-27T15:00:00.000Z",
        updated_at: "2026-05-27T15:00:00.000Z",
      })
      .mockResolvedValueOnce({
        id: "participant-notary-3",
        meeting_id: "meeting-3",
        user_id: "11111111-1111-1111-1111-111111111111",
        document_party_id: null,
        participant_role: "notary",
        status: "expected",
        presence_required: true,
        participant_label: null,
        arrived_at: null,
        departed_at: null,
        metadata: {},
        created_at: "2026-05-27T15:00:00.000Z",
        updated_at: "2026-05-27T15:00:00.000Z",
      });
    mocks.updateMeetingParticipantMock.mockResolvedValue({
      id: "participant-notary-3",
      meeting_id: "meeting-3",
      user_id: "11111111-1111-1111-1111-111111111111",
      document_party_id: null,
      participant_role: "notary",
      status: "checked_in",
      presence_required: true,
      participant_label: null,
      arrived_at: "2026-05-27T15:00:00.000Z",
      departed_at: null,
      metadata: {},
      created_at: "2026-05-27T15:00:00.000Z",
      updated_at: "2026-05-27T15:00:00.000Z",
    });
    mocks.createMeetingCheckinMock.mockResolvedValue({
      id: "checkin-3",
      meeting_id: "meeting-3",
      meeting_participant_id: "participant-notary-3",
      recorded_by_user_id: "11111111-1111-1111-1111-111111111111",
      checkin_kind: "meeting_start",
      status: "recorded",
      recorded_at: "2026-05-27T15:00:00.000Z",
      notes: null,
      metadata: {},
      created_at: "2026-05-27T15:00:00.000Z",
      updated_at: "2026-05-27T15:00:00.000Z",
    });
    mocks.createGeolocationSampleMock.mockResolvedValue({
      id: "geo-start-3",
      meeting_id: "meeting-3",
      meeting_participant_id: "participant-notary-3",
      meeting_checkin_id: "checkin-3",
      captured_by_user_id: "11111111-1111-1111-1111-111111111111",
      sample_kind: "device_gps",
      capture_stage: "meeting_start",
      latitude: 41.4993,
      longitude: -81.6944,
      accuracy_meters: 8,
      altitude_meters: null,
      captured_at: "2026-05-27T15:00:00.000Z",
      expires_at: null,
      metadata: {},
      created_at: "2026-05-27T15:00:00.000Z",
    });
    mocks.updateMeetingMock.mockResolvedValue({
      id: "meeting-3",
      request_id: "req-3",
      workflow_id: "workflow-3",
      scheduled_at: "2026-05-27T15:00:00.000Z",
      timezone: null,
      location: null,
      status: "in_progress",
      same_place_required: true,
      same_place_status: "pending",
      evidence_retention_until: null,
      metadata: { lastCheckinAt: "2026-05-27T15:00:00.000Z" },
      created_at: "2026-05-27T15:00:00.000Z",
      updated_at: "2026-05-27T15:00:00.000Z",
    });
    mocks.queueInPersonSessionStartedNotificationMock.mockResolvedValue({
      jobId: "job-session-start-3",
      jobIds: ["job-session-start-3", "job-session-start-3-push"],
      deliveryCount: 1,
      existing: false,
    });
    mocks.runDueNotificationJobsMock.mockResolvedValue({ processed: 1 });

    const token = signToken({
      sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      app_metadata: { role: "notary" },
    });

    const response = await request(app)
      .post("/notary/requests/req-3/meeting/start")
      .set("Authorization", `Bearer ${token}`)
      .send({
        recordedAt: "2026-05-27T15:00:00.000Z",
        geolocation: {
          latitude: 41.4993,
          longitude: -81.6944,
          accuracyMeters: 8,
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.meeting.status).toBe("in_progress");
    expect(response.body.checkin.geolocation.captureStage).toBe("meeting_start");
    expect(mocks.createMeetingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-3",
        status: "scheduled",
      }),
    );
    expect(mocks.createMeetingCheckinMock).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: "meeting-3",
        checkinKind: "meeting_start",
      }),
    );
    expect(mocks.updateMeetingMock).toHaveBeenCalledWith(
      "meeting-3",
      expect.objectContaining({ status: "in_progress", same_place_status: "pending" }),
    );
    expect(mocks.createGeolocationSampleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: "meeting-3",
        meetingParticipantId: "participant-notary-3",
        meetingCheckinId: "checkin-3",
        capturedByUserId: "11111111-1111-1111-1111-111111111111",
        captureStage: "meeting_start",
      }),
    );
    expect(mocks.queueInPersonSessionStartedNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-3",
        requestId: "req-3",
        notaryUserId: "11111111-1111-1111-1111-111111111111",
      }),
    );
    expect(mocks.runDueNotificationJobsMock).toHaveBeenCalledWith({
      limit: 2,
      notificationJobIds: ["job-session-start-3", "job-session-start-3-push"],
    });
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "notary.meeting_started" }),
    );
  });

  it("rejects vague identity document verification payloads", async () => {
    setupProximityScenario();

    const response = await postIdentityVerification({
      participantRole: "member",
      verificationMethod: "in_person_document",
      status: "verified",
      subjectName: "Mina Member",
      documentType: "government_id",
      issuingJurisdiction: "OH",
      documentExpirationDate: "2030-01-01",
      documentNumberTail: "1234",
    });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe("documentType");
    expect(mocks.createMeetingCheckinMock).not.toHaveBeenCalled();
    expect(mocks.createIdentityVerificationEventMock).not.toHaveBeenCalled();
  });

  it("records structured identity verification metadata without full document numbers", async () => {
    setupProximityScenario();
    mocks.createMeetingCheckinMock.mockResolvedValue({
      id: "checkin-identity-4",
      meeting_id: "meeting-4",
      meeting_participant_id: "participant-member-4",
      recorded_by_user_id: "notary-4",
      checkin_kind: "identity",
      status: "recorded",
      recorded_at: "2026-05-27T15:06:00.000Z",
      notes: "Verified state ID",
      metadata: {},
      created_at: "2026-05-27T15:06:00.000Z",
      updated_at: "2026-05-27T15:06:00.000Z",
    });
    mocks.createIdentityVerificationEventMock.mockImplementation(async (input) => ({
      id: "identity-4",
      meeting_id: input.meetingId,
      meeting_participant_id: input.meetingParticipantId,
      verified_by_user_id: input.verifiedByUserId,
      verification_method: input.verificationMethod,
      status: input.status,
      subject_name_snapshot: input.subjectNameSnapshot,
      document_type: input.documentType,
      document_last4: input.documentLast4,
      issuing_jurisdiction: input.issuingJurisdiction,
      verified_at: input.verifiedAt,
      notes: input.notes,
      metadata: input.metadata,
      created_at: input.verifiedAt,
      updated_at: input.verifiedAt,
    }));

    const response = await postIdentityVerification({
      participantRole: "member",
      verificationMethod: "in_person_document",
      status: "verified",
      subjectName: "Mina Member",
      documentType: "state_identification_card",
      issuingJurisdiction: "OH",
      documentExpirationDate: "2030-01-01",
      documentNumberTail: "ab12",
      evidenceArtifactIds: ["artifact-front", "artifact-back"],
      verifiedAt: "2026-05-27T15:06:00.000Z",
      notes: "Verified state ID",
    });

    expect(response.status).toBe(201);
    expect(response.body.identityVerification.documentType).toBe("state_identification_card");
    expect(response.body.identityVerification.documentNumberTail).toBe("AB12");
    expect(response.body.identityVerification.documentExpirationDate).toBe("2030-01-01");
    expect(response.body.identityVerification.evidenceArtifactIds).toEqual([
      "artifact-front",
      "artifact-back",
    ]);
    expect(mocks.createIdentityVerificationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: "state_identification_card",
        documentLast4: "AB12",
        issuingJurisdiction: "OH",
        metadata: expect.objectContaining({
          identityDocument: expect.objectContaining({
            policyVersion: "identity_document_v1",
            documentExpirationDate: "2030-01-01",
            evidenceArtifactIds: ["artifact-front", "artifact-back"],
          }),
        }),
      }),
    );
    expect(mocks.createIdentityVerificationEventMock.mock.calls[0][0]).not.toHaveProperty("documentNumber");
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "notary.identity_verified",
        metadata: expect.objectContaining({
          doc_type: "state_identification_card",
          doc_number_tail: "AB12",
          issuing_jurisdiction: "OH",
        }),
      }),
    );
  });

  it("rejects stale samples for same-place proximity evaluation", async () => {
    setupProximityScenario();
    mocks.listMeetingGeolocationSamplesMock
      .mockResolvedValueOnce([
        buildProximitySample({
          id: "geo-member-stale",
          captured_at: "2026-05-27T15:00:00.000Z",
        }),
      ])
      .mockResolvedValueOnce([
        buildProximitySample({
          id: "geo-notary-stale",
          meeting_participant_id: "participant-notary-4",
          meeting_checkin_id: "checkin-notary-4",
          captured_by_user_id: "notary-4",
          capture_stage: "meeting_start",
          captured_at: "2026-05-27T15:00:00.000Z",
        }),
      ]);

    const response = await postProximityEvaluation({
      evaluatedAt: "2026-05-27T15:20:01.000Z",
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain("within 15 minutes");
    expect(mocks.createProximityEvaluationMock).not.toHaveBeenCalled();
    expect(mocks.updateMeetingMock).not.toHaveBeenCalled();
  });

  it("rejects wrong-actor samples for same-place proximity evaluation", async () => {
    setupProximityScenario();
    mocks.listMeetingGeolocationSamplesMock
      .mockResolvedValueOnce([
        buildProximitySample({
          id: "geo-member-wrong-actor",
          captured_by_user_id: "notary-4",
        }),
      ])
      .mockResolvedValueOnce([
        buildProximitySample({
          id: "geo-notary-4",
          meeting_participant_id: "participant-notary-4",
          meeting_checkin_id: "checkin-notary-4",
          captured_by_user_id: "notary-4",
          capture_stage: "meeting_start",
        }),
      ]);

    const response = await postProximityEvaluation({
      evaluatedAt: "2026-05-27T15:05:00.000Z",
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain("member account");
    expect(mocks.createProximityEvaluationMock).not.toHaveBeenCalled();
    expect(mocks.updateMeetingMock).not.toHaveBeenCalled();
  });

  it("passes same-place proximity with fresh actor-correct samples inside threshold", async () => {
    setupProximityScenario();
    mocks.listMeetingGeolocationSamplesMock
      .mockResolvedValueOnce([
        buildProximitySample({
          id: "geo-member-pass",
          captured_at: "2026-05-27T15:04:00.000Z",
          accuracy_meters: 9,
        }),
      ])
      .mockResolvedValueOnce([
        buildProximitySample({
          id: "geo-notary-pass",
          meeting_participant_id: "participant-notary-4",
          meeting_checkin_id: "checkin-notary-4",
          captured_by_user_id: "notary-4",
          capture_stage: "meeting_start",
          latitude: 41.49931,
          longitude: -81.69441,
          captured_at: "2026-05-27T15:04:30.000Z",
          accuracy_meters: 8,
        }),
      ]);
    mocks.createProximityEvaluationMock.mockImplementation(async (input) => ({
      id: "proximity-pass-4",
      meeting_id: input.meetingId,
      evaluated_by_user_id: input.evaluatedByUserId,
      member_sample_id: input.memberSampleId,
      notary_sample_id: input.notarySampleId,
      evaluation_kind: "same_place",
      status: input.status,
      threshold_meters: input.thresholdMeters,
      observed_distance_meters: input.observedDistanceMeters,
      evaluated_at: input.evaluatedAt,
      notes: input.notes,
      metadata: input.metadata,
      created_at: input.evaluatedAt,
      updated_at: input.evaluatedAt,
    }));
    mocks.updateMeetingMock.mockResolvedValue({
      id: "meeting-4",
      request_id: "req-4",
      workflow_id: "workflow-4",
      scheduled_at: "2026-05-27T15:00:00.000Z",
      timezone: null,
      location: null,
      status: "in_progress",
      same_place_required: true,
      same_place_status: "passed",
      evidence_retention_until: null,
      metadata: {},
      created_at: "2026-05-27T15:00:00.000Z",
      updated_at: "2026-05-27T15:05:00.000Z",
    });

    const response = await postProximityEvaluation({
      evaluatedAt: "2026-05-27T15:05:00.000Z",
      thresholdMeters: 100,
    });

    expect(response.status).toBe(201);
    expect(response.body.evaluation.status).toBe("passed");
    expect(mocks.createProximityEvaluationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "passed",
        thresholdMeters: 100,
        metadata: expect.objectContaining({
          policy: expect.objectContaining({ policyVersion: "same_place_v1" }),
          sampleAgesSeconds: expect.objectContaining({ member: 60, notary: 30 }),
          sampleAccuracyMeters: expect.objectContaining({ member: 9, notary: 8 }),
        }),
      }),
    );
    expect(mocks.updateMeetingMock).toHaveBeenCalledWith(
      "meeting-4",
      expect.objectContaining({ same_place_status: "passed" }),
    );
  });

  it("fails same-place proximity outside threshold and records failed meeting state", async () => {
    setupProximityScenario();
    mocks.listMeetingGeolocationSamplesMock
      .mockResolvedValueOnce([
        buildProximitySample({
          id: "geo-member-fail",
          captured_at: "2026-05-27T15:04:00.000Z",
        }),
      ])
      .mockResolvedValueOnce([
        buildProximitySample({
          id: "geo-notary-fail",
          meeting_participant_id: "participant-notary-4",
          meeting_checkin_id: "checkin-notary-4",
          captured_by_user_id: "notary-4",
          capture_stage: "meeting_start",
          latitude: 41.51,
          longitude: -81.72,
          captured_at: "2026-05-27T15:04:30.000Z",
        }),
      ]);
    mocks.createProximityEvaluationMock.mockImplementation(async (input) => ({
      id: "proximity-fail-4",
      meeting_id: input.meetingId,
      evaluated_by_user_id: input.evaluatedByUserId,
      member_sample_id: input.memberSampleId,
      notary_sample_id: input.notarySampleId,
      evaluation_kind: "same_place",
      status: input.status,
      threshold_meters: input.thresholdMeters,
      observed_distance_meters: input.observedDistanceMeters,
      evaluated_at: input.evaluatedAt,
      notes: input.notes,
      metadata: input.metadata,
      created_at: input.evaluatedAt,
      updated_at: input.evaluatedAt,
    }));
    mocks.updateMeetingMock.mockResolvedValue({
      id: "meeting-4",
      request_id: "req-4",
      workflow_id: "workflow-4",
      scheduled_at: "2026-05-27T15:00:00.000Z",
      timezone: null,
      location: null,
      status: "in_progress",
      same_place_required: true,
      same_place_status: "failed",
      evidence_retention_until: null,
      metadata: {},
      created_at: "2026-05-27T15:00:00.000Z",
      updated_at: "2026-05-27T15:05:00.000Z",
    });

    const response = await postProximityEvaluation({
      evaluatedAt: "2026-05-27T15:05:00.000Z",
      thresholdMeters: 100,
    });

    expect(response.status).toBe(201);
    expect(response.body.evaluation.status).toBe("failed");
    expect(response.body.evaluation.observedDistanceMeters).toBeGreaterThan(100);
    expect(mocks.updateMeetingMock).toHaveBeenCalledWith(
      "meeting-4",
      expect.objectContaining({ same_place_status: "failed" }),
    );
  });
});
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
  recordAuditEventMock: vi.fn(),
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
  };
});

vi.mock("../../src/services/auditService", () => ({
  recordAuditEvent: mocks.recordAuditEventMock,
}));

import { app } from "../../src/index";

type TokenPayload = {
  sub: string;
  app_metadata?: { role?: string };
};

const signToken = (payload: TokenPayload) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
};

describe("Phase 5 meeting runtime slice", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    Object.values(mocks).forEach((mock) => mock.mockReset());
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
});
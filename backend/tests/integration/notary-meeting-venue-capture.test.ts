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
  listMeetingParticipantsMock: vi.fn(),
  createMeetingParticipantMock: vi.fn(),
  updateMeetingParticipantMock: vi.fn(),
  createMeetingArtifactMock: vi.fn(),
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
  const actual = await importOriginal<typeof import("../../src/services/illuminotarizationWorkflowService")>();
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
    listMeetingParticipants: mocks.listMeetingParticipantsMock,
    createMeetingParticipant: mocks.createMeetingParticipantMock,
    updateMeetingParticipant: mocks.updateMeetingParticipantMock,
    createMeetingArtifact: mocks.createMeetingArtifactMock,
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

const baseRequest = {
  id: "req-venue-1",
  document_id: "doc-venue-1",
  workflow_id: "workflow-venue-1",
  assigned_notary_id: "notary-user-1",
  status: "in_review",
  submitted_at: "2026-06-17T10:00:00.000Z",
  created_at: "2026-06-17T10:00:00.000Z",
};

const baseDocument = {
  id: "doc-venue-1",
  owner_id: "owner-user-1",
  idn: "IDN-VENUE-1",
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
  created_at: "2026-06-17T09:00:00.000Z",
  updated_at: "2026-06-17T09:00:00.000Z",
};

const baseWorkflow = {
  id: "workflow-venue-1",
  owner_user_id: "owner-user-1",
  created_by_user_id: "owner-user-1",
  primary_document_id: "doc-venue-1",
  workflow_kind: "single_document",
  status: "approved",
  selected_notary_user_id: null,
  assigned_notary_user_id: "notary-user-1",
  current_legacy_request_id: "req-venue-1",
  submitted_at: "2026-06-17T10:00:00.000Z",
  last_code_generated_at: null,
  review_started_at: "2026-06-17T10:05:00.000Z",
  closed_at: null,
  context_json: {},
  metadata: {},
  created_at: "2026-06-17T10:00:00.000Z",
  updated_at: "2026-06-17T10:05:00.000Z",
};

const baseMeeting = {
  id: "meeting-venue-1",
  request_id: "req-venue-1",
  workflow_id: "workflow-venue-1",
  scheduled_at: "2026-06-17T11:00:00.000Z",
  timezone: "America/New_York",
  location: "Office",
  status: "in_progress",
  same_place_required: true,
  same_place_status: "passed",
  evidence_retention_until: null,
  metadata: {},
  created_at: "2026-06-17T11:00:00.000Z",
  updated_at: "2026-06-17T11:00:00.000Z",
};

const baseParticipants = [
  {
    id: "participant-member-1",
    meeting_id: "meeting-venue-1",
    user_id: "owner-user-1",
    document_party_id: null,
    participant_role: "member",
    status: "checked_in",
    presence_required: true,
    participant_label: null,
    arrived_at: "2026-06-17T11:00:00.000Z",
    departed_at: null,
    metadata: {},
    created_at: "2026-06-17T11:00:00.000Z",
    updated_at: "2026-06-17T11:00:00.000Z",
  },
  {
    id: "participant-notary-1",
    meeting_id: "meeting-venue-1",
    user_id: "notary-user-1",
    document_party_id: null,
    participant_role: "notary",
    status: "checked_in",
    presence_required: true,
    participant_label: null,
    arrived_at: "2026-06-17T11:00:00.000Z",
    departed_at: null,
    metadata: {},
    created_at: "2026-06-17T11:00:00.000Z",
    updated_at: "2026-06-17T11:00:00.000Z",
  },
];

const postVenueCapture = (tokenSub: string, body: Record<string, unknown>) =>
  request(app)
    .post("/notary/requests/req-venue-1/meeting/venue-capture")
    .set(
      "Authorization",
      `Bearer ${signToken({ sub: tokenSub, app_metadata: { role: "notary" } })}`,
    )
    .send(body);

describe("POST /notary/requests/:id/meeting/venue-capture", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it("records venue capture as a dedicated artifact", async () => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
      id: "notary-user-1",
      supabaseUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "notary@example.com",
      role: "notary",
      status: "active",
      firstName: "Nora",
      lastName: "Tary",
      availableRoles: ["notary"],
      roleAssignments: [],
    });
    mocks.getNotarizationRequestByIdMock.mockResolvedValue(baseRequest);
    mocks.getDocumentByIdMock.mockResolvedValue(baseDocument);
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue(baseWorkflow);
    mocks.getMeetingByRequestIdMock.mockResolvedValue(baseMeeting);
    mocks.listMeetingParticipantsMock.mockResolvedValue(baseParticipants);
    mocks.createMeetingArtifactMock.mockResolvedValue({
      id: "artifact-venue-1",
      meeting_id: "meeting-venue-1",
      meeting_participant_id: "participant-notary-1",
      meeting_checkin_id: null,
      identity_verification_event_id: null,
      uploaded_by_user_id: "notary-user-1",
      artifact_kind: "venue_capture",
      storage_bucket: null,
      storage_path: null,
      mime_type: null,
      size_bytes: null,
      status: "active",
      captured_at: "2026-06-17T12:00:00.000Z",
      retention_until: null,
      metadata: {
        requestId: "req-venue-1",
        evidenceKind: "venue_capture_v1",
        captureSource: "manual_capture",
        venue: {
          state: "Ohio",
          county: "Cuyahoga",
          city: "Cleveland",
          completedAt: "2026-06-17T12:00:00.000Z",
        },
      },
      created_at: "2026-06-17T12:00:00.000Z",
      updated_at: "2026-06-17T12:00:00.000Z",
    });

    const response = await postVenueCapture("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
      participantRole: "notary",
      capturedAt: "2026-06-17T12:00:00.000Z",
      venue: {
        state: "Ohio",
        county: "Cuyahoga",
        city: "Cleveland",
      },
      notes: "Captured before seal",
    });

    expect(response.status).toBe(201);
    expect(response.body.venueCapture.artifactKind).toBe("venue_capture");
    expect(mocks.createMeetingArtifactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingId: "meeting-venue-1",
        meetingParticipantId: "participant-notary-1",
        artifactKind: "venue_capture",
        metadata: expect.objectContaining({
          requestId: "req-venue-1",
          evidenceKind: "venue_capture_v1",
          captureSource: "manual_capture",
          venue: expect.objectContaining({
            state: "Ohio",
            county: "Cuyahoga",
          }),
        }),
      }),
    );
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "notary.venue_captured",
        entityId: "req-venue-1",
      }),
    );
  });

  it("returns forbidden when actor is not assigned to the request", async () => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
      id: "different-notary",
      supabaseUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      email: "other-notary@example.com",
      role: "notary",
      status: "active",
      firstName: "Other",
      lastName: "Notary",
      availableRoles: ["notary"],
      roleAssignments: [],
    });
    mocks.getNotarizationRequestByIdMock.mockResolvedValue(baseRequest);
    mocks.getDocumentByIdMock.mockResolvedValue(baseDocument);
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue(baseWorkflow);
    mocks.getMeetingByRequestIdMock.mockResolvedValue(baseMeeting);

    const response = await postVenueCapture("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
      venue: {
        state: "Ohio",
        county: "Cuyahoga",
      },
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Venue capture is not allowed for this request");
    expect(mocks.createMeetingArtifactMock).not.toHaveBeenCalled();
  });

  it("validates required venue fields", async () => {
    const response = await postVenueCapture("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
      venue: {
        state: "Ohio",
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
  });
});

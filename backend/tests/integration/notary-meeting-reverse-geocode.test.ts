import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
  getNotarizationRequestByIdMock: vi.fn(),
  getDocumentByIdMock: vi.fn(),
  getIlluminotarizationWorkflowByIdMock: vi.fn(),
  getIlluminotarizationWorkflowByLegacyRequestIdMock: vi.fn(),
  fetchMock: vi.fn(),
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

const postReverseGeocode = (tokenSub: string, body: Record<string, unknown>) =>
  request(app)
    .post("/notary/requests/req-venue-1/meeting/reverse-geocode")
    .set(
      "Authorization",
      `Bearer ${signToken({ sub: tokenSub, app_metadata: { role: "notary" } })}`,
    )
    .send(body);

describe("POST /notary/requests/:id/meeting/reverse-geocode", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "test-google-server-key";
    process.env.GOOGLE_MAPS_GEOCODE_USE_SERVER = "true";

    Object.values(mocks).forEach((mock) => mock.mockReset());

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

    vi.stubGlobal("fetch", mocks.fetchMock);
  });

  it("returns normalized venue fields from server-side geocode", async () => {
    mocks.fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [
          {
            formatted_address: "200 Public Square, Cleveland, OH 44114, USA",
            address_components: [
              { long_name: "200", types: ["street_number"] },
              { long_name: "Public Square", types: ["route"] },
              { long_name: "Cleveland", types: ["locality"] },
              { long_name: "Cuyahoga County", types: ["administrative_area_level_2"] },
              { long_name: "Ohio", short_name: "OH", types: ["administrative_area_level_1"] },
            ],
          },
        ],
      }),
    });

    const response = await postReverseGeocode("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
      latitude: 41.4993,
      longitude: -81.6944,
    });

    expect(response.status).toBe(200);
    expect(response.body.venue).toEqual(
      expect.objectContaining({
        state: "Ohio",
        county: "Cuyahoga",
        city: "Cleveland",
        addressLine1: "200 Public Square",
      }),
    );
    expect(response.body.formattedAddress).toBe("200 Public Square, Cleveland, OH 44114, USA");
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);
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

    const response = await postReverseGeocode("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
      latitude: 41.4993,
      longitude: -81.6944,
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Reverse geocoding is not allowed for this request");
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it("returns service unavailable when server geocoding is disabled", async () => {
    process.env.GOOGLE_MAPS_GEOCODE_USE_SERVER = "false";

    const response = await postReverseGeocode("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
      latitude: 41.4993,
      longitude: -81.6944,
    });

    expect(response.status).toBe(503);
    expect(response.body.message).toBe("Geocoding service is disabled");
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it("returns invalid_request when provider has no results", async () => {
    mocks.fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ZERO_RESULTS",
        results: [],
      }),
    });

    const response = await postReverseGeocode("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
      latitude: 41.4993,
      longitude: -81.6944,
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("No geocoding results for the provided location");
  });

  it("returns service_unavailable when provider denies request", async () => {
    mocks.fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "REQUEST_DENIED",
        results: [],
      }),
    });

    const response = await postReverseGeocode("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
      latitude: 41.4993,
      longitude: -81.6944,
    });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe("service_unavailable");
  });

  it("returns service_unavailable when provider quota is exceeded", async () => {
    mocks.fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OVER_QUERY_LIMIT",
        results: [],
      }),
    });

    const response = await postReverseGeocode("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
      latitude: 41.4993,
      longitude: -81.6944,
    });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe("service_unavailable");
  });
});

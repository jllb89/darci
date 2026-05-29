import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  singleMock: vi.fn(),
  insertMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: mocks.fromMock,
  })),
}));

vi.mock("../../src/services/userRoleService", () => ({
  getUserIdentityContextBySupabaseId: mocks.getUserIdentityContextBySupabaseIdMock,
  getUserIdentityContextByUserId: vi.fn(),
  upsertUserRoleAssignmentBySupabaseUserId: vi.fn(),
}));

import {
  NotaryProfileServiceError,
  submitNotaryApplication,
} from "../../src/services/notaryProfileService";

const buildNotaryApplicationRow = (overrides: Record<string, unknown> = {}) => ({
  id: "application-1",
  user_id: "user-1",
  jurisdiction: "US-OH",
  service_area_kind: "county",
  service_area_name: "Franklin",
  signature_data_url: null,
  seal_data_url: null,
  status: "pending",
  review_notes: null,
  reviewed_by_user_id: null,
  reviewed_at: null,
  created_at: "2026-05-29T00:00:00.000Z",
  updated_at: "2026-05-29T00:00:00.000Z",
  ...overrides,
});

const buildQuery = () => {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => mocks.maybeSingleMock()),
    insert: vi.fn((payload: unknown) => {
      mocks.insertMock(payload);
      return query;
    }),
    single: vi.fn(() => mocks.singleMock()),
  };

  return query;
};

describe("notaryProfileService", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "http://localhost";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    mocks.fromMock.mockReset();
    mocks.getUserIdentityContextBySupabaseIdMock.mockReset();
    mocks.maybeSingleMock.mockReset();
    mocks.singleMock.mockReset();
    mocks.insertMock.mockReset();
    mocks.fromMock.mockImplementation(() => buildQuery());
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
      id: "user-1",
      supabaseUserId: "supabase-user-1",
      email: "member@example.com",
      role: "member",
      status: "active",
      firstName: "Member",
      lastName: "User",
      availableRoles: ["member"],
      roleAssignments: [],
    });
  });

  it("submits a notary application through Supabase without direct database access", async () => {
    mocks.maybeSingleMock.mockResolvedValue({ data: null, error: null });
    mocks.singleMock.mockResolvedValue({
      data: buildNotaryApplicationRow(),
      error: null,
    });

    const application = await submitNotaryApplication({
      supabaseUserId: "supabase-user-1",
      jurisdiction: "US-OH",
      serviceAreaKind: "county",
      serviceAreaName: "Franklin",
    });

    expect(application).toMatchObject({
      id: "application-1",
      userId: "user-1",
      jurisdiction: "US-OH",
      serviceAreaKind: "county",
      serviceAreaName: "Franklin",
      status: "pending",
    });
    expect(mocks.fromMock).toHaveBeenCalledWith("notary_profile_applications");
    expect(mocks.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        jurisdiction: "US-OH",
        service_area_kind: "county",
        service_area_name: "Franklin",
        status: "pending",
      }),
    );
  });

  it("rejects a duplicate application found through Supabase", async () => {
    mocks.maybeSingleMock.mockResolvedValue({
      data: buildNotaryApplicationRow(),
      error: null,
    });

    await expect(
      submitNotaryApplication({
        supabaseUserId: "supabase-user-1",
        jurisdiction: "US-OH",
        serviceAreaKind: "county",
        serviceAreaName: "Franklin",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "A notary application has already been submitted for this account.",
    } satisfies Partial<NotaryProfileServiceError>);

    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  it("maps database unique violations to duplicate application conflicts", async () => {
    mocks.maybeSingleMock.mockResolvedValue({ data: null, error: null });
    mocks.singleMock.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    await expect(
      submitNotaryApplication({
        supabaseUserId: "supabase-user-1",
        jurisdiction: "US-OH",
        serviceAreaKind: "county",
        serviceAreaName: "Franklin",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "A notary application has already been submitted for this account.",
    } satisfies Partial<NotaryProfileServiceError>);
  });
});
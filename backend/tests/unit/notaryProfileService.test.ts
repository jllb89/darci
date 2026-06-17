import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
  getUserIdentityContextByUserIdMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  singleMock: vi.fn(),
  insertMock: vi.fn(),
  upsertMock: vi.fn(),
  selectResultMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: mocks.fromMock,
  })),
}));

vi.mock("../../src/services/userRoleService", () => ({
  getUserIdentityContextBySupabaseId: mocks.getUserIdentityContextBySupabaseIdMock,
  getUserIdentityContextByUserId: mocks.getUserIdentityContextByUserIdMock,
  upsertUserRoleAssignmentBySupabaseUserId: vi.fn(),
}));

import {
  listAvailableNotariesByJurisdiction,
  NotaryProfileServiceError,
  submitNotaryApplication,
  upsertMyNotaryProfile,
} from "../../src/services/notaryProfileService";

const buildNotaryApplicationRow = (overrides: Record<string, unknown> = {}) => ({
  id: "application-1",
  user_id: "user-1",
  jurisdiction: "US-OH",
  service_area_kind: "county",
  service_area_name: "Franklin",
  commission_number: "OH-12345",
  commission_expires_at: "2028-01-01T00:00:00.000Z",
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

const buildNotaryProfileRow = (overrides: Record<string, unknown> = {}) => ({
  id: "profile-1",
  user_id: "user-1",
  jurisdiction: "US-OH",
  service_area_kind: "county",
  service_area_name: "Franklin",
  commission_number: "OH-12345",
  commission_expires_at: "2028-01-01T00:00:00.000Z",
  seal_storage_path: null,
  signature_data_url: null,
  seal_data_url: null,
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
    upsert: vi.fn((payload: unknown, options?: unknown) => {
      mocks.upsertMock(payload, options);
      return query;
    }),
    single: vi.fn(() => mocks.singleMock()),
    then: vi.fn((resolve, reject) => Promise.resolve(mocks.selectResultMock()).then(resolve, reject)),
  };

  return query;
};

describe("notaryProfileService", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "http://localhost";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    mocks.fromMock.mockReset();
    mocks.getUserIdentityContextBySupabaseIdMock.mockReset();
    mocks.getUserIdentityContextByUserIdMock.mockReset();
    mocks.maybeSingleMock.mockReset();
    mocks.singleMock.mockReset();
    mocks.insertMock.mockReset();
    mocks.upsertMock.mockReset();
    mocks.selectResultMock.mockReset();
    mocks.fromMock.mockImplementation(() => buildQuery());
    mocks.selectResultMock.mockResolvedValue({ data: [], error: null });
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
    mocks.getUserIdentityContextByUserIdMock.mockResolvedValue(null);
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
      commissionNumber: "OH-12345",
      commissionExpiresAt: "2028-01-01T00:00:00.000Z",
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
        commission_number: "OH-12345",
        commission_expires_at: "2028-01-01T00:00:00.000Z",
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
        commissionNumber: "OH-12345",
        commissionExpiresAt: "2028-01-01T00:00:00.000Z",
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
        commissionNumber: "OH-12345",
        commissionExpiresAt: "2028-01-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "A notary application has already been submitted for this account.",
    } satisfies Partial<NotaryProfileServiceError>);
  });

  it("rejects a notary application with an expired commission", async () => {
    await expect(
      submitNotaryApplication({
        supabaseUserId: "supabase-user-1",
        jurisdiction: "US-OH",
        serviceAreaKind: "county",
        serviceAreaName: "Franklin",
        commissionNumber: "OH-12345",
        commissionExpiresAt: "2025-01-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Notary commission expiration must be current.",
    } satisfies Partial<NotaryProfileServiceError>);

    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported notary application signature images before insert", async () => {
    await expect(
      submitNotaryApplication({
        supabaseUserId: "supabase-user-1",
        jurisdiction: "US-OH",
        serviceAreaKind: "county",
        serviceAreaName: "Franklin",
        commissionNumber: "OH-12345",
        commissionExpiresAt: "2028-01-01T00:00:00.000Z",
        signatureDataUrl: "data:image/webp;base64,signature",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Notary signature image must be a PNG or JPEG data URL.",
    } satisfies Partial<NotaryProfileServiceError>);

    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  it("updates a notary profile by the unique user id", async () => {
    mocks.singleMock.mockResolvedValue({
      data: buildNotaryProfileRow(),
      error: null,
    });

    const profile = await upsertMyNotaryProfile({
      supabaseUserId: "supabase-user-1",
      jurisdiction: "US-OH",
      serviceAreaKind: "county",
      serviceAreaName: "Franklin",
      commissionNumber: "OH-12345",
      commissionExpiresAt: "2028-01-01T00:00:00.000Z",
      signatureDataUrl: "data:image/png;base64,signature",
      sealDataUrl: "data:image/jpeg;base64,seal",
    });

    expect(profile).toMatchObject({
      id: "profile-1",
      userId: "user-1",
      jurisdiction: "US-OH",
    });
    expect(mocks.fromMock).toHaveBeenCalledWith("notary_profiles");
    expect(mocks.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        jurisdiction: "US-OH",
        service_area_kind: "county",
        service_area_name: "Franklin",
        commission_number: "OH-12345",
        commission_expires_at: "2028-01-01T00:00:00.000Z",
        signature_data_url: "data:image/png;base64,signature",
        seal_data_url: "data:image/jpeg;base64,seal",
      }),
      { onConflict: "user_id" },
    );
  });

  it("rejects unsupported notary profile seal images before upsert", async () => {
    await expect(
      upsertMyNotaryProfile({
        supabaseUserId: "supabase-user-1",
        jurisdiction: "US-OH",
        serviceAreaKind: "county",
        serviceAreaName: "Franklin",
        commissionNumber: "OH-12345",
        commissionExpiresAt: "2028-01-01T00:00:00.000Z",
        sealDataUrl: "data:image/webp;base64,seal",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Notary seal image must be a PNG or JPEG data URL.",
    } satisfies Partial<NotaryProfileServiceError>);

    expect(mocks.upsertMock).not.toHaveBeenCalled();
  });

  it("lists only active same-jurisdiction notaries that are not the owner and not expired", async () => {
    mocks.selectResultMock.mockResolvedValue({
      data: [
        buildNotaryApplicationRow({
          id: "profile-active",
          user_id: "notary-active",
          commission_number: null,
          commission_expires_at: "2027-01-01T00:00:00.000Z",
          seal_storage_path: null,
        }),
        buildNotaryApplicationRow({
          id: "profile-wrong-jurisdiction",
          user_id: "notary-ca",
          jurisdiction: "US-CA",
          commission_number: null,
          commission_expires_at: "2027-01-01T00:00:00.000Z",
          seal_storage_path: null,
        }),
        buildNotaryApplicationRow({
          id: "profile-owner",
          user_id: "owner-1",
          commission_number: null,
          commission_expires_at: "2027-01-01T00:00:00.000Z",
          seal_storage_path: null,
        }),
        buildNotaryApplicationRow({
          id: "profile-expired",
          user_id: "notary-expired",
          commission_number: null,
          commission_expires_at: "2025-01-01T00:00:00.000Z",
          seal_storage_path: null,
        }),
        buildNotaryApplicationRow({
          id: "profile-missing-expiration",
          user_id: "notary-missing-expiration",
          commission_number: "OH-99999",
          commission_expires_at: null,
          seal_storage_path: null,
        }),
        buildNotaryApplicationRow({
          id: "profile-inactive",
          user_id: "notary-inactive",
          commission_number: null,
          commission_expires_at: "2027-01-01T00:00:00.000Z",
          seal_storage_path: null,
        }),
      ],
      error: null,
    });
    mocks.getUserIdentityContextByUserIdMock.mockImplementation(async (userId: string) => ({
      id: userId,
      supabaseUserId: `${userId}-supabase`,
      email: `${userId}@example.com`,
      phone: null,
      role: userId === "notary-inactive" ? "member" : "notary",
      status: "active",
      firstName: userId === "notary-active" ? "Nora" : "Other",
      lastName: userId === "notary-active" ? "Tary" : "Notary",
      emailConfirmedAt: null,
      phoneConfirmedAt: null,
      lastSignInAt: null,
      lastAuthSyncedAt: null,
      availableRoles: userId === "notary-inactive" ? ["member"] : ["notary"],
      roleAssignments: userId === "notary-inactive" ? [] : [{
        id: `${userId}-role`,
        role: "notary",
        status: "active",
        isActiveProfile: true,
        grantedReason: null,
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:00.000Z",
      }],
    }));

    const notaries = await listAvailableNotariesByJurisdiction({
      jurisdiction: "OH",
      excludeUserId: "owner-1",
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(notaries).toEqual([
      {
        userId: "notary-active",
        displayName: "Nora Tary",
        jurisdiction: "US-OH",
        serviceAreaKind: "county",
        serviceAreaName: "Franklin",
        commissionExpiresAt: "2027-01-01T00:00:00.000Z",
      },
    ]);
  });
});
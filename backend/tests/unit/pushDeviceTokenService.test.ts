import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  upsertMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  singleMock: vi.fn(),
  awaitQueryMock: vi.fn(),
  eqMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: mocks.fromMock,
  })),
}));

import {
  deactivatePushDeviceInstallation,
  registerPushDeviceToken,
  updatePushDevicePermission,
} from "../../src/services/pushDeviceTokenService";

const row = {
  id: "device-1",
  user_id: "user-1",
  installation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  platform: "ios",
  provider: "apns",
  environment: "sandbox",
  app_bundle_id: "com.illuminote.darci",
  device_token: "a".repeat(64),
  permission_status: "authorized",
  app_version: "1.0.0",
  build_number: "42",
  device_model: "iPhone16,1",
  os_version: "18.2",
  is_active: true,
  last_registered_at: "2026-08-10T12:00:00.000Z",
  last_seen_at: "2026-08-10T12:00:00.000Z",
  invalidated_at: null,
  created_at: "2026-08-10T12:00:00.000Z",
  updated_at: "2026-08-10T12:00:00.000Z",
};

const buildQuery = (table: string) => {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      mocks.eqMock(table, column, value);
      return query;
    }),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => mocks.maybeSingleMock(table)),
    single: vi.fn(() => mocks.singleMock(table)),
    upsert: vi.fn((payload: unknown, options: unknown) => {
      mocks.upsertMock(table, payload, options);
      return query;
    }),
    insert: vi.fn((payload: unknown) => {
      mocks.insertMock(table, payload);
      return query;
    }),
    update: vi.fn((payload: unknown) => {
      mocks.updateMock(table, payload);
      return query;
    }),
    then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
      Promise.resolve(mocks.awaitQueryMock(table)).then(resolve, reject),
  };

  return query;
};

describe("pushDeviceTokenService", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "http://localhost";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    mocks.fromMock.mockReset();
    mocks.upsertMock.mockReset();
    mocks.insertMock.mockReset();
    mocks.updateMock.mockReset();
    mocks.maybeSingleMock.mockReset();
    mocks.singleMock.mockReset();
    mocks.awaitQueryMock.mockReset();
    mocks.eqMock.mockReset();
    mocks.fromMock.mockImplementation((table: string) => buildQuery(table));
    mocks.singleMock.mockResolvedValue({ data: row, error: null });
    mocks.maybeSingleMock.mockResolvedValue({ data: row, error: null });
    mocks.awaitQueryMock.mockResolvedValue({ data: [row], error: null });
  });

  it("upserts registration by authenticated user installation and redacts the token", async () => {
    const result = await registerPushDeviceToken({
      userId: "user-1",
      installationId: row.installation_id,
      environment: "sandbox",
      appBundleId: "com.illuminote.darci",
      deviceToken: row.device_token,
      permissionStatus: "authorized",
      appVersion: "1.0.0",
      buildNumber: "42",
      deviceModel: "iPhone16,1",
      osVersion: "18.2",
    });

    expect(mocks.upsertMock).toHaveBeenCalledWith(
      "device_push_tokens",
      expect.objectContaining({
        user_id: "user-1",
        installation_id: row.installation_id,
        environment: "sandbox",
        device_token: row.device_token,
        is_active: true,
      }),
      { onConflict: "user_id,installation_id,environment" },
    );
    expect(result).not.toHaveProperty("deviceToken");
    expect(JSON.stringify(result)).not.toContain(row.device_token);
  });

  it("preserves an existing active token when permission returns to authorized", async () => {
    await updatePushDevicePermission({
      userId: "user-1",
      installationId: row.installation_id,
      environment: "sandbox",
      appBundleId: "com.illuminote.darci",
      permissionStatus: "authorized",
    });

    expect(mocks.eqMock).toHaveBeenCalledWith("device_push_tokens", "user_id", "user-1");
    expect(mocks.updateMock).toHaveBeenCalledWith(
      "device_push_tokens",
      expect.objectContaining({
        permission_status: "authorized",
        is_active: true,
        invalidated_at: null,
      }),
    );
  });

  it("deactivates only rows matching user and installation", async () => {
    const result = await deactivatePushDeviceInstallation({
      userId: "user-1",
      installationId: row.installation_id,
    });

    expect(mocks.updateMock).toHaveBeenCalledWith(
      "device_push_tokens",
      expect.objectContaining({ is_active: false }),
    );
    expect(mocks.eqMock).toHaveBeenCalledWith("device_push_tokens", "user_id", "user-1");
    expect(mocks.eqMock).toHaveBeenCalledWith(
      "device_push_tokens",
      "installation_id",
      row.installation_id,
    );
    expect(result).toEqual({ deactivated: true });
  });
});
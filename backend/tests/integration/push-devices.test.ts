import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "http://localhost";
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";
  process.env.SUPABASE_JWT_SECRET = "test-secret";
  process.env.APNS_BUNDLE_ID = "com.illuminote.darci";
});

const mocks = vi.hoisted(() => ({
  registerPushDeviceTokenMock: vi.fn(),
  updatePushDevicePermissionMock: vi.fn(),
  deactivatePushDeviceInstallationMock: vi.fn(),
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
}));

vi.mock("../../src/services/pushDeviceTokenService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/pushDeviceTokenService")>(
    "../../src/services/pushDeviceTokenService",
  );

  return {
    ...actual,
    registerPushDeviceToken: mocks.registerPushDeviceTokenMock,
    updatePushDevicePermission: mocks.updatePushDevicePermissionMock,
    deactivatePushDeviceInstallation: mocks.deactivatePushDeviceInstallationMock,
  };
});

vi.mock("../../src/services/userRoleService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/userRoleService")>(
    "../../src/services/userRoleService",
  );

  return {
    ...actual,
    getUserIdentityContextBySupabaseId: mocks.getUserIdentityContextBySupabaseIdMock,
  };
});

import { app } from "../../src/index";

const installationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const token = "a".repeat(64);

const signToken = (payload: { sub: string; app_metadata?: { role?: string } }) => jwt.sign(
  payload,
  process.env.SUPABASE_JWT_SECRET ?? "test-secret",
  { expiresIn: "1h" },
);

const memberAuthorization = () => `Bearer ${signToken({
  sub: "member-1",
  app_metadata: { role: "member" },
})}`;

const deviceResponse = {
  id: "device-1",
  installationId,
  platform: "ios",
  provider: "apns",
  environment: "sandbox",
  appBundleId: "com.illuminote.darci",
  permissionStatus: "authorized",
  appVersion: "1.0.0",
  buildNumber: "42",
  deviceModel: "iPhone16,1",
  osVersion: "18.2",
  isActive: true,
  lastRegisteredAt: "2026-08-10T12:00:00.000Z",
  lastSeenAt: "2026-08-10T12:00:00.000Z",
  invalidatedAt: null,
  createdAt: "2026-08-10T12:00:00.000Z",
  updatedAt: "2026-08-10T12:00:00.000Z",
};

describe("push notification device routes", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.registerPushDeviceTokenMock.mockReset();
    mocks.updatePushDevicePermissionMock.mockReset();
    mocks.deactivatePushDeviceInstallationMock.mockReset();
    mocks.getUserIdentityContextBySupabaseIdMock.mockReset();
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
      id: "member-db-1",
      supabaseUserId: "member-1",
      email: "member@example.com",
      role: "member",
      status: "active",
      firstName: "Mae",
      lastName: "Member",
      availableRoles: ["member"],
      roleAssignments: [],
    });
  });

  it("requires authentication", async () => {
    const response = await request(app)
      .put(`/notifications/devices/${installationId}`)
      .send({ environment: "sandbox", deviceToken: token });

    expect(response.status).toBe(401);
    expect(mocks.registerPushDeviceTokenMock).not.toHaveBeenCalled();
  });

  it("registers an APNs device token for the authenticated DARCi user", async () => {
    mocks.registerPushDeviceTokenMock.mockResolvedValue(deviceResponse);

    const response = await request(app)
      .put(`/notifications/devices/${installationId}`)
      .set("Authorization", memberAuthorization())
      .send({
        environment: "sandbox",
        deviceToken: token,
        permissionStatus: "authorized",
        appBundleId: "com.illuminote.darci",
        appVersion: "1.0.0",
        buildNumber: "42",
        deviceModel: "iPhone16,1",
        osVersion: "18.2",
      });

    expect(response.status).toBe(200);
    expect(response.body.device).toEqual(deviceResponse);
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(mocks.registerPushDeviceTokenMock).toHaveBeenCalledWith({
      userId: "member-db-1",
      installationId,
      environment: "sandbox",
      appBundleId: "com.illuminote.darci",
      deviceToken: token,
      permissionStatus: "authorized",
      appVersion: "1.0.0",
      buildNumber: "42",
      deviceModel: "iPhone16,1",
      osVersion: "18.2",
    });
  });

  it("rejects caller-supplied ownership fields", async () => {
    const response = await request(app)
      .put(`/notifications/devices/${installationId}`)
      .set("Authorization", memberAuthorization())
      .send({
        environment: "sandbox",
        deviceToken: token,
        userId: "other-user",
      });

    expect(response.status).toBe(400);
    expect(mocks.registerPushDeviceTokenMock).not.toHaveBeenCalled();
  });

  it("records permission state without accepting a token", async () => {
    mocks.updatePushDevicePermissionMock.mockResolvedValue({
      ...deviceResponse,
      permissionStatus: "denied",
      isActive: false,
      invalidatedAt: "2026-08-10T12:02:00.000Z",
    });

    const response = await request(app)
      .patch(`/notifications/devices/${installationId}/permission`)
      .set("Authorization", memberAuthorization())
      .send({
        environment: "sandbox",
        permissionStatus: "denied",
      });

    expect(response.status).toBe(200);
    expect(mocks.updatePushDevicePermissionMock).toHaveBeenCalledWith({
      userId: "member-db-1",
      installationId,
      environment: "sandbox",
      appBundleId: "com.illuminote.darci",
      permissionStatus: "denied",
      appVersion: undefined,
      buildNumber: undefined,
    });
  });

  it("deactivates only the authenticated user's installation", async () => {
    mocks.deactivatePushDeviceInstallationMock.mockResolvedValue({ deactivated: true });

    const response = await request(app)
      .delete(`/notifications/devices/${installationId}`)
      .set("Authorization", memberAuthorization());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ deactivated: true });
    expect(mocks.deactivatePushDeviceInstallationMock).toHaveBeenCalledWith({
      userId: "member-db-1",
      installationId,
    });
  });

  it("rejects invalid APNs token values", async () => {
    const response = await request(app)
      .put(`/notifications/devices/${installationId}`)
      .set("Authorization", memberAuthorization())
      .send({ environment: "sandbox", deviceToken: "not-a-token" });

    expect(response.status).toBe(400);
    expect(mocks.registerPushDeviceTokenMock).not.toHaveBeenCalled();
  });
});
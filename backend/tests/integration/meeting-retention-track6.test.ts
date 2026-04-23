import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  if (!process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = "http://localhost";
  }

  if (!process.env.SUPABASE_ANON_KEY) {
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  }

  if (!process.env.SUPABASE_JWT_SECRET) {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
  }
});

const mocks = vi.hoisted(() => ({
  enforceMeetingArtifactRetentionMock: vi.fn(),
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
}));

vi.mock("../../src/services/meetingService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/meetingService")>(
    "../../src/services/meetingService",
  );

  return {
    ...actual,
    enforceMeetingArtifactRetention: mocks.enforceMeetingArtifactRetentionMock,
  };
});

vi.mock("../../src/services/userRoleService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/userRoleService")>(
    "../../src/services/userRoleService",
  );

  return {
    ...actual,
    getUserIdentityContextBySupabaseId:
      mocks.getUserIdentityContextBySupabaseIdMock,
  };
});

import { app } from "../../src/index";

const signToken = (payload: {
  sub: string;
  app_metadata?: { role?: string };
}) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
};

describe("Track 6 meeting retention endpoint", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.enforceMeetingArtifactRetentionMock.mockReset();
    mocks.getUserIdentityContextBySupabaseIdMock.mockReset();
  });

  it("runs meeting artifact retention enforcement with service role access", async () => {
    mocks.enforceMeetingArtifactRetentionMock.mockResolvedValue({
      scannedCount: 2,
      updatedCount: 2,
      artifacts: [
        {
          artifactId: "artifact-1",
          meetingId: "meeting-1",
          previousStatus: "active",
          nextStatus: "expired",
          retentionUntil: "2026-04-20T00:00:00.000Z",
          storageBucket: "meeting-evidence",
          storagePath: "meeting-1/artifact-1.png",
          redactedAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
        },
      ],
    });

    const response = await request(app)
      .post("/internal/meeting-artifacts/enforce-retention")
      .set(
        "Authorization",
        `Bearer ${signToken({ sub: "service-role-1", app_metadata: { role: "service_role" } })}`,
      )
      .send({ limit: 25 });

    expect(response.status).toBe(200);
    expect(response.body.updatedCount).toBe(2);
    expect(mocks.enforceMeetingArtifactRetentionMock).toHaveBeenCalledWith({
      limit: 25,
      workerUserId: "service-role-1",
    });
  });

  it("validates retention enforcement request payload", async () => {
    const response = await request(app)
      .post("/internal/meeting-artifacts/enforce-retention")
      .set(
        "Authorization",
        `Bearer ${signToken({ sub: "service-role-1", app_metadata: { role: "service_role" } })}`,
      )
      .send({ limit: 0 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
    expect(mocks.enforceMeetingArtifactRetentionMock).not.toHaveBeenCalled();
  });
});

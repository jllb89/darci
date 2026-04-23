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
  listDocumentInvitesMock: vi.fn(),
  createDocumentInviteMock: vi.fn(),
  resendDocumentInviteMock: vi.fn(),
  revokeDocumentInviteMock: vi.fn(),
  validateInviteTokenMock: vi.fn(),
  claimInviteTokenMock: vi.fn(),
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
}));

vi.mock("../../src/services/documentInviteService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/documentInviteService")>(
    "../../src/services/documentInviteService",
  );

  return {
    ...actual,
    listDocumentInvites: mocks.listDocumentInvitesMock,
    createDocumentInvite: mocks.createDocumentInviteMock,
    resendDocumentInvite: mocks.resendDocumentInviteMock,
    revokeDocumentInvite: mocks.revokeDocumentInviteMock,
  };
});

vi.mock("../../src/services/inviteClaimService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/inviteClaimService")>(
    "../../src/services/inviteClaimService",
  );

  return {
    ...actual,
    validateInviteToken: mocks.validateInviteTokenMock,
    claimInviteToken: mocks.claimInviteTokenMock,
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

describe("Track 5 invite routes", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.listDocumentInvitesMock.mockReset();
    mocks.createDocumentInviteMock.mockReset();
    mocks.resendDocumentInviteMock.mockReset();
    mocks.revokeDocumentInviteMock.mockReset();
    mocks.validateInviteTokenMock.mockReset();
    mocks.claimInviteTokenMock.mockReset();
    mocks.getUserIdentityContextBySupabaseIdMock.mockReset();
    mocks.getUserIdentityContextBySupabaseIdMock.mockImplementation(
      async (supabaseUserId: string) => {
        const identities = {
          "member-1": {
            id: "member-db-1",
            supabaseUserId,
            email: "member@example.com",
            role: "member",
            status: "active",
            firstName: "Mina",
            lastName: "Member",
            availableRoles: ["member"],
            roleAssignments: [],
          },
          "admin-1": {
            id: "admin-db-1",
            supabaseUserId,
            email: "admin@example.com",
            role: "admin",
            status: "active",
            firstName: "Ada",
            lastName: "Admin",
            availableRoles: ["admin"],
            roleAssignments: [],
          },
        } as const;

        return identities[supabaseUserId as keyof typeof identities] ?? null;
      },
    );
  });

  it("lists invites for a document owner", async () => {
    mocks.listDocumentInvitesMock.mockResolvedValue({
      invites: [],
      page: {
        limit: 10,
        offset: 0,
        total: 0,
      },
    });

    const response = await request(app)
      .get("/invites?documentId=doc-1&limit=10&offset=0")
      .set(
        "Authorization",
        `Bearer ${signToken({ sub: "member-1", app_metadata: { role: "member" } })}`,
      );

    expect(response.status).toBe(200);
    expect(mocks.listDocumentInvitesMock).toHaveBeenCalledWith({
      role: "member",
      viewerUserId: "member-db-1",
      documentId: "doc-1",
      documentOutputSignerId: null,
      status: null,
      limit: 10,
      offset: 0,
    });
  });

  it("creates invites for authenticated members", async () => {
    mocks.createDocumentInviteMock.mockResolvedValue({
      invite: { id: "invite-1" },
      access: {
        token: "raw-token",
        accessUrl: "http://localhost:3000/app/sign?inviteToken=raw-token",
        expiresAt: "2026-04-30T00:00:00.000Z",
      },
      notification: null,
      existing: false,
    });

    const response = await request(app)
      .post("/invites")
      .set(
        "Authorization",
        `Bearer ${signToken({ sub: "member-1", app_metadata: { role: "member" } })}`,
      )
      .send({
        documentId: "doc-1",
        documentOutputSignerId: "signer-1",
        recipientEmail: "signer@example.com",
        recipientName: "Sara Signer",
        claimMode: "required_signup",
      });

    expect(response.status).toBe(201);
    expect(mocks.createDocumentInviteMock).toHaveBeenCalledWith({
      role: "member",
      viewerUserId: "member-db-1",
      documentId: "doc-1",
      documentOutputSignerId: "signer-1",
      recipientEmail: "signer@example.com",
      recipientName: "Sara Signer",
      inviteLabel: null,
      claimMode: "required_signup",
      expiresAt: null,
      idempotencyKey: null,
    });
  });

  it("validates public invite tokens without authentication", async () => {
    mocks.validateInviteTokenMock.mockResolvedValue({
      id: "invite-1",
      token: {
        canClaim: true,
      },
    });

    const response = await request(app).get("/invites/public/public-token");

    expect(response.status).toBe(200);
    expect(response.body.invite.id).toBe("invite-1");
    expect(mocks.validateInviteTokenMock).toHaveBeenCalledWith({
      token: "public-token",
      viewerUserId: null,
    });
  });

  it("claims public invite tokens with optional authenticated context", async () => {
    mocks.claimInviteTokenMock.mockResolvedValue({
      invite: { id: "invite-1" },
      claim: { id: "claim-1" },
    });

    const response = await request(app)
      .post("/invites/public/public-token/claim")
      .set(
        "Authorization",
        `Bearer ${signToken({ sub: "member-1", app_metadata: { role: "member" } })}`,
      )
      .send({
        claimAddress: "member@example.com",
      });

    expect(response.status).toBe(200);
    expect(response.body.claim.id).toBe("claim-1");
    expect(mocks.claimInviteTokenMock).toHaveBeenCalledWith({
      token: "public-token",
      viewerUserId: "member-db-1",
      claimAddress: "member@example.com",
    });
  });
});
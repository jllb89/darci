import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDocumentByIdMock: vi.fn(),
  getUserIdBySupabaseIdMock: vi.fn(),
  listDocumentsMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", () => ({
  getDocumentById: mocks.getDocumentByIdMock,
  getUserIdBySupabaseId: mocks.getUserIdBySupabaseIdMock,
  listDocuments: mocks.listDocumentsMock,
}));

import { app } from "../../src/index";

type TokenPayload = {
  sub: string;
  email?: string;
  role?: string;
  app_metadata?: { role?: string };
};

const signToken = (payload: TokenPayload) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
};

describe("document IDN visibility", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.getDocumentByIdMock.mockReset();
    mocks.getUserIdBySupabaseIdMock.mockReset();
    mocks.listDocumentsMock.mockReset();
  });

  it("hides IDN in member document lists until post-sign stages", async () => {
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.listDocumentsMock.mockResolvedValue([
      {
        id: "doc-1",
        owner_id: "owner-1",
        idn: "AB12CD34EF56",
        status: "pending_review",
        document_type: "generic",
        jurisdiction: "US-OH",
        created_at: "2026-03-05T00:00:00.000Z",
      },
      {
        id: "doc-2",
        owner_id: "owner-1",
        idn: "CD34EF56GH78",
        status: "pending_signature",
        document_type: "generic",
        jurisdiction: "US-OH",
        created_at: "2026-03-05T00:01:00.000Z",
      },
      {
        id: "doc-3",
        owner_id: "owner-1",
        idn: "EF56GH78IJ90",
        status: "pending_notary",
        document_type: "generic",
        jurisdiction: "US-OH",
        created_at: "2026-03-05T00:02:00.000Z",
      },
    ]);

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .get("/documents")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.documents).toEqual([
      expect.objectContaining({ id: "doc-1", idn: null, status: "pending_review" }),
      expect.objectContaining({ id: "doc-2", idn: null, status: "pending_signature" }),
      expect.objectContaining({ id: "doc-3", idn: "EF56GH78IJ90", status: "pending_notary" }),
    ]);
  });

  it("hides IDN for members on a single document but keeps admin visibility", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "AB12CD34EF56",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");

    const memberToken = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });
    const adminToken = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const memberResponse = await request(app)
      .get("/documents/doc-1")
      .set("Authorization", `Bearer ${memberToken}`);
    const adminResponse = await request(app)
      .get("/documents/doc-1")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(memberResponse.status).toBe(200);
    expect(memberResponse.body.document.idn).toBeNull();
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.document.idn).toBe("AB12CD34EF56");
  });
});
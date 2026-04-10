import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listDocumentsMock: vi.fn(),
  getDocumentByIdMock: vi.fn(),
  listDocumentVersionsMock: vi.fn(),
  listDocumentPartiesMock: vi.fn(),
  replaceDocumentPartiesMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", () => ({
  listDocuments: mocks.listDocumentsMock,
  getDocumentById: mocks.getDocumentByIdMock,
  listDocumentVersions: mocks.listDocumentVersionsMock,
  listDocumentParties: mocks.listDocumentPartiesMock,
  replaceDocumentParties: mocks.replaceDocumentPartiesMock,
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

const logResponse = (label: string, response: request.Response) => {
  console.log(label, {
    status: response.status,
    body: response.body,
  });
};

const getWithLog = async (path: string, label: string, token?: string) => {
  console.log("request", { method: "GET", path });
  let req = request(app).get(path);
  if (token) {
    req = req.set("Authorization", `Bearer ${token}`);
  }
  const response = await req;
  logResponse(label, response);
  return response;
};

const putWithLog = async (
  path: string,
  payload: Record<string, unknown>,
  label: string,
  token?: string,
) => {
  console.log("request", { method: "PUT", path, payload });
  let req = request(app).put(path).send(payload);
  if (token) {
    req = req.set("Authorization", `Bearer ${token}`);
  }
  const response = await req;
  logResponse(label, response);
  return response;
};

describe("GET documents endpoints", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.listDocumentsMock.mockReset();
    mocks.getDocumentByIdMock.mockReset();
    mocks.listDocumentVersionsMock.mockReset();
    mocks.listDocumentPartiesMock.mockReset();
    mocks.replaceDocumentPartiesMock.mockReset();
  });

  it("lists documents for admin", async () => {
    mocks.listDocumentsMock.mockResolvedValue([
      {
        id: "doc-1",
        owner_id: "owner-1",
        idn: null,
        status: "draft",
        document_type: "generic",
        jurisdiction: "US-OH",
        created_at: "2026-03-05T00:00:00.000Z",
      },
      {
        id: "doc-2",
        owner_id: "owner-2",
        idn: "IDN-1234",
        status: "pending_signature",
        document_type: "generic",
        jurisdiction: "US-OH",
        created_at: "2026-03-05T00:01:00.000Z",
      },
    ]);

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await getWithLog(
      "/documents",
      "lists documents for admin",
      token
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      documents: [
        {
          id: "doc-1",
          idn: null,
          status: "draft",
          documentType: "generic",
          jurisdiction: "US-OH",
          createdAt: "2026-03-05T00:00:00.000Z",
        },
        {
          id: "doc-2",
          idn: "IDN-1234",
          status: "pending_signature",
          documentType: "generic",
          jurisdiction: "US-OH",
          createdAt: "2026-03-05T00:01:00.000Z",
        },
      ],
    });
  });

  it("gets a document by id for admin", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
    });

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await getWithLog(
      "/documents/doc-1",
      "gets a document by id for admin",
      token
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      document: {
        id: "doc-1",
        idn: "IDN-1234",
        status: "pending_signature",
        documentType: "generic",
        jurisdiction: "US-OH",
        createdAt: "2026-03-05T00:00:00.000Z",
      },
    });
  });

  it("lists document versions for admin", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
    });

    mocks.listDocumentVersionsMock.mockResolvedValue([
      {
        id: "ver-1",
        document_id: "doc-1",
        version: 1,
        storage_path: "owner-1/doc-1/v1/source.pdf",
        file_name: "source.pdf",
        mime_type: "application/pdf",
        size_bytes: 1234,
        is_final: false,
        created_by: "owner-1",
        created_at: "2026-03-05T00:00:30.000Z",
      },
    ]);

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await getWithLog(
      "/documents/doc-1/versions",
      "lists document versions for admin",
      token
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      versions: [
        {
          id: "ver-1",
          version: 1,
          storagePath: "owner-1/doc-1/v1/source.pdf",
          fileName: "source.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1234,
          isFinal: false,
          createdAt: "2026-03-05T00:00:30.000Z",
        },
      ],
    });
  });

  it("gets document parties for admin", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
    });

    mocks.listDocumentPartiesMock.mockResolvedValue([
      {
        id: "party-1",
        document_id: "doc-1",
        party_role: "principal",
        full_name: "Jordan Principal",
        email: "jordan@example.com",
        phone_country_code: "+1",
        phone: "555-111-2222",
        is_signing_party: false,
        sort_order: 0,
        metadata: { seeded: true },
        created_at: "2026-03-05T00:10:00.000Z",
        updated_at: "2026-03-05T00:10:00.000Z",
      },
    ]);

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await getWithLog(
      "/documents/doc-1/parties",
      "gets document parties for admin",
      token,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      parties: [
        {
          id: "party-1",
          partyRole: "principal",
          fullName: "Jordan Principal",
          email: "jordan@example.com",
          phoneCountryCode: "+1",
          phone: "555-111-2222",
          isSigningParty: false,
          sortOrder: 0,
          metadata: { seeded: true },
          createdAt: "2026-03-05T00:10:00.000Z",
          updatedAt: "2026-03-05T00:10:00.000Z",
        },
      ],
    });
  });

  it("replaces document parties for admin", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
    });

    mocks.replaceDocumentPartiesMock.mockResolvedValue([
      {
        id: "party-1",
        document_id: "doc-1",
        party_role: "principal",
        full_name: "Jordan Principal",
        email: "jordan@example.com",
        phone_country_code: "+1",
        phone: "(555) 111-2222",
        is_signing_party: false,
        sort_order: 0,
        metadata: {},
        created_at: "2026-03-05T00:10:00.000Z",
        updated_at: "2026-03-05T00:10:00.000Z",
      },
      {
        id: "party-2",
        document_id: "doc-1",
        party_role: "trustee",
        full_name: "Taylor Trustee",
        email: "taylor@example.com",
        phone_country_code: "+1",
        phone: "555-333-4444",
        is_signing_party: true,
        sort_order: 0,
        metadata: {},
        created_at: "2026-03-05T00:10:00.000Z",
        updated_at: "2026-03-05T00:10:00.000Z",
      },
    ]);

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await putWithLog(
      "/documents/doc-1/parties",
      {
        parties: [
          {
            partyRole: "principal",
            fullName: "Jordan Principal",
            email: "jordan@example.com",
            phoneCountryCode: "+1",
            phone: "(555) 111-2222",
            isSigningParty: false,
          },
          {
            partyRole: "trustee",
            fullName: "Taylor Trustee",
            email: "taylor@example.com",
            phoneCountryCode: "+1",
            phone: "555-333-4444",
            isSigningParty: true,
          },
        ],
      },
      "replaces document parties for admin",
      token,
    );

    expect(response.status).toBe(200);
    expect(mocks.replaceDocumentPartiesMock).toHaveBeenCalledWith({
      documentId: "doc-1",
      parties: [
        {
          party_role: "principal",
          full_name: "Jordan Principal",
          email: "jordan@example.com",
          phone_country_code: "+1",
          phone: "(555) 111-2222",
          is_signing_party: false,
          sort_order: 0,
          metadata: {},
        },
        {
          party_role: "trustee",
          full_name: "Taylor Trustee",
          email: "taylor@example.com",
          phone_country_code: "+1",
          phone: "555-333-4444",
          is_signing_party: true,
          sort_order: 0,
          metadata: {},
        },
      ],
    });
  });

  it("validates party contact formats on replace", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
    });

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await putWithLog(
      "/documents/doc-1/parties",
      {
        parties: [
          {
            partyRole: "principal",
            fullName: "Jordan Principal",
            email: "invalid-email",
          },
        ],
      },
      "validates party contact formats on replace",
      token,
    );

    expect(response.status).toBe(400);
    expect(mocks.replaceDocumentPartiesMock).not.toHaveBeenCalled();
  });
});

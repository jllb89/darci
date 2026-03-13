import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listDocumentsMock: vi.fn(),
  getDocumentByIdMock: vi.fn(),
  listDocumentVersionsMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", () => ({
  listDocuments: mocks.listDocumentsMock,
  getDocumentById: mocks.getDocumentByIdMock,
  listDocumentVersions: mocks.listDocumentVersionsMock,
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

describe("GET documents endpoints", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.listDocumentsMock.mockReset();
    mocks.getDocumentByIdMock.mockReset();
    mocks.listDocumentVersionsMock.mockReset();
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
});

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
  getOrCreateUserIdMock: vi.fn(),
  createDocumentWithVersionMock: vi.fn(),
  createDocumentUploadUrlMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  buildSelectionForModeMock: vi.fn(),
  resolveExpectedOutputsForModeMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", () => ({
  getOrCreateUserId: mocks.getOrCreateUserIdMock,
  createDocumentWithVersion: mocks.createDocumentWithVersionMock,
}));

vi.mock("../../src/services/storageService", () => ({
  createDocumentUploadUrl: mocks.createDocumentUploadUrlMock,
}));

vi.mock("../../src/services/auditService", () => ({
  recordAuditEvent: mocks.recordAuditEventMock,
}));

vi.mock("../../src/services/productFlowModeService", () => ({
  productFlowModeKeys: ["poa_only", "trust_bundle", "notarize_document"],
  buildSelectionForMode: mocks.buildSelectionForModeMock,
  resolveExpectedOutputsForMode: mocks.resolveExpectedOutputsForModeMock,
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

describe("POST /documents with product flow mode", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";

    mocks.getOrCreateUserIdMock.mockReset();
    mocks.createDocumentWithVersionMock.mockReset();
    mocks.createDocumentUploadUrlMock.mockReset();
    mocks.recordAuditEventMock.mockReset();
    mocks.buildSelectionForModeMock.mockReset();
    mocks.resolveExpectedOutputsForModeMock.mockReset();

    mocks.getOrCreateUserIdMock.mockResolvedValue("owner-1");
    mocks.buildSelectionForModeMock.mockResolvedValue({
      modeKey: "trust_bundle",
      families: ["poa", "trust"],
      poaType: "general",
      trustType: "rrr",
      idnType: "acknowledgment",
    });
    mocks.resolveExpectedOutputsForModeMock.mockResolvedValue([
      {
        outputKey: "trust_certificate",
        outputLabel: "Certificate of Trust",
        isRequired: true,
        sortOrder: 10,
        metadata: {},
      },
      {
        outputKey: "trust_rrr",
        outputLabel: "Trust Registration Amendment",
        isRequired: true,
        sortOrder: 20,
        metadata: {},
      },
    ]);

    mocks.createDocumentWithVersionMock.mockResolvedValue({
      document: {
        id: "doc-1",
        owner_id: "owner-1",
        idn: null,
        status: "draft",
        document_type: "generic",
        jurisdiction: "US-CA",
        product_flow_mode: "trust_bundle",
        selected_families: ["poa", "trust"],
        output_bundle: [
          {
            outputKey: "trust_certificate",
            outputLabel: "Certificate of Trust",
            isRequired: true,
            sortOrder: 10,
            metadata: {},
          },
        ],
        created_at: "2026-04-13T00:00:00.000Z",
        updated_at: "2026-04-13T00:00:00.000Z",
      },
      version: {
        id: "ver-1",
        document_id: "doc-1",
        version: 1,
        storage_path: "owner-1/doc-1/v1/source.pdf",
        file_name: "source.pdf",
        mime_type: "application/pdf",
        size_bytes: 1234,
        is_final: false,
        created_by: "owner-1",
        created_at: "2026-04-13T00:00:01.000Z",
      },
    });

    mocks.createDocumentUploadUrlMock.mockResolvedValue({
      bucket: "documents",
      path: "owner-1/doc-1/v1/source.pdf",
      signedUrl: "https://example.test/upload",
      token: "upload-token",
    });

    mocks.recordAuditEventMock.mockResolvedValue(undefined);
  });

  it("persists mode families and output bundle on create", async () => {
    const token = signToken({
      sub: "member-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productFlowMode: "trust_bundle",
        jurisdiction: "US-CA",
        fileName: "source.pdf",
        fileSize: 1234,
        mimeType: "application/pdf",
      });

    expect(response.status).toBe(201);
    expect(mocks.buildSelectionForModeMock).toHaveBeenCalledWith("trust_bundle");
    expect(mocks.resolveExpectedOutputsForModeMock).toHaveBeenCalledWith("trust_bundle");

    expect(mocks.createDocumentWithVersionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        productFlowMode: "trust_bundle",
        selectedFamilies: ["poa", "trust"],
        outputBundle: [
          {
            outputKey: "trust_certificate",
            outputLabel: "Certificate of Trust",
            isRequired: true,
            sortOrder: 10,
            metadata: {},
          },
          {
            outputKey: "trust_rrr",
            outputLabel: "Trust Registration Amendment",
            isRequired: true,
            sortOrder: 20,
            metadata: {},
          },
        ],
      }),
    );

    expect(response.body.document.productFlowMode).toBe("trust_bundle");
    expect(response.body.document.selectedFamilies).toEqual(["poa", "trust"]);
    expect(response.body.document.outputBundle).toHaveLength(1);

    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "member.document_upload_started",
        metadata: expect.objectContaining({
          product_flow_mode: "trust_bundle",
          output_bundle_count: 2,
        }),
      }),
    );
  });
});

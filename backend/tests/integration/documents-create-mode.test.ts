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
  bootstrapDocumentIntakeDraftMock: vi.fn(),
  createDocumentUploadUrlMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  buildSelectionForModeMock: vi.fn(),
  resolveExpectedOutputsForModeMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", () => ({
  getOrCreateUserId: mocks.getOrCreateUserIdMock,
  createDocumentWithVersion: mocks.createDocumentWithVersionMock,
  bootstrapDocumentIntakeDraft: mocks.bootstrapDocumentIntakeDraftMock,
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
    mocks.bootstrapDocumentIntakeDraftMock.mockReset();
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

    mocks.bootstrapDocumentIntakeDraftMock.mockResolvedValue({
      created: false,
      document: {
        id: "doc-intake-1",
        owner_id: "owner-1",
        idn: null,
        status: "draft",
        document_type: "intake",
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
      draft: {
        document_id: "doc-intake-1",
        owner_id: "owner-1",
        product_flow_mode: "trust_bundle",
        jurisdiction: "US-CA",
        current_step: "general_information",
        rules_snapshot_version: "member_form_rules_contract_v1",
        answers_json: { trust_name: "Acme Trust" },
        canonical_answers_json: { trust_name: "Acme Trust" },
        revision: 3,
        created_at: "2026-04-13T00:00:00.000Z",
        updated_at: "2026-04-13T00:10:00.000Z",
      },
    });
  });

  it("starts a fresh intake draft by default", async () => {
    mocks.bootstrapDocumentIntakeDraftMock.mockResolvedValueOnce({
      created: true,
      document: {
        id: "doc-intake-2",
        owner_id: "owner-1",
        idn: null,
        status: "draft",
        document_type: "intake",
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
        created_at: "2026-04-13T00:20:00.000Z",
        updated_at: "2026-04-13T00:20:00.000Z",
      },
      draft: {
        document_id: "doc-intake-2",
        owner_id: "owner-1",
        product_flow_mode: "trust_bundle",
        jurisdiction: "US-CA",
        current_step: null,
        rules_snapshot_version: "member_form_rules_contract_v1",
        answers_json: {},
        canonical_answers_json: {},
        revision: 1,
        created_at: "2026-04-13T00:20:00.000Z",
        updated_at: "2026-04-13T00:20:00.000Z",
      },
    });

    const token = signToken({
      sub: "member-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .post("/documents/intake/bootstrap")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productFlowMode: "trust_bundle",
        jurisdiction: "US-CA",
      });

    expect(response.status).toBe(200);
    expect(mocks.getOrCreateUserIdMock).toHaveBeenCalled();
    expect(mocks.buildSelectionForModeMock).toHaveBeenCalledWith("trust_bundle");
    expect(mocks.resolveExpectedOutputsForModeMock).toHaveBeenCalledWith("trust_bundle");
    expect(mocks.bootstrapDocumentIntakeDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        productFlowMode: "trust_bundle",
        jurisdiction: "US-CA",
        resumeLatestDraft: false,
      }),
    );

    expect(response.body).toEqual({
      created: true,
      document: {
        id: "doc-intake-2",
        idn: null,
        status: "draft",
        documentType: "intake",
        jurisdiction: "US-CA",
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
        ],
        createdAt: "2026-04-13T00:20:00.000Z",
      },
      draft: {
        documentId: "doc-intake-2",
        ownerId: "owner-1",
        productFlowMode: "trust_bundle",
        jurisdiction: "US-CA",
        currentStep: null,
        rulesSnapshotVersion: "member_form_rules_contract_v1",
        answers: {},
        canonicalAnswers: {},
        revision: 1,
        createdAt: "2026-04-13T00:20:00.000Z",
        updatedAt: "2026-04-13T00:20:00.000Z",
      },
    });
  });

  it("resumes the latest intake draft only when requested", async () => {
    const token = signToken({
      sub: "member-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .post("/documents/intake/bootstrap")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productFlowMode: "trust_bundle",
        jurisdiction: "US-CA",
        resumeLatestDraft: true,
      });

    expect(response.status).toBe(200);
    expect(mocks.bootstrapDocumentIntakeDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        productFlowMode: "trust_bundle",
        jurisdiction: "US-CA",
        resumeLatestDraft: true,
      }),
    );

    expect(response.body.created).toBe(false);
    expect(response.body.draft?.revision).toBe(3);
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

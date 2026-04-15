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
  listDocumentsMock: vi.fn(),
  getDocumentByIdMock: vi.fn(),
  listDocumentVersionsMock: vi.fn(),
  listDocumentPartiesMock: vi.fn(),
  listDocumentOutputSignersMock: vi.fn(),
  replaceDocumentPartiesMock: vi.fn(),
  replaceDocumentOutputSignersMock: vi.fn(),
  getDocumentIntakeDraftMock: vi.fn(),
  saveDocumentIntakeDraftMock: vi.fn(),
  getActiveTemplateRegistryForOutputMock: vi.fn(),
  getActiveTemplateArtifactMock: vi.fn(),
  createDocumentGenerationRunMock: vi.fn(),
  listDocumentGenerationRunsMock: vi.fn(),
  getDocumentGenerationRunByIdMock: vi.fn(),
  getTemplateArtifactByIdMock: vi.fn(),
  updateDocumentGenerationRunMock: vi.fn(),
  claimNextQueuedDocumentGenerationRunMock: vi.fn(),
  isDocumentIntakeLockedMock: vi.fn(),
  deriveMemberFormRulesByJurisdictionMock: vi.fn(),
  validateMemberFormSubmissionMock: vi.fn(),
  buildSelectionForModeMock: vi.fn(),
  buildMemberFormDocumentExtractionPayloadMock: vi.fn(),
  syncDocumentPartiesFromCanonicalAnswersMock: vi.fn(),
  prepareGenerationRunMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", () => ({
  listDocuments: mocks.listDocumentsMock,
  getDocumentById: mocks.getDocumentByIdMock,
  listDocumentVersions: mocks.listDocumentVersionsMock,
  listDocumentParties: mocks.listDocumentPartiesMock,
  listDocumentOutputSigners: mocks.listDocumentOutputSignersMock,
  replaceDocumentParties: mocks.replaceDocumentPartiesMock,
  replaceDocumentOutputSigners: mocks.replaceDocumentOutputSignersMock,
  getDocumentIntakeDraft: mocks.getDocumentIntakeDraftMock,
  saveDocumentIntakeDraft: mocks.saveDocumentIntakeDraftMock,
  getActiveTemplateRegistryForOutput:
    mocks.getActiveTemplateRegistryForOutputMock,
  getActiveTemplateArtifact: mocks.getActiveTemplateArtifactMock,
  createDocumentGenerationRun: mocks.createDocumentGenerationRunMock,
  listDocumentGenerationRuns: mocks.listDocumentGenerationRunsMock,
  getDocumentGenerationRunById: mocks.getDocumentGenerationRunByIdMock,
  getTemplateArtifactById: mocks.getTemplateArtifactByIdMock,
  updateDocumentGenerationRun: mocks.updateDocumentGenerationRunMock,
  claimNextQueuedDocumentGenerationRun:
    mocks.claimNextQueuedDocumentGenerationRunMock,
  isDocumentIntakeLocked: mocks.isDocumentIntakeLockedMock,
}));

vi.mock("../../src/services/auditService", () => ({
  recordAuditEvent: mocks.recordAuditEventMock,
}));

vi.mock("../../src/services/memberFormRulesService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/memberFormRulesService")>(
    "../../src/services/memberFormRulesService",
  );

  return {
    ...actual,
    deriveMemberFormRulesByJurisdiction:
      mocks.deriveMemberFormRulesByJurisdictionMock,
  };
});

vi.mock("../../src/services/documentGenerationService", () => ({
  syncDocumentPartiesFromCanonicalAnswers:
    mocks.syncDocumentPartiesFromCanonicalAnswersMock,
  prepareGenerationRun: mocks.prepareGenerationRunMock,
  mapDocumentOutputSignerResponse: (signer: Record<string, unknown>) => ({
    id: signer.id,
    documentId: signer.document_id,
    generationRunId: signer.generation_run_id,
    documentPartyId: signer.document_party_id,
    outputKey: signer.output_key,
    documentKey: signer.document_key,
    partyRole: signer.party_role,
    partyName: signer.party_name,
    obligationType: signer.obligation_type,
    signingGroup: signer.signing_group,
    isRequired: signer.is_required,
    resolutionSource: signer.resolution_source,
    sortOrder: signer.sort_order,
    metadata: signer.metadata ?? {},
    createdAt: signer.created_at,
  }),
}));

vi.mock("../../src/services/memberFormValidationService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/memberFormValidationService")>(
    "../../src/services/memberFormValidationService",
  );

  return {
    ...actual,
    validateMemberFormSubmission: mocks.validateMemberFormSubmissionMock,
  };
});

vi.mock("../../src/services/productFlowModeService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/productFlowModeService")>(
    "../../src/services/productFlowModeService",
  );

  return {
    ...actual,
    buildSelectionForMode: mocks.buildSelectionForModeMock,
  };
});

vi.mock("../../src/services/memberFormDocumentExtractionService", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/services/memberFormDocumentExtractionService")
  >("../../src/services/memberFormDocumentExtractionService");

    mocks.recordAuditEventMock.mockReset();
  return {
    ...actual,
    buildMemberFormDocumentExtractionPayload:
      mocks.buildMemberFormDocumentExtractionPayloadMock,
  };
});

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

const postWithLog = async (
  path: string,
  payload: Record<string, unknown>,
  label: string,
  token?: string,
) => {
  console.log("request", { method: "POST", path, payload });
  let req = request(app).post(path).send(payload);
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
    mocks.listDocumentOutputSignersMock.mockReset();
    mocks.replaceDocumentPartiesMock.mockReset();
    mocks.replaceDocumentOutputSignersMock.mockReset();
    mocks.getDocumentIntakeDraftMock.mockReset();
    mocks.saveDocumentIntakeDraftMock.mockReset();
    mocks.getActiveTemplateRegistryForOutputMock.mockReset();
    mocks.getActiveTemplateArtifactMock.mockReset();
    mocks.createDocumentGenerationRunMock.mockReset();
    mocks.listDocumentGenerationRunsMock.mockReset();
    mocks.getDocumentGenerationRunByIdMock.mockReset();
    mocks.getTemplateArtifactByIdMock.mockReset();
    mocks.updateDocumentGenerationRunMock.mockReset();
    mocks.claimNextQueuedDocumentGenerationRunMock.mockReset();
    mocks.isDocumentIntakeLockedMock.mockReset();
    mocks.deriveMemberFormRulesByJurisdictionMock.mockReset();
    mocks.validateMemberFormSubmissionMock.mockReset();
    mocks.buildSelectionForModeMock.mockReset();
    mocks.buildMemberFormDocumentExtractionPayloadMock.mockReset();
    mocks.syncDocumentPartiesFromCanonicalAnswersMock.mockReset();
    mocks.prepareGenerationRunMock.mockReset();

    mocks.isDocumentIntakeLockedMock.mockImplementation(() => false);
    mocks.buildSelectionForModeMock.mockResolvedValue({
      modeKey: "trust_bundle",
      families: ["poa", "trust"],
      poaType: "general",
      trustType: "rrr",
      idnType: "acknowledgment",
    });

    mocks.buildMemberFormDocumentExtractionPayloadMock.mockResolvedValue({
      generatedAt: "2026-03-05T00:15:00.000Z",
      documents: [],
    });
    mocks.getActiveTemplateArtifactMock.mockResolvedValue(null);
    mocks.listDocumentOutputSignersMock.mockResolvedValue([]);
    mocks.replaceDocumentOutputSignersMock.mockResolvedValue([]);
    mocks.syncDocumentPartiesFromCanonicalAnswersMock.mockResolvedValue([]);
    mocks.prepareGenerationRunMock.mockResolvedValue({
      document: {
        id: "doc-1",
        owner_id: "owner-1",
        idn: "IDN-1234",
        status: "draft",
        document_type: "intake",
        jurisdiction: "US-CA",
        product_flow_mode: "trust_bundle",
        output_bundle: [],
        intake_status: "submitted",
        intake_submitted_at: "2026-03-05T00:15:00.000Z",
        created_at: "2026-03-05T00:00:00.000Z",
      },
      documentKey: "poa_general",
      extractionDocument: {
        documentKey: "poa_general",
        templateCoverage: {
          totalBindings: 10,
          mappedBindings: 10,
          missingBindings: 0,
          systemBindings: 2,
        },
        templateBindings: [],
      },
      signerObligations: [],
      renderContext: {},
      blockingRequirements: [],
      resolvedSources: {},
      status: "queued",
      errorMessage: null,
    });
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

  it("gets intake draft for admin", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      created_at: "2026-03-05T00:00:00.000Z",
    });

    mocks.getDocumentIntakeDraftMock.mockResolvedValue({
      document_id: "doc-1",
      owner_id: "owner-1",
      product_flow_mode: "trust_bundle",
      jurisdiction: "US-CA",
      current_step: "authority",
      rules_snapshot_version: "member_form_rules_contract_v1",
      answers_json: {
        trust_name: "Family Trust",
      },
      canonical_answers_json: {
        trust_name: "Family Trust",
      },
      revision: 2,
      created_at: "2026-03-05T00:05:00.000Z",
      updated_at: "2026-03-05T00:10:00.000Z",
    });

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await getWithLog(
      "/documents/doc-1/intake-draft",
      "gets intake draft for admin",
      token,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      draft: {
        documentId: "doc-1",
        ownerId: "owner-1",
        productFlowMode: "trust_bundle",
        jurisdiction: "US-CA",
        currentStep: "authority",
        rulesSnapshotVersion: "member_form_rules_contract_v1",
        answers: {
          trust_name: "Family Trust",
        },
        canonicalAnswers: {
          trust_name: "Family Trust",
        },
        revision: 2,
        createdAt: "2026-03-05T00:05:00.000Z",
        updatedAt: "2026-03-05T00:10:00.000Z",
      },
    });
  });

  it("saves intake draft for admin", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      created_at: "2026-03-05T00:00:00.000Z",
    });

    mocks.saveDocumentIntakeDraftMock.mockResolvedValue({
      conflict: false,
      draft: {
        document_id: "doc-1",
        owner_id: "owner-1",
        product_flow_mode: "trust_bundle",
        jurisdiction: "US-CA",
        current_step: "authority",
        rules_snapshot_version: "member_form_rules_contract_v1",
        answers_json: {
          trust_name: "Family Trust",
        },
        canonical_answers_json: {
          trust_name: "Family Trust",
        },
        revision: 2,
        created_at: "2026-03-05T00:05:00.000Z",
        updated_at: "2026-03-05T00:10:00.000Z",
      },
    });

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await putWithLog(
      "/documents/doc-1/intake-draft",
      {
        currentStep: "authority",
        answers: {
          trust_name: "Family Trust",
        },
        canonicalAnswers: {
          trust_name: "Family Trust",
        },
        expectedRevision: 1,
      },
      "saves intake draft for admin",
      token,
    );

    expect(response.status).toBe(200);
    expect(mocks.saveDocumentIntakeDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        ownerId: "owner-1",
        productFlowMode: "trust_bundle",
        jurisdiction: "US-CA",
        currentStep: "authority",
        expectedRevision: 1,
        eventType: "autosave",
      }),
    );

    expect(response.body).toEqual({
      draft: {
        documentId: "doc-1",
        ownerId: "owner-1",
        productFlowMode: "trust_bundle",
        jurisdiction: "US-CA",
        currentStep: "authority",
        rulesSnapshotVersion: "member_form_rules_contract_v1",
        answers: {
          trust_name: "Family Trust",
        },
        canonicalAnswers: {
          trust_name: "Family Trust",
        },
        revision: 2,
        createdAt: "2026-03-05T00:05:00.000Z",
        updatedAt: "2026-03-05T00:10:00.000Z",
      },
    });
  });

  it("returns 409 on intake draft revision conflict", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      created_at: "2026-03-05T00:00:00.000Z",
    });

    mocks.saveDocumentIntakeDraftMock.mockResolvedValue({
      conflict: true,
      currentRevision: 4,
    });

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await putWithLog(
      "/documents/doc-1/intake-draft",
      {
        currentStep: "authority",
        answers: {
          trust_name: "Family Trust",
        },
        expectedRevision: 1,
      },
      "returns 409 on intake draft revision conflict",
      token,
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "conflict",
      message: "Draft revision mismatch",
      currentRevision: 4,
    });
  });

  it("submits intake draft and persists canonical payload", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "draft",
      document_type: "intake",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      intake_status: "draft",
      intake_submitted_at: null,
      created_at: "2026-03-05T00:00:00.000Z",
    });

    mocks.deriveMemberFormRulesByJurisdictionMock.mockResolvedValue({
      contract: {
        aggregatedForm: {
          sections: [
            {
              fields: [
                {
                  canonical_key: "trust_name",
                },
              ],
            },
          ],
        },
      },
      missing: [],
    });

    mocks.validateMemberFormSubmissionMock.mockReturnValue({
      valid: true,
      errors: [],
    });

    mocks.saveDocumentIntakeDraftMock.mockResolvedValue({
      conflict: false,
      draft: {
        document_id: "doc-1",
        owner_id: "owner-1",
        product_flow_mode: "trust_bundle",
        jurisdiction: "US-CA",
        current_step: "trust_requirements",
        rules_snapshot_version: "member_form_rules_contract_v1",
        answers_json: {
          trust_name: "Family Trust",
        },
        canonical_answers_json: {
          trust_name: "Family Trust",
        },
        revision: 7,
        created_at: "2026-03-05T00:05:00.000Z",
        updated_at: "2026-03-05T00:10:00.000Z",
      },
    });

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await postWithLog(
      "/documents/doc-1/intake-submit",
      {
        currentStep: "trust_requirements",
        answers: {
          trust_name: "Family Trust",
          ignored_object: { nope: true },
        },
        expectedRevision: 6,
      },
      "submits intake draft and persists canonical payload",
      token,
    );

    expect(response.status).toBe(200);
    expect(mocks.saveDocumentIntakeDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        eventType: "submit",
        expectedRevision: 6,
        canonicalAnswers: {
          trust_name: "Family Trust",
        },
      }),
    );
    expect(mocks.syncDocumentPartiesFromCanonicalAnswersMock).toHaveBeenCalledWith({
      documentId: "doc-1",
      canonicalAnswers: {
        trust_name: "Family Trust",
      },
    });
    expect(response.body).toEqual({
      draft: {
        documentId: "doc-1",
        ownerId: "owner-1",
        productFlowMode: "trust_bundle",
        jurisdiction: "US-CA",
        currentStep: "trust_requirements",
        rulesSnapshotVersion: "member_form_rules_contract_v1",
        answers: {
          trust_name: "Family Trust",
        },
        canonicalAnswers: {
          trust_name: "Family Trust",
        },
        revision: 7,
        createdAt: "2026-03-05T00:05:00.000Z",
        updatedAt: "2026-03-05T00:10:00.000Z",
      },
      canonicalPayload: {
        trust_name: "Family Trust",
      },
    });
  });

  it("returns 409 when intake submit is blocked by the launch gate", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "draft",
      document_type: "intake",
      jurisdiction: "US-FL",
      product_flow_mode: "trust_bundle",
      intake_status: "draft",
      intake_submitted_at: null,
      created_at: "2026-03-05T00:00:00.000Z",
    });

    mocks.deriveMemberFormRulesByJurisdictionMock.mockResolvedValue({
      contract: null,
      missing: [],
      availabilityConflict: {
        available: false,
        jurisdiction: "US-FL",
        reason: "Launch limited to California and Ohio during current rollout.",
        message:
          "Jurisdiction US-FL is unavailable for the selected product flow. Launch limited to California and Ohio during current rollout.",
        unavailableRequirements: [
          {
            family: "poa",
            documentType: "general",
            reason: "Launch limited to California and Ohio during current rollout.",
          },
          {
            family: "trust",
            documentType: "rrr",
            reason: "Launch limited to California and Ohio during current rollout.",
          },
        ],
      },
    });

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await postWithLog(
      "/documents/doc-1/intake-submit",
      {
        answers: {
          trust_name: "Family Trust",
        },
      },
      "returns 409 when intake submit is blocked by the launch gate",
      token,
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "conflict",
      message:
        "Jurisdiction US-FL is unavailable for the selected product flow. Launch limited to California and Ohio during current rollout.",
      jurisdiction: "US-FL",
      reason: "Launch limited to California and Ohio during current rollout.",
      unavailableRequirements: [
        {
          family: "poa",
          documentType: "general",
          reason: "Launch limited to California and Ohio during current rollout.",
        },
        {
          family: "trust",
          documentType: "rrr",
          reason: "Launch limited to California and Ohio during current rollout.",
        },
      ],
    });
    expect(mocks.saveDocumentIntakeDraftMock).not.toHaveBeenCalled();
  });

  it("returns 422 when intake submit validation fails", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "draft",
      document_type: "intake",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      intake_status: "draft",
      intake_submitted_at: null,
      created_at: "2026-03-05T00:00:00.000Z",
    });

    mocks.deriveMemberFormRulesByJurisdictionMock.mockResolvedValue({
      contract: {
        aggregatedForm: {
          sections: [],
        },
      },
      missing: [],
    });

    mocks.validateMemberFormSubmissionMock.mockReturnValue({
      valid: false,
      errors: [
        {
          code: "trust_named_signing_trustee_required",
          field: "trustees",
          message: "Select one trustee as the named signing trustee.",
        },
      ],
    });

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await postWithLog(
      "/documents/doc-1/intake-submit",
      {
        answers: {
          trust_name: "Family Trust",
        },
      },
      "returns 422 when intake submit validation fails",
      token,
    );

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      valid: false,
      message: "Member form validation failed",
      errors: [
        {
          code: "trust_named_signing_trustee_required",
          field: "trustees",
          message: "Select one trustee as the named signing trustee.",
        },
      ],
    });
    expect(mocks.saveDocumentIntakeDraftMock).not.toHaveBeenCalled();
  });

  it("gets canonical intake payload after submit", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "draft",
      document_type: "intake",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:15:00.000Z",
      created_at: "2026-03-05T00:00:00.000Z",
    });

    mocks.isDocumentIntakeLockedMock.mockReturnValue(true);

    mocks.getDocumentIntakeDraftMock.mockResolvedValue({
      document_id: "doc-1",
      owner_id: "owner-1",
      product_flow_mode: "trust_bundle",
      jurisdiction: "US-CA",
      current_step: "trust_requirements",
      rules_snapshot_version: "member_form_rules_contract_v1",
      answers_json: {
        trust_name: "Family Trust",
      },
      canonical_answers_json: {
        trust_name: "Family Trust",
      },
      revision: 7,
      created_at: "2026-03-05T00:05:00.000Z",
      updated_at: "2026-03-05T00:15:00.000Z",
    });

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await getWithLog(
      "/documents/doc-1/intake-payload",
      "gets canonical intake payload after submit",
      token,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      documentId: "doc-1",
      intakeStatus: "submitted",
      submittedAt: "2026-03-05T00:15:00.000Z",
      payload: {
        jurisdiction: "US-CA",
        productFlowMode: "trust_bundle",
        rulesSnapshotVersion: "member_form_rules_contract_v1",
        revision: 7,
        canonicalAnswers: {
          trust_name: "Family Trust",
        },
      },
    });
  });

  it("creates generation runs for submitted intake", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "draft",
      document_type: "intake",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      output_bundle: [
        {
          outputKey: "poa_document",
          outputLabel: "Power of Attorney",
          isRequired: true,
          sortOrder: 10,
          metadata: {},
        },
      ],
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:15:00.000Z",
      created_at: "2026-03-05T00:00:00.000Z",
    });

    mocks.isDocumentIntakeLockedMock.mockReturnValue(true);

    mocks.getDocumentIntakeDraftMock.mockResolvedValue({
      document_id: "doc-1",
      owner_id: "owner-1",
      product_flow_mode: "trust_bundle",
      jurisdiction: "US-CA",
      current_step: "trust_requirements",
      rules_snapshot_version: "member_form_rules_contract_v1",
      answers_json: {
        trust_name: "Family Trust",
      },
      canonical_answers_json: {
        trust_name: "Family Trust",
      },
      revision: 7,
      created_at: "2026-03-05T00:05:00.000Z",
      updated_at: "2026-03-05T00:15:00.000Z",
    });

    mocks.deriveMemberFormRulesByJurisdictionMock.mockResolvedValue({
      contract: {
        aggregatedForm: {
          sections: [],
        },
      },
      missing: [],
    });

    mocks.buildMemberFormDocumentExtractionPayloadMock.mockResolvedValue({
      generatedAt: "2026-03-05T00:15:00.000Z",
      documents: [
        {
          documentKey: "poa_general",
          templateCoverage: {
            totalBindings: 10,
            mappedBindings: 10,
            missingBindings: 0,
            systemBindings: 2,
          },
        },
      ],
    });

    mocks.getActiveTemplateRegistryForOutputMock.mockResolvedValue({
      id: "tmpl-1",
      jurisdiction: "US-CA",
      output_key: "poa_document",
      document_key: "poa_general",
      template_key: "ca_poa_general",
      template_version: "2026.04.14.v1",
      template_hash: "sha256:ca-poadoc-v1",
      effective_from: "2026-04-14T00:00:00.000Z",
      effective_to: null,
      is_active: true,
      created_at: "2026-04-14T00:00:00.000Z",
    });

    mocks.createDocumentGenerationRunMock.mockResolvedValue({
      id: "run-1",
      document_id: "doc-1",
      intake_revision: 7,
      output_key: "poa_document",
      document_key: "poa_general",
      template_key: "ca_poa_general",
      template_version: "2026.04.14.v1",
      template_hash: "sha256:ca-poadoc-v1",
      template_artifact_id: "artifact-1",
      payload_json: {
        revision: 7,
        canonicalAnswers: {
          trust_name: "Family Trust",
        },
      },
      coverage_json: {
        documentKey: "poa_general",
      },
      render_context_json: {},
      blocking_requirements_json: [],
      resolved_sources_json: {},
      status: "queued",
      renderer_job_id: null,
      document_version_id: null,
      blocked_at: null,
      started_at: null,
      rendered_at: null,
      failed_at: null,
      canceled_at: null,
      failure_code: null,
      failure_details_json: {},
      cancellation_reason: null,
      error_message: null,
      created_at: "2026-03-05T00:20:00.000Z",
    });
    mocks.getActiveTemplateArtifactMock.mockResolvedValue({
      id: "artifact-1",
      template_key: "ca_poa_general",
      template_version: "2026.04.14.v1",
      template_hash: "sha256:ca-poadoc-v1",
      artifact_storage_path: "templates/ca_poa_general.docx",
      artifact_mime_type:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      render_engine: "docx_template",
      artifact_metadata: {},
      is_active: true,
      created_at: "2026-04-14T00:00:00.000Z",
    });

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await postWithLog(
      "/documents/doc-1/generation-runs",
      {
        outputKeys: ["poa_document"],
      },
      "creates generation runs for submitted intake",
      token,
    );

    expect(response.status).toBe(201);
    expect(mocks.createDocumentGenerationRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        intakeRevision: 7,
        outputKey: "poa_document",
        documentKey: "poa_general",
        templateKey: "ca_poa_general",
        templateVersion: "2026.04.14.v1",
        templateHash: "sha256:ca-poadoc-v1",
        status: "queued",
      }),
    );
  });

  it("lists generation runs", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "draft",
      document_type: "intake",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:15:00.000Z",
      created_at: "2026-03-05T00:00:00.000Z",
    });

    mocks.listDocumentGenerationRunsMock.mockResolvedValue([
      {
        id: "run-1",
        document_id: "doc-1",
        intake_revision: 7,
        output_key: "poa_document",
        document_key: "poa_general",
        template_key: "ca_poa_general",
        template_version: "2026.04.14.v1",
        template_hash: "sha256:ca-poadoc-v1",
        template_artifact_id: "artifact-1",
        payload_json: {
          revision: 7,
        },
        coverage_json: {
          documentKey: "poa_general",
        },
        render_context_json: {},
        blocking_requirements_json: [],
        resolved_sources_json: {},
        status: "queued",
        renderer_job_id: null,
        document_version_id: null,
        blocked_at: null,
        started_at: null,
        rendered_at: null,
        failed_at: null,
        canceled_at: null,
        failure_code: null,
        failure_details_json: {},
        cancellation_reason: null,
        error_message: null,
        created_at: "2026-03-05T00:20:00.000Z",
      },
    ]);

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await getWithLog(
      "/documents/doc-1/generation-runs",
      "lists generation runs",
      token,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      runs: [
        {
          id: "run-1",
          documentId: "doc-1",
          intakeRevision: 7,
          outputKey: "poa_document",
          documentKey: "poa_general",
          templateKey: "ca_poa_general",
          templateVersion: "2026.04.14.v1",
          templateHash: "sha256:ca-poadoc-v1",
          payload: {
            revision: 7,
          },
          coverage: {
            documentKey: "poa_general",
          },
          documentVersionId: null,
          blockedCount: 0,
          status: "queued",
          errorMessage: null,
          blockedAt: null,
          startedAt: null,
          renderedAt: null,
          failedAt: null,
          canceledAt: null,
          createdAt: "2026-03-05T00:20:00.000Z",
        },
      ],
    });
  });

  it("gets generation run detail", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "draft",
      document_type: "intake",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:15:00.000Z",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getDocumentGenerationRunByIdMock.mockResolvedValue({
      id: "run-1",
      document_id: "doc-1",
      intake_revision: 7,
      output_key: "poa_document",
      document_key: "poa_general",
      template_key: "ca_poa_general",
      template_version: "2026.04.14.v1",
      template_hash: "sha256:ca-poadoc-v1",
      template_artifact_id: "artifact-1",
      payload_json: { revision: 7 },
      coverage_json: { documentKey: "poa_general" },
      render_context_json: { placeholders: {} },
      blocking_requirements_json: [],
      resolved_sources_json: { member_form: 3 },
      status: "queued",
      renderer_job_id: null,
      document_version_id: null,
      blocked_at: null,
      started_at: null,
      rendered_at: null,
      failed_at: null,
      canceled_at: null,
      failure_code: null,
      failure_details_json: {},
      cancellation_reason: null,
      error_message: null,
      created_at: "2026-03-05T00:20:00.000Z",
    });
    mocks.getTemplateArtifactByIdMock.mockResolvedValue({
      id: "artifact-1",
      template_key: "ca_poa_general",
      template_version: "2026.04.14.v1",
      template_hash: "sha256:ca-poadoc-v1",
      artifact_storage_path: "templates/ca_poa_general.docx",
      artifact_mime_type:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      render_engine: "docx_template",
      artifact_metadata: {},
      is_active: true,
      created_at: "2026-04-14T00:00:00.000Z",
    });

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await getWithLog(
      "/documents/doc-1/generation-runs/run-1?includeDebug=true",
      "gets generation run detail",
      token,
    );

    expect(response.status).toBe(200);
    expect(response.body.run).toMatchObject({
      id: "run-1",
      documentId: "doc-1",
      templateArtifact: {
        id: "artifact-1",
        renderEngine: "docx_template",
      },
      signerObligations: [],
      renderContext: { placeholders: {} },
      resolvedSources: { member_form: 3 },
    });
  });

  it("lists signer obligations for a document", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "draft",
      document_type: "intake",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:15:00.000Z",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      {
        id: "obligation-1",
        document_id: "doc-1",
        generation_run_id: "run-1",
        document_party_id: "party-1",
        output_key: "poa_document",
        document_key: "poa_general",
        party_role: "principal",
        party_name: "Pat Principal",
        obligation_type: "signer",
        signing_group: "principal_only",
        is_required: true,
        resolution_source: "template",
        sort_order: 0,
        metadata: {},
        created_at: "2026-03-05T00:20:00.000Z",
      },
    ]);

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await getWithLog(
      "/documents/doc-1/signer-obligations",
      "lists signer obligations",
      token,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      signerObligations: [
        {
          id: "obligation-1",
          documentId: "doc-1",
          generationRunId: "run-1",
          documentPartyId: "party-1",
          outputKey: "poa_document",
          documentKey: "poa_general",
          partyRole: "principal",
          partyName: "Pat Principal",
          obligationType: "signer",
          signingGroup: "principal_only",
          isRequired: true,
          resolutionSource: "template",
          sortOrder: 0,
          metadata: {},
          createdAt: "2026-03-05T00:20:00.000Z",
        },
      ],
    });
  });

  it("derives signature fields from signer obligations", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "draft",
      document_type: "intake",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:15:00.000Z",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([
      {
        id: "run-1",
        document_id: "doc-1",
        intake_revision: 7,
        output_key: "poa_document",
        document_key: "poa_general",
        template_key: "ca_poa_general",
        template_version: "2026.04.14.v1",
        template_hash: "sha256:ca-poadoc-v1",
        template_artifact_id: "artifact-1",
        payload_json: {},
        coverage_json: {},
        render_context_json: {},
        blocking_requirements_json: [],
        resolved_sources_json: {},
        status: "queued",
        renderer_job_id: null,
        document_version_id: null,
        blocked_at: null,
        started_at: null,
        rendered_at: null,
        failed_at: null,
        canceled_at: null,
        failure_code: null,
        failure_details_json: {},
        cancellation_reason: null,
        error_message: null,
        created_at: "2026-03-05T00:20:00.000Z",
      },
    ]);
    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      {
        id: "obligation-1",
        document_id: "doc-1",
        generation_run_id: "run-1",
        document_party_id: "party-1",
        output_key: "poa_document",
        document_key: "poa_general",
        party_role: "principal",
        party_name: "Pat Principal",
        obligation_type: "signer",
        signing_group: "principal_only",
        is_required: true,
        resolution_source: "template",
        sort_order: 0,
        metadata: {},
        created_at: "2026-03-05T00:20:00.000Z",
      },
      {
        id: "obligation-2",
        document_id: "doc-1",
        generation_run_id: "run-1",
        document_party_id: "party-1",
        output_key: "poa_document",
        document_key: "poa_general",
        party_role: "principal",
        party_name: "Pat Principal",
        obligation_type: "acknowledger",
        signing_group: "principal_only",
        is_required: true,
        resolution_source: "template",
        sort_order: 1,
        metadata: {},
        created_at: "2026-03-05T00:20:00.000Z",
      },
    ]);

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await getWithLog(
      "/documents/doc-1/signature-fields",
      "derives signature fields",
      token,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      generationRunId: "run-1",
      fields: [
        {
          id: "signature-field-obligation-1",
          generationRunId: "run-1",
          partyName: "Pat Principal",
          partyRole: "principal",
          signingGroup: "principal_only",
          pageNumber: 1,
          x: 72,
          y: 160,
          width: 240,
          height: 36,
          required: true,
        },
      ],
    });
  });

  it("cancels a queued generation run", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "IDN-1234",
      status: "draft",
      document_type: "intake",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:15:00.000Z",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getDocumentGenerationRunByIdMock.mockResolvedValue({
      id: "run-1",
      document_id: "doc-1",
      intake_revision: 7,
      output_key: "poa_document",
      document_key: "poa_general",
      template_key: "ca_poa_general",
      template_version: "2026.04.14.v1",
      template_hash: "sha256:ca-poadoc-v1",
      template_artifact_id: null,
      payload_json: {},
      coverage_json: {},
      render_context_json: {},
      blocking_requirements_json: [],
      resolved_sources_json: {},
      status: "queued",
      renderer_job_id: null,
      document_version_id: null,
      blocked_at: null,
      started_at: null,
      rendered_at: null,
      failed_at: null,
      canceled_at: null,
      failure_code: null,
      failure_details_json: {},
      cancellation_reason: null,
      error_message: null,
      created_at: "2026-03-05T00:20:00.000Z",
    });
    mocks.updateDocumentGenerationRunMock.mockResolvedValue({
      id: "run-1",
      document_id: "doc-1",
      intake_revision: 7,
      output_key: "poa_document",
      document_key: "poa_general",
      template_key: "ca_poa_general",
      template_version: "2026.04.14.v1",
      template_hash: "sha256:ca-poadoc-v1",
      template_artifact_id: null,
      payload_json: {},
      coverage_json: {},
      render_context_json: {},
      blocking_requirements_json: [],
      resolved_sources_json: {},
      status: "canceled",
      renderer_job_id: null,
      document_version_id: null,
      blocked_at: null,
      started_at: null,
      rendered_at: null,
      failed_at: null,
      canceled_at: "2026-03-05T00:30:00.000Z",
      failure_code: null,
      failure_details_json: {},
      cancellation_reason: "Superseded by newer run",
      error_message: null,
      created_at: "2026-03-05T00:20:00.000Z",
    });

    const token = signToken({
      sub: "admin-1",
      app_metadata: { role: "admin" },
    });

    const response = await postWithLog(
      "/documents/doc-1/generation-runs/run-1/cancel",
      { reason: "Superseded by newer run" },
      "cancels generation run",
      token,
    );

    expect(response.status).toBe(200);
    expect(response.body.run).toMatchObject({
      id: "run-1",
      status: "canceled",
      cancellationReason: "Superseded by newer run",
    });
  });
});

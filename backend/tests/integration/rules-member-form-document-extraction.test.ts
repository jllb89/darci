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
  buildMemberFormSelectionMock: vi.fn(),
  deriveMemberFormRulesByJurisdictionMock: vi.fn(),
  listMemberFormJurisdictionsMock: vi.fn(),
  buildMemberFormDocumentExtractionPayloadMock: vi.fn(),
  validateMemberFormSubmissionMock: vi.fn(),
  buildSelectionForModeMock: vi.fn(),
  getProductFlowModeMock: vi.fn(),
  listProductFlowModesMock: vi.fn(),
}));

vi.mock("../../src/services/memberFormRulesService", () => ({
  buildMemberFormSelection: mocks.buildMemberFormSelectionMock,
  deriveMemberFormRulesByJurisdiction: mocks.deriveMemberFormRulesByJurisdictionMock,
  listMemberFormJurisdictions: mocks.listMemberFormJurisdictionsMock,
}));

vi.mock("../../src/services/productFlowModeService", () => ({
  productFlowModeKeys: ["poa_only", "trust_bundle", "notarize_document"],
  buildSelectionForMode: mocks.buildSelectionForModeMock,
  getProductFlowMode: mocks.getProductFlowModeMock,
  listProductFlowModes: mocks.listProductFlowModesMock,
}));

vi.mock("../../src/services/memberFormDocumentExtractionService", () => ({
  buildMemberFormDocumentExtractionPayload: mocks.buildMemberFormDocumentExtractionPayloadMock,
}));

vi.mock("../../src/services/memberFormValidationService", () => ({
  validateMemberFormSubmission: mocks.validateMemberFormSubmissionMock,
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

describe("GET /rules/member-form/:jurisdiction/document-extraction", () => {
  const modeDefinition = {
    modeKey: "trust_bundle",
    displayName: "Generate a Trust",
    description: "Trust flow",
    isActive: true,
    isDefault: true,
    sortOrder: 20,
    families: [
      {
        family: "poa",
        defaultDocumentType: "general",
        isRequired: true,
        sortOrder: 10,
      },
      {
        family: "trust",
        defaultDocumentType: "rrr",
        isRequired: true,
        sortOrder: 20,
      },
    ],
    outputs: [
      {
        outputKey: "trust_rrr",
        outputLabel: "Trust Registration Amendment",
        isRequired: true,
        sortOrder: 20,
        metadata: {},
      },
    ],
    ui: [
      {
        groupKey: "trust_requirements",
        layoutMode: "wizard-step",
        showUploadColumn: true,
        uploadRequired: false,
        sortOrder: 30,
        metadata: {},
      },
    ],
  };

  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";

    mocks.buildMemberFormSelectionMock.mockReset();
    mocks.deriveMemberFormRulesByJurisdictionMock.mockReset();
    mocks.listMemberFormJurisdictionsMock.mockReset();
    mocks.buildMemberFormDocumentExtractionPayloadMock.mockReset();
    mocks.validateMemberFormSubmissionMock.mockReset();
    mocks.buildSelectionForModeMock.mockReset();
    mocks.getProductFlowModeMock.mockReset();
    mocks.listProductFlowModesMock.mockReset();

    mocks.buildSelectionForModeMock.mockResolvedValue({
      modeKey: "trust_bundle",
      families: ["poa", "trust"],
      poaType: "general",
      trustType: "rrr",
      idnType: "acknowledgment",
    });

    mocks.buildMemberFormSelectionMock.mockImplementation((input) => ({
      families: input?.families ?? ["poa", "trust"],
      poaType: input?.poaType ?? "general",
      trustType: input?.trustType ?? "rrr",
      idnType: input?.idnType ?? "acknowledgment",
    }));

    mocks.getProductFlowModeMock.mockResolvedValue(modeDefinition);
    mocks.listProductFlowModesMock.mockResolvedValue([modeDefinition]);
  });

  it("lists product flow modes", async () => {
    const token = signToken({
      sub: "member-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .get("/rules/product-flow-modes")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(mocks.listProductFlowModesMock).toHaveBeenCalledTimes(1);
    expect(response.body.modes).toHaveLength(1);
    expect(response.body.modes[0].modeKey).toBe("trust_bundle");
  });

  it("uses mode query for jurisdiction list", async () => {
    mocks.buildSelectionForModeMock.mockResolvedValue({
      modeKey: "poa_only",
      families: ["poa"],
      poaType: "general",
      trustType: "rrr",
      idnType: "acknowledgment",
    });

    mocks.getProductFlowModeMock.mockResolvedValue({
      ...modeDefinition,
      modeKey: "poa_only",
      displayName: "Generate a POA",
      isDefault: false,
      families: [
        {
          family: "poa",
          defaultDocumentType: "general",
          isRequired: true,
          sortOrder: 10,
        },
      ],
    });

    mocks.listMemberFormJurisdictionsMock.mockResolvedValue([
      {
        code: "US-CA",
        label: "California",
      },
    ]);

    const token = signToken({
      sub: "member-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .get("/rules/member-form?mode=poa_only")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(mocks.buildSelectionForModeMock).toHaveBeenCalledWith("poa_only");
    expect(mocks.listMemberFormJurisdictionsMock).toHaveBeenCalledWith({
      families: ["poa"],
      poaType: "general",
      trustType: "rrr",
      idnType: "acknowledgment",
    });
    expect(response.body.mode.modeKey).toBe("poa_only");
    expect(response.body.jurisdictions).toHaveLength(1);
  });

  it("rejects unsupported mode query", async () => {
    const token = signToken({
      sub: "member-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .get("/rules/member-form/ca?mode=invalid_mode")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
  });

  it("returns member-form rules with selected mode metadata", async () => {
    const stubContract = {
      jurisdiction: "US-CA",
      families: ["poa", "trust"],
      documentTypes: ["general", "rrr"],
      aggregatedForm: {
        jurisdiction: "US-CA",
        families: ["poa", "trust"],
        document_types: ["general", "rrr"],
        sections: [],
        source_trace: [],
      },
      familyContracts: [],
      sourceConditionContexts: [],
    };

    mocks.deriveMemberFormRulesByJurisdictionMock.mockResolvedValue({
      contract: {
        ...stubContract,
        productFlowMode: modeDefinition,
      },
      missing: [],
    });

    const token = signToken({
      sub: "member-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .get("/rules/member-form/ca?mode=trust_bundle")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(mocks.deriveMemberFormRulesByJurisdictionMock).toHaveBeenCalledWith("ca", {
      families: ["poa", "trust"],
      poaType: "general",
      trustType: "rrr",
      idnType: "acknowledgment",
    }, {
      productFlowMode: modeDefinition,
    });
    expect(response.body.memberForm.productFlowMode.modeKey).toBe("trust_bundle");
  });

  it("returns extraction payload for trust RRR and POA", async () => {
    const stubContract = {
      jurisdiction: "US-CA",
      families: ["poa", "trust"],
      documentTypes: ["general", "rrr"],
      aggregatedForm: {
        jurisdiction: "US-CA",
        families: ["poa", "trust"],
        document_types: ["general", "rrr"],
        sections: [],
        source_trace: [],
      },
      familyContracts: [],
      sourceConditionContexts: [],
    };

    mocks.deriveMemberFormRulesByJurisdictionMock.mockResolvedValue({
      contract: stubContract,
      missing: [],
    });

    mocks.buildMemberFormDocumentExtractionPayloadMock.mockReturnValue({
      jurisdiction: "US-CA",
      generatedAt: "2026-04-10T00:00:00.000Z",
      families: ["trust", "poa"],
      documents: [
        {
          documentKey: "trust_rrr",
          family: "trust",
          documentType: "rrr",
          jurisdiction: "US-CA",
          uiProfile: "trust_standard",
          derivationMode: "rules_plus_overrides",
          reviewStatus: "draft",
          templateResolution: {
            base_template_key: "trust_rrr_v1",
          },
          classification: {},
          capabilities: {},
          workflow: {
            steps: [],
            requiredArtifacts: [],
            submissionChecks: [],
          },
          documentOutputs: [],
          notices: [],
          sections: [],
          fields: [],
        },
        {
          documentKey: "poa_general",
          family: "poa",
          documentType: "general",
          jurisdiction: "US-CA",
          uiProfile: "poa_standard",
          derivationMode: "rules_plus_overrides",
          reviewStatus: "draft",
          templateResolution: {
            base_template_key: "poa_general_v2",
          },
          classification: {},
          capabilities: {},
          workflow: {
            steps: [],
            requiredArtifacts: [],
            submissionChecks: [],
          },
          documentOutputs: [],
          notices: [],
          sections: [],
          fields: [],
        },
      ],
      canonicalFieldIndex: [],
      sharedCanonicalKeys: [],
    });

    const token = signToken({
      sub: "member-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .get("/rules/member-form/ca/document-extraction?mode=trust_bundle")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(mocks.deriveMemberFormRulesByJurisdictionMock).toHaveBeenCalledWith("ca", {
      families: ["poa", "trust"],
      poaType: "general",
      trustType: "rrr",
      idnType: "acknowledgment",
    }, {
      productFlowMode: modeDefinition,
    });
    expect(mocks.buildMemberFormDocumentExtractionPayloadMock).toHaveBeenCalledWith(
      stubContract,
    );
    expect(response.body.mode.modeKey).toBe("trust_bundle");
    expect(response.body.extraction.documents).toHaveLength(2);
    expect(response.body.extraction.documents[0].documentKey).toBe("trust_rrr");
    expect(response.body.extraction.documents[1].documentKey).toBe("poa_general");
  });

  it("validates member-form submission payload", async () => {
    const stubContract = {
      jurisdiction: "US-CA",
      families: ["poa", "trust"],
      documentTypes: ["general", "rrr"],
      aggregatedForm: {
        jurisdiction: "US-CA",
        families: ["poa", "trust"],
        document_types: ["general", "rrr"],
        sections: [],
        source_trace: [],
      },
      familyContracts: [],
      sourceConditionContexts: [],
    };

    mocks.deriveMemberFormRulesByJurisdictionMock.mockResolvedValue({
      contract: stubContract,
      missing: [],
    });

    mocks.validateMemberFormSubmissionMock.mockReturnValue({
      valid: true,
      errors: [],
    });

    const token = signToken({
      sub: "member-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .post("/rules/member-form/ca/validate?mode=trust_bundle")
      .set("Authorization", `Bearer ${token}`)
      .send({
        formValues: {
          grantors: ["Alice Trustmaker", "Bob Trustmaker"],
          tax_id_owner: "Alice Trustmaker",
        },
      });

    expect(response.status).toBe(200);
    expect(mocks.validateMemberFormSubmissionMock).toHaveBeenCalledWith(
      stubContract,
      {
        grantors: ["Alice Trustmaker", "Bob Trustmaker"],
        tax_id_owner: "Alice Trustmaker",
      },
    );
    expect(response.body.valid).toBe(true);
    expect(response.body.errors).toEqual([]);
  });

  it("returns 422 when member-form validation fails", async () => {
    const stubContract = {
      jurisdiction: "US-CA",
      families: ["poa", "trust"],
      documentTypes: ["general", "rrr"],
      aggregatedForm: {
        jurisdiction: "US-CA",
        families: ["poa", "trust"],
        document_types: ["general", "rrr"],
        sections: [],
        source_trace: [],
      },
      familyContracts: [],
      sourceConditionContexts: [],
    };

    mocks.deriveMemberFormRulesByJurisdictionMock.mockResolvedValue({
      contract: stubContract,
      missing: [],
    });

    mocks.validateMemberFormSubmissionMock.mockReturnValue({
      valid: false,
      errors: [
        {
          code: "trust_tax_id_owner_not_in_source_list",
          field: "tax_id_owner",
          message: "Primary tax ID owner must match one of the entered Trustmakers.",
        },
      ],
    });

    const token = signToken({
      sub: "member-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .post("/rules/member-form/ca/validate?mode=trust_bundle")
      .set("Authorization", `Bearer ${token}`)
      .send({
        formValues: {
          grantors: ["Alice Trustmaker", "Bob Trustmaker"],
          tax_id_owner: "Charlie",
        },
      });

    expect(response.status).toBe(422);
    expect(response.body.valid).toBe(false);
    expect(response.body.errors).toHaveLength(1);
    expect(response.body.errors[0].code).toBe("trust_tax_id_owner_not_in_source_list");
  });
});

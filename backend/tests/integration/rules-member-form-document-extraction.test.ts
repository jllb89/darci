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
  buildMemberFormIntakeSelectionMock: vi.fn(),
  deriveMemberFormRulesByJurisdictionMock: vi.fn(),
  listMemberFormJurisdictionsMock: vi.fn(),
  buildMemberFormDocumentExtractionPayloadMock: vi.fn(),
}));

vi.mock("../../src/services/memberFormRulesService", () => ({
  buildMemberFormIntakeSelection: mocks.buildMemberFormIntakeSelectionMock,
  deriveMemberFormRulesByJurisdiction: mocks.deriveMemberFormRulesByJurisdictionMock,
  listMemberFormJurisdictions: mocks.listMemberFormJurisdictionsMock,
}));

vi.mock("../../src/services/memberFormDocumentExtractionService", () => ({
  buildMemberFormDocumentExtractionPayload: mocks.buildMemberFormDocumentExtractionPayloadMock,
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
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";

    mocks.buildMemberFormIntakeSelectionMock.mockReset();
    mocks.deriveMemberFormRulesByJurisdictionMock.mockReset();
    mocks.listMemberFormJurisdictionsMock.mockReset();
    mocks.buildMemberFormDocumentExtractionPayloadMock.mockReset();

    mocks.buildMemberFormIntakeSelectionMock.mockReturnValue({
      families: ["poa", "trust"],
      poaType: "general",
      trustType: "rrr",
      idnType: "acknowledgment",
    });
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
      .get("/rules/member-form/ca/document-extraction")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(mocks.deriveMemberFormRulesByJurisdictionMock).toHaveBeenCalledWith("ca", {
      families: ["poa", "trust"],
      poaType: "general",
      trustType: "rrr",
      idnType: "acknowledgment",
    });
    expect(mocks.buildMemberFormDocumentExtractionPayloadMock).toHaveBeenCalledWith(
      stubContract,
    );
    expect(response.body.extraction.documents).toHaveLength(2);
    expect(response.body.extraction.documents[0].documentKey).toBe("trust_rrr");
    expect(response.body.extraction.documents[1].documentKey).toBe("poa_general");
  });
});

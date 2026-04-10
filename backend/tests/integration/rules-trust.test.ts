import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  // Required because authController initializes Supabase clients at module load.
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
  getTrustRequirementDetailsMock: vi.fn(),
  listTrustJurisdictionsMock: vi.fn(),
  normalizeTrustJurisdictionMock: vi.fn(),
  deriveTrustInputRequirementsMock: vi.fn(),
}));

vi.mock("../../src/services/trustService", () => ({
  trustDocumentTypes: ["rrr", "certification", "other"],
  getTrustRequirementDetails: mocks.getTrustRequirementDetailsMock,
  listTrustJurisdictions: mocks.listTrustJurisdictionsMock,
  normalizeTrustJurisdiction: mocks.normalizeTrustJurisdictionMock,
}));

vi.mock("../../src/services/trustInputRequirements", () => ({
  deriveTrustInputRequirements: mocks.deriveTrustInputRequirementsMock,
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

describe("GET /rules/trust/:jurisdiction", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";

    mocks.getTrustRequirementDetailsMock.mockReset();
    mocks.listTrustJurisdictionsMock.mockReset();
    mocks.normalizeTrustJurisdictionMock.mockReset();
    mocks.deriveTrustInputRequirementsMock.mockReset();

    mocks.normalizeTrustJurisdictionMock.mockImplementation((input: string) => {
      const normalized = input.trim().toUpperCase();
      if (normalized.startsWith("US-")) {
        return normalized;
      }

      return `US-${normalized}`;
    });
  });

  it("returns trustee powers metadata and trustee power matrix validation", async () => {
    mocks.deriveTrustInputRequirementsMock.mockReturnValue({
      sections: [
        {
          key: "authority",
          title: "Authority",
          fields: [
            {
              key: "trustee_power_matrix",
              validation: {},
            },
          ],
        },
      ],
    });

    mocks.getTrustRequirementDetailsMock.mockResolvedValue({
      requirement: {
        id: "trust-1",
        jurisdiction: "US-CA",
        document_type: "rrr",
        ui_profile: "trust_standard",
        review_status: "verified",
        reviewed_at: null,
        reviewed_by: null,
        source_citation: "Cal. Probate Code",
        source_url: null,
        notes: null,
        created_at: "2026-04-10T12:00:00.000Z",
        updated_at: "2026-04-10T12:00:00.000Z",
      },
      trusteePowers: [
        {
          id: "power-1",
          jurisdiction: "US-CA",
          canonical_key: "real_property",
          canonical_label: "Real property",
          state_specific_label: "Real property and deeds",
          sort_order: 10,
          is_active: true,
          source_citation: "Cal. Probate Code",
          source_url: null,
          created_at: "2026-04-10T12:00:00.000Z",
          updated_at: "2026-04-10T12:00:00.000Z",
        },
        {
          id: "power-2",
          jurisdiction: "US-CA",
          canonical_key: "tax_matters",
          canonical_label: "Tax matters",
          state_specific_label: null,
          sort_order: 20,
          is_active: true,
          source_citation: "Cal. Probate Code",
          source_url: null,
          created_at: "2026-04-10T12:00:00.000Z",
          updated_at: "2026-04-10T12:00:00.000Z",
        },
      ],
    });

    const token = signToken({
      sub: "member-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .get("/rules/trust/ca?type=rrr")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(mocks.getTrustRequirementDetailsMock).toHaveBeenCalledWith("US-CA", "rrr");

    expect(response.body.requirement.trusteePowers).toEqual([
      {
        key: "real_property",
        canonicalLabel: "Real property",
        label: "Real property and deeds",
        sortOrder: 10,
      },
      {
        key: "tax_matters",
        canonicalLabel: "Tax matters",
        label: "Tax matters",
        sortOrder: 20,
      },
    ]);

    const validation =
      response.body.requirement.inputRequirements.sections[0].fields[0].validation;

    expect(validation).toEqual({
      allowed_values: ["real_property", "tax_matters"],
      allowed_value_labels: {
        real_property: "Real property and deeds",
        tax_matters: "Tax matters",
      },
    });
  });
});

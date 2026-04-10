import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  DEFAULT_PHONE_COUNTRY_ISO2,
  PHONE_COUNTRY_CODE_OPTIONS,
  getMemberFieldControlKind,
  getPhoneCountryCodeByIso2,
  hasSigningTrustee,
  isValidEmailFormat,
  isValidPhoneCountryCode,
  isValidPhoneFormat,
  parsePriorDocumentItems,
  parsePersonContact,
  parsePersonListItems,
  serializePriorDocumentItems,
  serializePersonContact,
  serializePersonListItems,
  type MemberFieldLike,
} from "./memberFormControls";

const buildField = (overrides: Partial<MemberFieldLike> = {}): MemberFieldLike => ({
  canonical_key: "sample",
  data_type: "string",
  semantic_type: "text",
  ...overrides,
});

describe("memberFormControls", () => {
  it("maps trustee list fields to repeatable structured person controls", () => {
    const trusteesField = buildField({
      canonical_key: "trustees",
      data_type: "array",
      semantic_type: "person_list",
    });

    expect(getMemberFieldControlKind(trusteesField, [])).toBe("repeatable-person-list");
  });

  it("maps principal/agent contact fields to person-contact controls", () => {
    const principalContactField = buildField({
      canonical_key: "principal_contact",
      data_type: "string",
      semantic_type: "contact",
    });

    expect(getMemberFieldControlKind(principalContactField, [])).toBe("person-contact");
  });

  it("keeps other person list fields as repeatable text list controls", () => {
    const successorAgentsField = buildField({
      canonical_key: "successor_agent_list",
      data_type: "array",
      semantic_type: "person_list",
    });

    expect(getMemberFieldControlKind(successorAgentsField, [])).toBe(
      "repeatable-text-list",
    );
  });

  it("maps prior document items to file-upload control", () => {
    const field = buildField({
      canonical_key: "prior_document_items",
      data_type: "array",
      semantic_type: "uploaded_document_list",
    });

    expect(getMemberFieldControlKind(field, [])).toBe("file-upload");
  });

  it("maps upload artifact fields to file-upload control", () => {
    const field = buildField({
      canonical_key: "uploaded_document_file",
      data_type: "object",
      semantic_type: "uploaded_document",
    });

    expect(getMemberFieldControlKind(field, [])).toBe("file-upload");
  });

  it("keeps non-list text semantics as textarea", () => {
    const field = buildField({
      canonical_key: "key_trust_terms",
      data_type: "string",
      semantic_type: "text",
    });

    expect(getMemberFieldControlKind(field, [])).toBe("textarea");
  });

  it("serializes and parses structured prior document items", () => {
    const serialized = serializePriorDocumentItems([
      {
        documentType: "trust_agreement",
        documentLabel: "Original trust agreement",
        documentDate: "2021-04-05",
        attachmentReference: "agreement.pdf",
      },
    ]);

    expect(serialized).toHaveLength(1);

    const parsed = parsePriorDocumentItems(serialized);
    expect(parsed).toEqual([
      {
        documentType: "trust_agreement",
        documentLabel: "Original trust agreement",
        documentDate: "2021-04-05",
        attachmentReference: "agreement.pdf",
      },
    ]);
  });

  it("serializes and parses person-contact values", () => {
    const serialized = serializePersonContact({
      email: "principal@example.com",
      phoneCountryIso2: "US",
      phoneCountryCode: "+1",
      phone: "555-111-2222",
    });

    expect(parsePersonContact(serialized)).toEqual({
      email: "principal@example.com",
      phoneCountryIso2: "US",
      phoneCountryCode: "+1",
      phone: "555-111-2222",
    });
  });

  it("falls back to default country code for legacy contact strings", () => {
    expect(parsePersonContact("principal@example.com")).toEqual({
      email: "principal@example.com",
      phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
      phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
      phone: "",
    });
  });

  it("serializes and parses trustee rows with signer selection", () => {
    const serialized = serializePersonListItems([
      {
        fullName: "Jordan Trustee",
        email: "jordan@example.com",
        phoneCountryIso2: "US",
        phoneCountryCode: "+1",
        phone: "555-222-3333",
        isSigningTrustee: true,
      },
    ]);

    const parsed = parsePersonListItems(serialized);

    expect(parsed).toEqual([
      {
        fullName: "Jordan Trustee",
        email: "jordan@example.com",
        phoneCountryIso2: "US",
        phoneCountryCode: "+1",
        phone: "555-222-3333",
        isSigningTrustee: true,
      },
    ]);
    expect(hasSigningTrustee(parsed)).toBe(true);
  });

  it("preserves blank trustee rows for interactive add flows", () => {
    const serialized = serializePersonListItems([
      {
        fullName: "",
        email: "",
        phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
        phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
        phone: "",
        isSigningTrustee: false,
      },
    ]);

    expect(serialized).toHaveLength(1);
    expect(parsePersonListItems(serialized)).toEqual([
      {
        fullName: "",
        email: "",
        phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
        phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
        phone: "",
        isSigningTrustee: false,
      },
    ]);
  });

  it("defaults trustee country code when legacy entries omit it", () => {
    const parsed = parsePersonListItems([
      JSON.stringify({
        fullName: "Legacy Trustee",
        email: "legacy@example.com",
        phone: "555-101-2020",
        isSigningTrustee: false,
      }),
    ]);

    expect(parsed).toEqual([
      {
        fullName: "Legacy Trustee",
        email: "legacy@example.com",
        phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
        phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
        phone: "555-101-2020",
        isSigningTrustee: false,
      },
    ]);
  });

  it("validates email, phone, and country code formats", () => {
    expect(isValidEmailFormat("principal@example.com")).toBe(true);
    expect(isValidEmailFormat("principal@invalid")).toBe(false);

    expect(isValidPhoneCountryCode("+1")).toBe(true);
    expect(isValidPhoneCountryCode("1")).toBe(false);

    expect(isValidPhoneFormat("555-111-2222")).toBe(true);
    expect(isValidPhoneFormat("123")).toBe(false);
  });

  it("exposes a complete country dial-code list with flags", () => {
    expect(PHONE_COUNTRY_CODE_OPTIONS.length).toBeGreaterThan(200);

    const usOption = PHONE_COUNTRY_CODE_OPTIONS.find((option) => option.countryIso2 === "US");
    expect(usOption).toBeDefined();
    expect(usOption?.code).toBe("+1");
    expect(usOption?.label.includes("US") || usOption?.label.includes("United States")).toBe(
      true,
    );

    expect(getPhoneCountryCodeByIso2("GB")).toBe("+44");
  });
});

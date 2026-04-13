import {
  buildInitialMemberFormValues,
  computeFieldRuntime,
  getVisibleSections,
  type MemberFacingField as RuntimeMemberFacingField,
  type MemberFacingSection as RuntimeMemberFacingSection,
  type MemberFormRulesContract as RuntimeMemberFormRulesContract,
  type MemberFormValue,
} from "@/app/app/start/memberFormRuntime";
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  DEFAULT_PHONE_COUNTRY_ISO2,
  getMemberFieldControlKind,
  isTemporarilyHiddenCreateFlowField,
  parsePersonListItems,
  serializePersonContact,
  serializePersonListItems,
} from "@/app/app/start/memberFormControls";

type MockableField = RuntimeMemberFacingField & {
  semantic_type: string;
  data_type: "string" | "integer" | "boolean" | "date" | "array" | "object";
  validation?: Record<string, unknown>;
};

type MockableSection = RuntimeMemberFacingSection<MockableField>;

export type StartMemberFormContract = RuntimeMemberFormRulesContract<
  MockableField,
  MockableSection
>;

export type StartFormValue = MemberFormValue;

export type BuildMockFormValuesOptions = {
  jurisdictionCode: string;
  jurisdictionLabel?: string;
};

const MOCK_DATE_VALUE = "2026-01-15";

const normalizeCanonicalKey = (canonicalKey: string) => {
  return canonicalKey.replace(/__\d+$/, "");
};

const toTitleCaseWords = (value: string) => {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const formatLabel = (value: string) => {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const getAllowedValues = (field: MockableField): string[] => {
  const validation = field.validation;
  if (!validation) {
    return [];
  }

  const raw = validation["allowed_values"] ?? validation["allowedValues"];
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((value): value is string => typeof value === "string");
};

const areFormValuesEqual = (left: StartFormValue | undefined, right: StartFormValue) => {
  if (typeof left === "string" && typeof right === "string") {
    return left === right;
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    return left === right;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((entry, index) => entry === right[index]);
  }

  return false;
};

const getMockPersonContactValue = (canonicalKey: string) => {
  const normalized = normalizeCanonicalKey(canonicalKey);

  if (normalized === "principal_contact") {
    return serializePersonContact({
      email: "principal.mock@example.com",
      phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
      phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
      phone: "4155550101",
    });
  }

  if (normalized === "agent_contact") {
    return serializePersonContact({
      email: "agent.mock@example.com",
      phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
      phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
      phone: "4155550102",
    });
  }

  return serializePersonContact({
    email: "member.mock@example.com",
    phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
    phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
    phone: "4155550100",
  });
};

const getMockPersonListValue = (canonicalKey: string) => {
  const normalized = normalizeCanonicalKey(canonicalKey);

  if (normalized === "trustees") {
    return serializePersonListItems([
      {
        fullName: "Jordan Trustee",
        email: "trustee.mock@example.com",
        phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
        phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
        phone: "4155550111",
        isSigningTrustee: true,
      },
    ]);
  }

  if (normalized === "successor_trustees") {
    return serializePersonListItems([
      {
        fullName: "Casey Successor",
        email: "successor.trustee.mock@example.com",
        phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
        phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
        phone: "4155550112",
        isSigningTrustee: false,
      },
    ]);
  }

  return serializePersonListItems([
    {
      fullName: "Alex Member",
      email: "member.mock@example.com",
      phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
      phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
      phone: "4155550110",
      isSigningTrustee: false,
    },
  ]);
};

const getMockTextListValue = (canonicalKey: string): string[] => {
  const normalized = normalizeCanonicalKey(canonicalKey);

  if (normalized === "grantors") {
    return ["Alex Grantor"];
  }

  if (normalized === "successor_agents" || normalized === "successor_agent_list") {
    return ["Jamie Successor Agent"];
  }

  return ["Sample entry"];
};

const getMockFileUploadValue = (canonicalKey: string): string => {
  const normalized = normalizeCanonicalKey(canonicalKey);

  if (normalized === "prior_document_items") {
    return "mock-prior-document.pdf";
  }

  return "mock-upload-document.pdf";
};

const getMockTextValue = (canonicalKey: string, options: BuildMockFormValuesOptions): string => {
  const normalized = normalizeCanonicalKey(canonicalKey);

  if (normalized === "trust_name") {
    const label =
      typeof options.jurisdictionLabel === "string" && options.jurisdictionLabel.trim().length > 0
        ? options.jurisdictionLabel.trim()
        : toTitleCaseWords(options.jurisdictionCode);

    return `${label} Family Trust`;
  }

  const byCanonicalKey: Record<string, string> = {
    principal_full_legal_name: "Alex Morgan",
    principal_full_name: "Alex Morgan",
    principal_address: "101 Harbor View Ln, Austin, TX 78701",
    agent_full_legal_name: "Taylor Reed",
    agent_full_name: "Taylor Reed",
    agent_address: "402 Cedar Ave, Dallas, TX 75201",
    special_instructions_text:
      "Allow digital copies for institutions unless an original is explicitly required.",
    revocation_holders_custom_text: "Grantor and trustee jointly.",
    trustee_incapacity_standard: "Written determination by licensed physician.",
    document_title: "Revocable Trust",
  };

  if (byCanonicalKey[normalized]) {
    return byCanonicalKey[normalized];
  }

  if (normalized.includes("email")) {
    return "member.mock@example.com";
  }

  if (normalized.includes("phone")) {
    return "4155550100";
  }

  if (normalized.includes("address")) {
    return "500 Market St, San Francisco, CA 94105";
  }

  if (normalized.includes("name")) {
    return "Alex Member";
  }

  return `${formatLabel(normalized)} sample`;
};

const buildMockValueForField = (
  field: MockableField,
  options: BuildMockFormValuesOptions,
): StartFormValue | null => {
  const allowedValues = getAllowedValues(field);
  const controlKind = getMemberFieldControlKind(field, allowedValues);

  if (controlKind === "object-placeholder") {
    return null;
  }

  if (controlKind === "boolean") {
    return true;
  }

  if (controlKind === "number") {
    return "1";
  }

  if (controlKind === "date") {
    return MOCK_DATE_VALUE;
  }

  if (controlKind === "person-contact") {
    return getMockPersonContactValue(field.canonical_key);
  }

  if (controlKind === "select") {
    return allowedValues[0] ?? "";
  }

  if (controlKind === "checkbox-multi") {
    return allowedValues.length > 0 ? [allowedValues[0]] : [];
  }

  if (controlKind === "repeatable-text-list") {
    return getMockTextListValue(field.canonical_key);
  }

  if (controlKind === "repeatable-person-list") {
    return getMockPersonListValue(field.canonical_key);
  }

  if (controlKind === "repeatable-document-list") {
    return ["mock-prior-document.pdf"];
  }

  if (controlKind === "file-upload") {
    return getMockFileUploadValue(field.canonical_key);
  }

  if (controlKind === "textarea") {
    if (field.data_type === "array") {
      return [getMockTextValue(field.canonical_key, options)];
    }

    return getMockTextValue(field.canonical_key, options);
  }

  if (controlKind === "text") {
    return getMockTextValue(field.canonical_key, options);
  }

  return getMockTextValue(field.canonical_key, options);
};

const isTrusteeListField = (canonicalKey: string) => {
  return normalizeCanonicalKey(canonicalKey) === "trustees";
};

export const buildMockFormValues = (
  memberForm: StartMemberFormContract,
  options: BuildMockFormValuesOptions,
): Record<string, StartFormValue> => {
  let nextValues: Record<string, StartFormValue> = buildInitialMemberFormValues(memberForm, {
    jurisdictionCode: options.jurisdictionCode,
    jurisdictionLabel: options.jurisdictionLabel,
  });

  for (let pass = 0; pass < 4; pass += 1) {
    const runtime = computeFieldRuntime(memberForm, nextValues);
    const visibleSections = getVisibleSections(memberForm, runtime);
    let changed = false;

    for (const section of visibleSections) {
      for (const field of section.fields) {
        if (isTemporarilyHiddenCreateFlowField(field.canonical_key)) {
          continue;
        }

        const mockValue = buildMockValueForField(field, options);
        if (mockValue === null) {
          continue;
        }

        if (!areFormValuesEqual(nextValues[field.canonical_key], mockValue)) {
          nextValues[field.canonical_key] = mockValue;
          changed = true;
        }

        if (isTrusteeListField(field.canonical_key)) {
          const trustees = parsePersonListItems(mockValue);
          const signingTrustee = trustees.find(
            (trustee) => trustee.isSigningTrustee && trustee.fullName.trim().length > 0,
          );
          const signerName = signingTrustee?.fullName.trim() ?? "";

          if (!areFormValuesEqual(nextValues.trustee_signature_authority, signerName)) {
            nextValues.trustee_signature_authority = signerName;
            changed = true;
          }
        }
      }
    }

    if (!changed) {
      break;
    }
  }

  return nextValues;
};

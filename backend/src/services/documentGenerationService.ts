import { randomUUID } from "crypto";
import {
  listDocumentParties,
  listDocumentSystemValues,
  replaceDocumentParties,
  upsertDocumentSystemValues,
  updateDocument,
  type DocumentGenerationRunRecord,
  type DocumentIntakeDraftRecord,
  type DocumentOutputSignerRecord,
  type DocumentOutputSignerUpsertInput,
  type DocumentPartyRecord,
  type DocumentPartyUpsertInput,
  type DocumentRecord,
  type DocumentSystemValueUpsertInput,
  type GenerationRunBlockingRequirement,
  type TemplateArtifactRecord,
} from "./documentService";
import {
  getTemplateBindingRulesByDocumentKey,
  type TemplateBindingRuleRecord,
} from "./templateBindingRulesService";
import type {
  DocumentExtractionContract,
  DocumentExtractionField,
  DocumentTemplateBinding,
  DocumentTemplateCoverage,
  MemberFormDocumentExtractionPayload,
} from "./memberFormDocumentExtractionService";

const DEFAULT_PHONE_COUNTRY_CODE = "+1";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const jurisdictionDisplayNames: Record<string, string> = {
  "US-CA": "California",
  "US-OH": "Ohio",
};

const trusteeSignatureAuthorityLabels: Record<string, string> = {
  all_trustees: "All trustees must sign",
  any_one_trustee: "Any one trustee may sign",
  named_signing_trustee: "Named signing trustee",
  custom: "Custom trustee signing instructions",
};

const agentSignatureAuthorityLabels: Record<string, string> = {
  all_agents_jointly: "All agents must act jointly",
  any_agent_separately: "Any agent may act separately",
};

const revocationHolderLabels: Record<string, string> = {
  trustmaker_only: "The trustmaker only",
  all_trustmakers_jointly: "All trustmakers acting jointly",
  each_trustmaker_as_to_own_property: "Each trustmaker as to their own property",
  trustee_controlled: "The acting trustee or trustees",
  custom: "Custom revocation rule",
  unsure: "Needs manual review",
};

const trusteeIncapacityStandardLabels: Record<string, string> = {
  licensed_physician_determination: "A licensed physician's determination",
  two_physician_determination: "Determination by two physicians",
  court_determination: "A court determination",
  written_resignation: "The trustee's written resignation",
  unanimous_trustee_determination: "Unanimous determination of the acting trustees",
  unable_to_manage_financial_affairs: "Inability to manage financial affairs",
  other: "Another documented incapacity standard",
  unsure: "Needs manual review",
};

const supportedSignerDocumentKeys = new Set(["poa_general", "trust_rrr", "trust_certificate"]);

export type CanonicalAnswers = Record<string, unknown>;

type ParsedContact = {
  email: string | null;
  phone: string | null;
  phoneCountryCode: string;
  metadata: Record<string, unknown>;
};

type ParsedPerson = ParsedContact & {
  fullName: string;
  isSigningTrustee: boolean;
  metadata: Record<string, unknown>;
};

type EnsureDocumentSystemValuesResult = {
  document: DocumentRecord;
  systemValues: Record<string, unknown>;
};

const normalizeCanonicalAnswersForGeneration = (
  canonicalAnswers: CanonicalAnswers,
  draft: Pick<DocumentIntakeDraftRecord, "jurisdiction">,
) => {
  const normalizedAnswers: CanonicalAnswers = {
    ...canonicalAnswers,
  };

  if (
    typeof normalizedAnswers.jurisdiction !== "string" ||
    normalizedAnswers.jurisdiction.trim().length === 0
  ) {
    normalizedAnswers.jurisdiction = draft.jurisdiction;
  }

  return normalizedAnswers;
};

export type PreparedGenerationRun = {
  document: DocumentRecord;
  documentKey: string;
  extractionDocument?: DocumentExtractionContract;
  signerObligations: DocumentOutputSignerUpsertInput[];
  renderContext: Record<string, unknown>;
  blockingRequirements: GenerationRunBlockingRequirement[];
  resolvedSources: Record<string, number>;
  status: DocumentGenerationRunRecord["status"];
  errorMessage: string | null;
};

const normalizePhoneDigits = (value: string) => value.replace(/\D/g, "");

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const asTrimmedString = (value: unknown) => {
  return typeof value === "string" ? value.trim() : "";
};

const normalizeNameForComparison = (value: string) => value.trim().toLowerCase();

const toJurisdictionDisplayName = (value: unknown) => {
  const candidate = asTrimmedString(value);
  if (!candidate) {
    return null;
  }

  return jurisdictionDisplayNames[candidate] ?? candidate;
};

const formatLongDate = (value: unknown) => {
  const candidate = asTrimmedString(value);
  if (!candidate) {
    return null;
  }

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return candidate;
  }

  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
};

const toJsonPrimitive = (value: unknown): string | number | boolean | null => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return JSON.stringify(value);
};

const parseJsonString = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const parseContactValue = (value: unknown): ParsedContact => {
  const defaults: ParsedContact = {
    email: null,
    phone: null,
    phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
    metadata: {},
  };

  if (isRecord(value)) {
    const email = asTrimmedString(value.email);
    const phone =
      asTrimmedString(value.phone) ||
      asTrimmedString(value.phoneNumber) ||
      asTrimmedString(value.mobile);
    const phoneCountryCode =
      asTrimmedString(value.phoneCountryCode) ||
      asTrimmedString(value.countryCode) ||
      DEFAULT_PHONE_COUNTRY_CODE;

    return {
      email: emailPattern.test(email) ? email : null,
      phone: normalizePhoneDigits(phone).length >= 7 ? phone : null,
      phoneCountryCode,
      metadata: value,
    };
  }

  const raw =
    typeof value === "string"
      ? value.trim()
      : value === undefined || value === null
        ? ""
        : String(value).trim();

  if (!raw) {
    return defaults;
  }

  const parsedJson = raw.startsWith("{") || raw.startsWith("[") ? parseJsonString(raw) : raw;
  if (parsedJson !== raw) {
    return parseContactValue(parsedJson);
  }

  const segments = raw
    .split(/[;,|\n]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  let email: string | null = null;
  let phone: string | null = null;
  let phoneCountryCode = DEFAULT_PHONE_COUNTRY_CODE;

  for (const segment of segments.length > 0 ? segments : [raw]) {
    if (!email && emailPattern.test(segment)) {
      email = segment;
      continue;
    }

    if (!phone) {
      const digits = normalizePhoneDigits(segment);
      if (digits.length >= 7 && digits.length <= 15) {
        phone = segment;
        const matchedCountryCode = segment.match(/^\+\d{1,4}/)?.[0];
        if (matchedCountryCode) {
          phoneCountryCode = matchedCountryCode;
        }
      }
    }
  }

  return {
    email,
    phone,
    phoneCountryCode,
    metadata: raw ? { raw } : {},
  };
};

const parsePersonValue = (value: unknown): ParsedPerson => {
  const fallback = parseContactValue(null);

  if (isRecord(value)) {
    const fullName =
      asTrimmedString(value.fullName) ||
      asTrimmedString(value.name) ||
      asTrimmedString(value.displayName);
    const contact = parseContactValue(value.contact ?? value);

    return {
      fullName,
      email: contact.email,
      phone: contact.phone,
      phoneCountryCode: contact.phoneCountryCode,
      isSigningTrustee: value.isSigningTrustee === true,
      metadata: value,
    };
  }

  if (typeof value === "string") {
    const parsed = parseJsonString(value);
    if (parsed !== value) {
      return parsePersonValue(parsed);
    }

    return {
      fullName: value.trim(),
      email: fallback.email,
      phone: fallback.phone,
      phoneCountryCode: fallback.phoneCountryCode,
      isSigningTrustee: false,
      metadata: value.trim().length > 0 ? { raw: value.trim() } : {},
    };
  }

  return {
    fullName: "",
    email: fallback.email,
    phone: fallback.phone,
    phoneCountryCode: fallback.phoneCountryCode,
    isSigningTrustee: false,
    metadata: {},
  };
};

const parsePersonList = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as ParsedPerson[];
  }

  return value
    .map((entry) => parsePersonValue(entry))
    .filter((entry) => entry.fullName.length > 0);
};

const buildPartyUpsert = (input: {
  partyRole: DocumentPartyUpsertInput["party_role"];
  person: ParsedPerson;
  sortOrder: number;
  isSigningParty: boolean;
  metadata?: Record<string, unknown>;
}): DocumentPartyUpsertInput => {
  return {
    party_role: input.partyRole,
    full_name: input.person.fullName,
    email: input.person.email,
    phone_country_code: input.person.phoneCountryCode,
    phone: input.person.phone,
    is_signing_party: input.isSigningParty,
    sort_order: input.sortOrder,
    metadata: {
      ...input.person.metadata,
      ...(input.metadata ?? {}),
    },
  };
};

const buildGrantorParties = (canonicalAnswers: CanonicalAnswers) => {
  const grantors = parsePersonList(canonicalAnswers.grantors);
  return grantors.map((grantor, index) =>
    buildPartyUpsert({
      partyRole: "grantor",
      person: grantor,
      sortOrder: index,
      isSigningParty: true,
      metadata: { rowOrder: index },
    }),
  );
};

const buildTrusteeParties = (canonicalAnswers: CanonicalAnswers) => {
  const trustees = parsePersonList(canonicalAnswers.trustees);
  const authorityMode = asTrimmedString(canonicalAnswers.trustee_signature_authority);

  return trustees.map((trustee, index) => {
    const isSigningParty =
      authorityMode === "named_signing_trustee"
        ? trustee.isSigningTrustee
        : authorityMode.length === 0 || authorityMode === "custom"
          ? true
          : true;

    return buildPartyUpsert({
      partyRole: "trustee",
      person: trustee,
      sortOrder: index,
      isSigningParty,
      metadata: {
        rowOrder: index,
        isSigningTrustee: trustee.isSigningTrustee,
      },
    });
  });
};

const buildPersonListParties = (
  value: unknown,
  partyRole: DocumentPartyUpsertInput["party_role"],
  metadata: Record<string, unknown> = {},
) => {
  return parsePersonList(value).map((person, index) =>
    buildPartyUpsert({
      partyRole,
      person,
      sortOrder: index,
      isSigningParty: false,
      metadata: {
        ...metadata,
        rowOrder: index,
      },
    }),
  );
};

export const deriveDocumentPartiesFromCanonicalAnswers = (
  canonicalAnswers: CanonicalAnswers,
) => {
  const parties: DocumentPartyUpsertInput[] = [];

  const principalName = asTrimmedString(canonicalAnswers.principal_full_name);
  if (principalName) {
    const principalContact = parseContactValue(canonicalAnswers.principal_contact);
    parties.push({
      party_role: "principal",
      full_name: principalName,
      email: principalContact.email,
      phone_country_code: principalContact.phoneCountryCode,
      phone: principalContact.phone,
      is_signing_party: true,
      sort_order: 0,
      metadata: principalContact.metadata,
    });
  }

  const agentName = asTrimmedString(canonicalAnswers.agent_full_name);
  if (agentName) {
    const agentContact = parseContactValue(canonicalAnswers.agent_contact);
    parties.push({
      party_role: "agent",
      full_name: agentName,
      email: agentContact.email,
      phone_country_code: agentContact.phoneCountryCode,
      phone: agentContact.phone,
      is_signing_party: false,
      sort_order: 0,
      metadata: agentContact.metadata,
    });
  }

  parties.push(...buildPersonListParties(canonicalAnswers.successor_agent_list, "successor_agent", {
    sourceField: "successor_agent_list",
  }));
  parties.push(...buildGrantorParties(canonicalAnswers));
  parties.push(...buildTrusteeParties(canonicalAnswers));
  parties.push(...buildPersonListParties(canonicalAnswers.successor_trustees, "successor_trustee", {
    sourceField: "successor_trustees",
  }));

  return parties;
};

export const syncDocumentPartiesFromCanonicalAnswers = async (input: {
  documentId: string;
  canonicalAnswers: CanonicalAnswers;
}) => {
  const parties = deriveDocumentPartiesFromCanonicalAnswers(input.canonicalAnswers);
  return replaceDocumentParties({
    documentId: input.documentId,
    parties,
  });
};

const partyRecordMatchesTrusteeSelection = (party: DocumentPartyRecord) => {
  return isRecord(party.metadata) && party.metadata.isSigningTrustee === true;
};

const formatContactDisplay = (value: unknown) => {
  const contact = parseContactValue(value);
  const segments = [contact.phone, contact.email].filter(
    (segment): segment is string => typeof segment === "string" && segment.trim().length > 0,
  );

  return segments.length > 0 ? segments.join(" / ") : null;
};

const formatPersonListDisplay = (value: unknown) => {
  const entries = parsePersonList(value).map((entry) => entry.fullName);
  return entries.length > 0 ? entries.join(", ") : null;
};

const formatPriorDocumentItemsDisplay = (value: unknown) => {
  if (!Array.isArray(value)) {
    return null;
  }

  const lines = value
    .map((item) => {
      const parsed = typeof item === "string" ? parseJsonString(item) : item;
      if (!isRecord(parsed)) {
        return null;
      }

      const title = asTrimmedString(parsed.title) || asTrimmedString(parsed.document_type);
      const date = formatLongDate(parsed.date) ?? asTrimmedString(parsed.date);

      if (!title && !date) {
        return null;
      }

      return [title, date].filter((segment) => segment && segment.length > 0).join(" - ");
    })
    .filter((line): line is string => typeof line === "string" && line.length > 0);

  return lines.length > 0 ? lines.join("; ") : null;
};

const formatTrusteeSignatureAuthority = (canonicalAnswers: CanonicalAnswers) => {
  const mode = asTrimmedString(canonicalAnswers.trustee_signature_authority);
  if (!mode) {
    return null;
  }

  if (mode === "custom") {
    return (
      asTrimmedString(canonicalAnswers.trustee_signature_authority_custom_text) ||
      trusteeSignatureAuthorityLabels[mode] ||
      mode
    );
  }

  return trusteeSignatureAuthorityLabels[mode] ?? mode;
};

const formatAgentSignatureAuthority = (value: unknown) => {
  const mode = asTrimmedString(value);
  if (!mode) {
    return null;
  }

  return agentSignatureAuthorityLabels[mode] ?? mode;
};

const formatRevocationHolders = (canonicalAnswers: CanonicalAnswers) => {
  const mode = asTrimmedString(canonicalAnswers.revocation_holders);
  if (!mode) {
    return null;
  }

  if (mode === "custom") {
    return (
      asTrimmedString(canonicalAnswers.revocation_holders_custom_text) ||
      revocationHolderLabels[mode] ||
      mode
    );
  }

  return revocationHolderLabels[mode] ?? mode;
};

const formatTrusteeIncapacityStandard = (value: unknown) => {
  const mode = asTrimmedString(value);
  if (!mode) {
    return null;
  }

  return trusteeIncapacityStandardLabels[mode] ?? mode;
};

export const toRenderableMemberValue = (canonicalKey: string, canonicalAnswers: CanonicalAnswers) => {
  const rawValue = canonicalAnswers[canonicalKey];

  switch (canonicalKey) {
    case "jurisdiction":
      return toJurisdictionDisplayName(rawValue);
    case "principal_contact":
    case "agent_contact":
      return formatContactDisplay(rawValue);
    case "grantors":
    case "trustees":
    case "successor_trustees":
    case "successor_agent_list":
      return formatPersonListDisplay(rawValue);
    case "prior_document_items":
      return formatPriorDocumentItemsDisplay(rawValue);
    case "trustee_signature_authority":
      return formatTrusteeSignatureAuthority(canonicalAnswers);
    case "agent_signature_authority":
      return formatAgentSignatureAuthority(rawValue);
    case "revocation_holders":
      return formatRevocationHolders(canonicalAnswers);
    case "trustee_incapacity_standard":
      return formatTrusteeIncapacityStandard(rawValue);
    case "trust_date":
    case "execution_date":
      return formatLongDate(rawValue) ?? asTrimmedString(rawValue);
    default:
      if (Array.isArray(rawValue)) {
        return rawValue
          .map((entry) => {
            if (typeof entry === "string") {
              const parsed = parseJsonString(entry);
              if (isRecord(parsed)) {
                return (
                  asTrimmedString(parsed.fullName) ||
                  asTrimmedString(parsed.title) ||
                  asTrimmedString(parsed.name) ||
                  entry.trim()
                );
              }
              return entry.trim();
            }

            if (isRecord(entry)) {
              return (
                asTrimmedString(entry.fullName) ||
                asTrimmedString(entry.title) ||
                asTrimmedString(entry.name) ||
                JSON.stringify(entry)
              );
            }

            return String(entry);
          })
          .filter((entry) => entry.length > 0)
          .join(", ");
      }

      if (typeof rawValue === "boolean") {
        return rawValue ? "Yes" : "No";
      }

      if (rawValue instanceof Date) {
        return formatLongDate(rawValue.toISOString());
      }

      if (isRecord(rawValue)) {
        return JSON.stringify(rawValue);
      }

      return asTrimmedString(rawValue);
  }
};

const getRequiredSignerPartyRoles = (documentKey: string) => {
  switch (documentKey) {
    case "poa_general":
      return ["principal"];
    case "trust_rrr":
      return ["grantor", "trustee"];
    case "trust_certificate":
      return ["trustee"];
    default:
      return [] as string[];
  }
};

const buildSignerObligation = (input: {
  party: DocumentPartyRecord;
  outputKey: string;
  documentKey: string;
  obligationType: DocumentOutputSignerUpsertInput["obligation_type"];
  signingGroup?: string | null;
  isRequired: boolean;
  resolutionSource: DocumentOutputSignerUpsertInput["resolution_source"];
  sortOrder: number;
  metadata?: Record<string, unknown>;
}): DocumentOutputSignerUpsertInput => {
  return {
    document_party_id: input.party.id,
    output_key: input.outputKey,
    document_key: input.documentKey,
    party_role: input.party.party_role,
    party_name: input.party.full_name,
    obligation_type: input.obligationType,
    signing_group: input.signingGroup ?? null,
    is_required: input.isRequired,
    resolution_source: input.resolutionSource,
    sort_order: input.sortOrder,
    metadata: {
      ...(input.metadata ?? {}),
      partyRole: input.party.party_role,
    },
  };
};

export const deriveSignerObligationsForRun = (input: {
  outputKey: string;
  documentKey: string;
  parties: DocumentPartyRecord[];
  canonicalAnswers: CanonicalAnswers;
}): DocumentOutputSignerUpsertInput[] => {
  const grantors = input.parties.filter((party) => party.party_role === "grantor");
  const trustees = input.parties.filter((party) => party.party_role === "trustee");
  const principal = input.parties.find((party) => party.party_role === "principal") ?? null;
  const obligations: DocumentOutputSignerUpsertInput[] = [];
  let sortOrder = 0;

  const append = (obligation: Omit<DocumentOutputSignerUpsertInput, "sort_order">) => {
    obligations.push({
      ...obligation,
      sort_order: sortOrder,
    });
    sortOrder += 1;
  };

  if (input.documentKey === "poa_general" && principal) {
    append({
      ...buildSignerObligation({
        party: principal,
        outputKey: input.outputKey,
        documentKey: input.documentKey,
        obligationType: "signer",
        signingGroup: "principal_only",
        isRequired: true,
        resolutionSource: "template",
        sortOrder: 0,
      }),
    });

    append({
      ...buildSignerObligation({
        party: principal,
        outputKey: input.outputKey,
        documentKey: input.documentKey,
        obligationType: "acknowledger",
        signingGroup: "principal_only",
        isRequired: true,
        resolutionSource: "template",
        sortOrder: 0,
      }),
    });

    return obligations;
  }

  if (input.documentKey === "trust_rrr") {
    for (const grantor of grantors) {
      append({
        ...buildSignerObligation({
          party: grantor,
          outputKey: input.outputKey,
          documentKey: input.documentKey,
          obligationType: "signer",
          signingGroup: "trustmakers_all",
          isRequired: true,
          resolutionSource: "template",
          sortOrder: 0,
        }),
      });
    }

    for (const grantor of grantors) {
      append({
        ...buildSignerObligation({
          party: grantor,
          outputKey: input.outputKey,
          documentKey: input.documentKey,
          obligationType: "acknowledger",
          signingGroup: "trustmakers_all",
          isRequired: true,
          resolutionSource: "template",
          sortOrder: 0,
        }),
      });
    }

    const authorityMode = asTrimmedString(input.canonicalAnswers.trustee_signature_authority);
    const customInstructions = asTrimmedString(
      input.canonicalAnswers.trustee_signature_authority_custom_text,
    );

    if (authorityMode === "named_signing_trustee") {
      for (const trustee of trustees.filter((party) => partyRecordMatchesTrusteeSelection(party))) {
        append({
          ...buildSignerObligation({
            party: trustee,
            outputKey: input.outputKey,
            documentKey: input.documentKey,
            obligationType: "signer",
            signingGroup: "trustees_named_one",
            isRequired: true,
            resolutionSource: "template",
            sortOrder: 0,
            metadata: {
              authorityMode,
            },
          }),
        });
      }

      return obligations;
    }

    for (const trustee of trustees) {
      append({
        ...buildSignerObligation({
          party: trustee,
          outputKey: input.outputKey,
          documentKey: input.documentKey,
          obligationType: "signer",
          signingGroup:
            authorityMode === "any_one_trustee"
              ? "trustees_any_one"
              : authorityMode === "custom"
                ? "trustees_custom"
                : "trustees_all",
          isRequired: authorityMode === "any_one_trustee" || authorityMode === "custom" ? false : true,
          resolutionSource: authorityMode === "custom" ? "manual_override" : "template",
          sortOrder: 0,
          metadata:
            authorityMode === "custom"
              ? {
                  authorityMode,
                  customInstructions,
                  groupMinimumRequired: 1,
                }
              : authorityMode === "any_one_trustee"
                ? {
                    authorityMode,
                    groupMinimumRequired: 1,
                  }
                : {
                    authorityMode: authorityMode || "all_trustees",
                  },
        }),
      });
    }

    return obligations;
  }

  if (input.documentKey === "trust_certificate") {
    for (const trustee of trustees) {
      append({
        ...buildSignerObligation({
          party: trustee,
          outputKey: input.outputKey,
          documentKey: input.documentKey,
          obligationType: "signer",
          signingGroup: "trustees_all",
          isRequired: true,
          resolutionSource: "template",
          sortOrder: 0,
          metadata: {
            templateOverride: true,
            note: "Certification of trust currently resolves trustees as the required signers.",
          },
        }),
      });
    }

    for (const trustee of trustees) {
      append({
        ...buildSignerObligation({
          party: trustee,
          outputKey: input.outputKey,
          documentKey: input.documentKey,
          obligationType: "acknowledger",
          signingGroup: "trustees_all",
          isRequired: true,
          resolutionSource: "template",
          sortOrder: 0,
        }),
      });
    }
  }

  return obligations;
};

const getSystemPlaceholderKey = (placeholder: string) => {
  switch (placeholder) {
    case "DarciNo":
    case "Trust.No":
    case "DdpoaNo":
      return "registry_number";
    case "Trust.RegDate":
      return "trust_registration_date";
    case "QR Code":
      return "verification_url";
    case "CA_Notarial_Acknowledgment_Block":
      return "ca_notarial_ack_template";
    default:
      return null;
  }
};

const buildCaliforniaAcknowledgmentTemplate = () => {
  return [
    "A notary public or other officer completing this certificate verifies only the identity of the individual who signed the document to which this certificate is attached, and not the truthfulness, accuracy, or validity of that document.",
    "",
    "State of California",
    "County of {{County}}",
    "",
    "On {{Day}} day of {{Month}} {{Year}}, before me, {{NotaryName}}, a notary public, personally appeared {{Acknowledgers}}, who proved to me on the basis of satisfactory evidence to be the person(s) whose name(s) is/are subscribed to the within instrument and acknowledged to me that he/she/they executed the same in his/her/their authorized capacity(ies), and that by his/her/their signature(s) on the instrument the person(s), or the entity upon behalf of which the person(s) acted, executed the instrument.",
    "",
    "I certify under penalty of perjury under the laws of the State of California that the foregoing paragraph is true and correct.",
    "",
    "Witness my hand and official seal.",
  ].join("\n");
};

export const ensureDocumentSystemValues = async (input: {
  document: DocumentRecord;
  draft: DocumentIntakeDraftRecord;
  canonicalAnswers: CanonicalAnswers;
}): Promise<EnsureDocumentSystemValuesResult> => {
  let document = input.document;
  const existing = await listDocumentSystemValues(document.id);
  const existingByKey = new Map(existing.map((value) => [value.system_key, value]));
  const valuesToUpsert: DocumentSystemValueUpsertInput[] = [];

  let registryNumber = asTrimmedString(existingByKey.get("registry_number")?.value_json);
  if (!registryNumber) {
    registryNumber = asTrimmedString(document.idn);
  }
  if (
    registryNumber.length > 0 &&
    existingByKey.get("registry_number")?.value_json !== registryNumber
  ) {
    valuesToUpsert.push({
      systemKey: "registry_number",
      value: registryNumber,
      source: "document_idn",
      metadata: {
        aliases: ["DarciNo", "Trust.No", "DdpoaNo"],
      },
    });
  }

  const trustRegistrationDate =
    asTrimmedString(existingByKey.get("trust_registration_date")?.value_json) ||
    formatLongDate(document.intake_submitted_at) ||
    formatLongDate(input.draft.updated_at) ||
    formatLongDate(new Date().toISOString()) ||
    "";
  if (
    existingByKey.get("trust_registration_date")?.value_json !== trustRegistrationDate &&
    trustRegistrationDate.length > 0
  ) {
    valuesToUpsert.push({
      systemKey: "trust_registration_date",
      value: trustRegistrationDate,
      source: "submission_timestamp",
      metadata: {
        submittedAt: document.intake_submitted_at ?? input.draft.updated_at,
      },
    });
  }

  const verificationUrl =
    registryNumber.length > 0
      ? asTrimmedString(existingByKey.get("verification_url")?.value_json) ||
        `https://www.darciregistry.com/verify/${encodeURIComponent(registryNumber)}`
      : "";
  if (
    verificationUrl.length > 0 &&
    existingByKey.get("verification_url")?.value_json !== verificationUrl
  ) {
    valuesToUpsert.push({
      systemKey: "verification_url",
      value: verificationUrl,
      source: "derived_url",
      metadata: {
        registryNumber,
      },
    });
  }

  const californiaNotarialAckTemplate =
    asTrimmedString(existingByKey.get("ca_notarial_ack_template")?.value_json) ||
    buildCaliforniaAcknowledgmentTemplate();
  if (
    existingByKey.get("ca_notarial_ack_template")?.value_json !== californiaNotarialAckTemplate
  ) {
    valuesToUpsert.push({
      systemKey: "ca_notarial_ack_template",
      value: californiaNotarialAckTemplate,
      source: "static_template_text",
      metadata: {
        jurisdiction: "US-CA",
      },
    });
  }

  const persisted = await upsertDocumentSystemValues({
    documentId: document.id,
    values: valuesToUpsert,
  });

  const systemValues = Object.fromEntries(
    persisted.map((value) => [value.system_key, toJsonPrimitive(value.value_json)]),
  );

  return {
    document,
    systemValues,
  };
};

const buildTemplateBindingsFromRules = (
  rules: TemplateBindingRuleRecord[],
  fields: DocumentExtractionField[],
) => {
  const canonicalKeysInDocument = new Set(fields.map((field) => field.canonicalKey));
  const sourceFieldKeysInDocument = new Set(fields.map((field) => field.sourceFieldKey));

  const templateBindings: DocumentTemplateBinding[] = rules.map((binding) => {
    if (
      binding.source === "system" ||
      binding.source === "notary" ||
      binding.source === "signing"
    ) {
      return {
        placeholder: binding.placeholder,
        description: binding.description,
        required: binding.required,
        source: binding.source,
        status: "system_value",
        ...(binding.canonicalKey ? { canonicalKey: binding.canonicalKey } : {}),
        ...(binding.notes ? { notes: binding.notes } : {}),
      };
    }

    const isMapped =
      (typeof binding.canonicalKey === "string" &&
        canonicalKeysInDocument.has(binding.canonicalKey)) ||
      (typeof binding.sourceFieldKey === "string" &&
        sourceFieldKeysInDocument.has(binding.sourceFieldKey));

    return {
      placeholder: binding.placeholder,
      description: binding.description,
      required: binding.required,
      source: binding.source,
      status: isMapped ? "mapped" : "missing_canonical_field",
      ...(binding.canonicalKey ? { canonicalKey: binding.canonicalKey } : {}),
      ...(binding.notes ? { notes: binding.notes } : {}),
    };
  });

  const templateCoverage: DocumentTemplateCoverage = {
    totalBindings: templateBindings.length,
    mappedBindings: templateBindings.filter((binding) => binding.status === "mapped").length,
    missingBindings: templateBindings.filter(
      (binding) => binding.status === "missing_canonical_field",
    ).length,
    systemBindings: templateBindings.filter((binding) => binding.status === "system_value").length,
  };

  return {
    templateBindings,
    templateCoverage,
  };
};

export const resolveExtractionDocumentForOutput = async (input: {
  extractionPayload: MemberFormDocumentExtractionPayload;
  documentKey: string;
}) => {
  const exactMatch = input.extractionPayload.documents.find(
    (entry) => entry.documentKey === input.documentKey,
  );
  if (exactMatch) {
    return exactMatch;
  }

  if (input.documentKey !== "trust_certificate") {
    return undefined;
  }

  const trustRrrDocument = input.extractionPayload.documents.find(
    (entry) => entry.documentKey === "trust_rrr",
  );
  if (!trustRrrDocument) {
    return undefined;
  }

  const rules = await getTemplateBindingRulesByDocumentKey("trust_certificate");
  const { templateBindings, templateCoverage } = buildTemplateBindingsFromRules(
    rules,
    trustRrrDocument.fields,
  );

  return {
    ...trustRrrDocument,
    documentKey: "trust_certificate",
    documentType: "certification",
    templateBindings,
    templateCoverage,
  } satisfies DocumentExtractionContract;
};

export const resolveOutputDocumentKey = (input: {
  outputKey: string;
  metadata: Record<string, unknown>;
  templateDocumentKey?: string;
}) => {
  const outputDocumentKeyFallbacks: Record<string, string> = {
    poa_document: "poa_general",
    trust_rrr: "trust_rrr",
    trust_certificate: "trust_certificate",
    uploaded_document_with_seal: "uploaded_document_with_seal",
  };

  if (input.templateDocumentKey?.trim()) {
    return input.templateDocumentKey.trim();
  }

  const metadataDocumentKey = input.metadata.documentKey;
  if (typeof metadataDocumentKey === "string" && metadataDocumentKey.trim()) {
    return metadataDocumentKey.trim();
  }

  return outputDocumentKeyFallbacks[input.outputKey] ?? input.outputKey;
};

export const buildResolvedSourcesSummary = (extractionDocument?: DocumentExtractionContract) => {
  const summary: Record<string, number> = {
    member_form: 0,
    system: 0,
    notary: 0,
    signing: 0,
  };

  for (const binding of extractionDocument?.templateBindings ?? []) {
    if (binding.source in summary) {
      summary[binding.source] = (summary[binding.source] ?? 0) + 1;
    }
  }

  return summary;
};

const isMissingRenderableValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
};

const renderCaliforniaAcknowledgmentBlock = (input: {
  templateValue: unknown;
  signerObligations: DocumentOutputSignerUpsertInput[];
}) => {
  const template = asTrimmedString(input.templateValue);
  if (!template) {
    return null;
  }

  const acknowledgers = input.signerObligations
    .filter((signer) => signer.obligation_type === "acknowledger")
    .map((signer) => signer.party_name)
    .filter((name) => name.trim().length > 0)
    .join(", ");

  return template
    .replaceAll("{{Acknowledgers}}", acknowledgers || "[Acknowledgers pending]")
    .replaceAll("{{County}}", "[County pending]")
    .replaceAll("{{Day}}", "[Day pending]")
    .replaceAll("{{Month}}", "[Month pending]")
    .replaceAll("{{Year}}", "[Year pending]")
    .replaceAll("{{NotaryName}}", "[Notary pending]");
};

const resolvePlaceholderValue = (input: {
  binding: DocumentTemplateBinding;
  canonicalAnswers: CanonicalAnswers;
  systemValues: Record<string, unknown>;
  signerObligations: DocumentOutputSignerUpsertInput[];
}) => {
  if (input.binding.source === "member_form") {
    const canonicalKey = input.binding.canonicalKey;
    if (!canonicalKey) {
      return null;
    }

    return toRenderableMemberValue(canonicalKey, input.canonicalAnswers);
  }

  if (input.binding.source === "system") {
    const systemKey = getSystemPlaceholderKey(input.binding.placeholder);
    if (!systemKey) {
      return null;
    }

    if (input.binding.placeholder === "CA_Notarial_Acknowledgment_Block") {
      return renderCaliforniaAcknowledgmentBlock({
        templateValue: input.systemValues[systemKey],
        signerObligations: input.signerObligations,
      });
    }

    return input.systemValues[systemKey] ?? null;
  }

  return null;
};

const getValidationAllowedValues = (validation: Record<string, unknown> | undefined) => {
  if (!validation || !Array.isArray(validation.allowed_values)) {
    return [] as string[];
  }

  return validation.allowed_values.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
};

const getValidationAllowedValueLabels = (
  validation: Record<string, unknown> | undefined,
) => {
  if (!validation || !validation.allowed_value_labels || typeof validation.allowed_value_labels !== "object") {
    return {} as Record<string, string>;
  }

  return Object.fromEntries(
    Object.entries(validation.allowed_value_labels)
      .filter(([key, value]) => key.trim().length > 0 && typeof value === "string" && value.trim().length > 0)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : ""]),
  );
};

const buildSelectionCatalogs = (extractionDocument?: DocumentExtractionContract) => {
  const fieldKeys = new Set(["authority_scope_selection", "trustee_power_matrix"]);
  const selectionCatalogs: Record<
    string,
    {
      allowedValues: string[];
      allowedValueLabels: Record<string, string>;
    }
  > = {};

  for (const field of extractionDocument?.fields ?? []) {
    if (!fieldKeys.has(field.sourceFieldKey)) {
      continue;
    }

    const allowedValues = getValidationAllowedValues(field.validation);
    const allowedValueLabels = getValidationAllowedValueLabels(field.validation);
    if (allowedValues.length === 0 && Object.keys(allowedValueLabels).length === 0) {
      continue;
    }

    selectionCatalogs[field.sourceFieldKey] = {
      allowedValues,
      allowedValueLabels,
    };
  }

  return selectionCatalogs;
};

export const buildGenerationRunBlockers = (input: {
  jurisdiction: string;
  outputKey: string;
  documentKey: string;
  templateResolved: boolean;
  templateArtifact: TemplateArtifactRecord | null;
  extractionDocument?: DocumentExtractionContract;
  signerObligations: DocumentOutputSignerUpsertInput[];
  placeholderValues: Record<string, unknown>;
  allowReviewDeferredSystemValues?: boolean;
}): GenerationRunBlockingRequirement[] => {
  const requirements: GenerationRunBlockingRequirement[] = [];

  if (!input.templateResolved) {
    requirements.push({
      code: "missing_template_registry",
      source: "system",
      field: input.outputKey,
      message: `No active template registry entry for ${input.jurisdiction}/${input.outputKey}.`,
      blocking: true,
    });
  }

  if (input.templateResolved && !input.templateArtifact) {
    requirements.push({
      code: "missing_template_artifact",
      source: "system",
      field: input.documentKey,
      message: `No active template artifact found for ${input.documentKey}.`,
      blocking: true,
    });
  }

  if (!input.extractionDocument) {
    requirements.push({
      code: "missing_render_context_value",
      source: "system",
      field: input.documentKey,
      message: `No extraction contract found for ${input.documentKey}.`,
      blocking: true,
    });
    return requirements;
  }

  const signerRoles = getRequiredSignerPartyRoles(input.documentKey);
  if (
    supportedSignerDocumentKeys.has(input.documentKey) &&
    signerRoles.length > 0 &&
    !input.signerObligations.some((obligation) => obligation.obligation_type === "signer")
  ) {
    requirements.push({
      code: "missing_signer_resolution",
      source: "system",
      field: input.documentKey,
      message: `No signer obligations could be resolved for ${input.documentKey}.`,
      blocking: true,
    });
  }

  for (const binding of input.extractionDocument.templateBindings ?? []) {
    if (!binding.required) {
      continue;
    }

    const resolvedValue = input.placeholderValues[binding.placeholder];
    const hasCanonicalKey =
      typeof binding.canonicalKey === "string" && binding.canonicalKey.trim().length > 0;

    if (binding.status === "missing_canonical_field") {
      if (hasCanonicalKey && !isMissingRenderableValue(resolvedValue)) {
        continue;
      }

      if (hasCanonicalKey) {
        requirements.push({
          code: "missing_render_context_value",
          source: binding.source,
          field: binding.placeholder,
          message: `Required placeholder ${binding.placeholder} does not have a member-form value in the submitted intake.`,
          blocking: true,
        });
        continue;
      }

      requirements.push({
        code: "unresolved_placeholder_mapping",
        source: binding.source,
        field: binding.placeholder,
        message: `Required placeholder ${binding.placeholder} is not mapped to an available canonical field.`,
        blocking: true,
      });
      continue;
    }

    if (binding.source === "member_form" && isMissingRenderableValue(resolvedValue)) {
      requirements.push({
        code: "missing_render_context_value",
        source: binding.source,
        field: binding.placeholder,
        message: `Required placeholder ${binding.placeholder} does not have a member-form value in the submitted intake.`,
        blocking: true,
      });
      continue;
    }

    if (binding.source === "system" && isMissingRenderableValue(resolvedValue)) {
      const systemKey = getSystemPlaceholderKey(binding.placeholder);
      const canDeferForReview =
        input.allowReviewDeferredSystemValues === true &&
        (systemKey === "registry_number" || systemKey === "verification_url");

      if (canDeferForReview) {
        requirements.push({
          code: "deferred_system_value",
          source: binding.source,
          field: binding.placeholder,
          message: `Required placeholder ${binding.placeholder} will be resolved after review approval.`,
          blocking: false,
        });
        continue;
      }

      requirements.push({
        code: "missing_system_value",
        source: binding.source,
        field: binding.placeholder,
        message: `Required placeholder ${binding.placeholder} depends on a system value that is not yet resolved.`,
        blocking: true,
      });
      continue;
    }

    if ((binding.source === "notary" || binding.source === "signing") && isMissingRenderableValue(resolvedValue)) {
      requirements.push({
        code: binding.source === "notary" ? "missing_notary_value" : "missing_signing_value",
        source: binding.source,
        field: binding.placeholder,
        message: `Required placeholder ${binding.placeholder} is deferred until the ${binding.source} stage.`,
        blocking: false,
      });
    }
  }

  if (
    input.signerObligations.some((obligation) => obligation.resolution_source === "manual_override")
  ) {
    requirements.push({
      code: "manual_signer_review",
      source: "system",
      field: input.documentKey,
      message: `Signer obligations for ${input.documentKey} include manual override instructions and should be reviewed before final execution.`,
      blocking: false,
    });
  }

  return requirements;
};

export const summarizeGenerationRunStatus = (
  blockers: GenerationRunBlockingRequirement[],
): DocumentGenerationRunRecord["status"] => {
  return blockers.some((blocker) => blocker.blocking) ? "blocked" : "queued";
};

export const prepareGenerationRun = async (input: {
  document: DocumentRecord;
  draft: DocumentIntakeDraftRecord;
  outputKey: string;
  outputMetadata: Record<string, unknown>;
  templateDocumentKey?: string;
  templateResolved: boolean;
  templateArtifact: TemplateArtifactRecord | null;
  templateKey: string;
  templateVersion: string;
  templateHash: string;
  extractionPayload: MemberFormDocumentExtractionPayload;
}) => {
  const canonicalAnswers = normalizeCanonicalAnswersForGeneration(
    input.draft.canonical_answers_json,
    input.draft,
  );
  let parties = await listDocumentParties(input.document.id);
  if (parties.length === 0 && Object.keys(canonicalAnswers).length > 0) {
    parties = await syncDocumentPartiesFromCanonicalAnswers({
      documentId: input.document.id,
      canonicalAnswers,
    });
  }

  const { document, systemValues } = await ensureDocumentSystemValues({
    document: input.document,
    draft: input.draft,
    canonicalAnswers,
  });

  const documentKey = resolveOutputDocumentKey({
    outputKey: input.outputKey,
    metadata: input.outputMetadata,
    ...(input.templateDocumentKey ? { templateDocumentKey: input.templateDocumentKey } : {}),
  });

  const extractionDocument = await resolveExtractionDocumentForOutput({
    extractionPayload: input.extractionPayload,
    documentKey,
  });

  const signerObligations = deriveSignerObligationsForRun({
    outputKey: input.outputKey,
    documentKey,
    parties,
    canonicalAnswers,
  });

  const placeholders = Object.fromEntries(
    (extractionDocument?.templateBindings ?? []).map((binding) => [
      binding.placeholder,
      resolvePlaceholderValue({
        binding,
        canonicalAnswers,
        systemValues,
        signerObligations,
      }),
    ]),
  );

  const blockingRequirements = buildGenerationRunBlockers({
    jurisdiction: input.draft.jurisdiction,
    outputKey: input.outputKey,
    documentKey,
    templateResolved: input.templateResolved,
    templateArtifact: input.templateArtifact,
    signerObligations,
    placeholderValues: placeholders,
    allowReviewDeferredSystemValues: input.document.status !== "pending_signature",
    ...(extractionDocument ? { extractionDocument } : {}),
  });
  const status = summarizeGenerationRunStatus(blockingRequirements);
  const selectionCatalogs = buildSelectionCatalogs(extractionDocument);

  const renderContext = {
    documentId: document.id,
    jurisdiction: input.draft.jurisdiction,
    productFlowMode: input.draft.product_flow_mode,
    rulesSnapshotVersion: input.draft.rules_snapshot_version,
    revision: input.draft.revision,
    documentKey,
    template: {
      templateKey: input.templateKey,
      templateVersion: input.templateVersion,
      templateHash: input.templateHash,
      ...(input.templateArtifact?.render_engine
        ? { renderEngine: input.templateArtifact.render_engine }
        : {}),
      ...(input.templateArtifact?.artifact_metadata
        ? { artifactMetadata: input.templateArtifact.artifact_metadata }
        : {}),
    },
    placeholders,
    canonicalAnswers,
    signerObligations,
    acknowledgers: signerObligations.filter(
      (obligation) => obligation.obligation_type === "acknowledger",
    ),
    systemValues,
    selectionCatalogs,
    deferredRequirements: blockingRequirements.filter((requirement) => !requirement.blocking),
  } satisfies Record<string, unknown>;

  const errorMessage = blockingRequirements.find((requirement) => requirement.blocking)?.message ?? null;

  return {
    document,
    documentKey,
    signerObligations,
    renderContext,
    blockingRequirements,
    resolvedSources: buildResolvedSourcesSummary(extractionDocument),
    status,
    errorMessage,
    ...(extractionDocument ? { extractionDocument } : {}),
  } satisfies PreparedGenerationRun;
};

export const mapDocumentOutputSignerResponse = (signer: DocumentOutputSignerRecord) => {
  return {
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
  };
};
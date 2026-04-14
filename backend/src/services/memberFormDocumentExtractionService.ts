import type {
  Condition,
  InputRequirementsContract,
  InputRequirementField,
  InputRequirementSection,
  NoticeSeverity,
} from "./inputRequirements";
import type { MemberFormRulesContract } from "./memberFormRulesService";

const DOCUMENT_FAMILIES = ["trust", "poa"] as const;

type DocumentFamily = (typeof DOCUMENT_FAMILIES)[number];

export type DocumentExtractionField = {
  canonicalKey: string;
  sourceFieldKey: string;
  sourceLabel: string;
  sourceRequired: boolean;
  sectionKey: string;
  sectionTitle: string;
  sectionPresence: string;
  label: string;
  semanticType: string;
  dataType: "string" | "integer" | "boolean" | "date" | "array" | "object";
  required: boolean;
  repeatable: boolean;
  collectFrom: "member" | "principal" | "agent" | "notary" | "witness" | "system" | "trustee";
  defaultSource:
    | "none"
    | "user_profile"
    | "jurisdiction_default"
    | "system_derived"
    | "document_template"
    | "previous_document";
  helpText?: string;
  validation?: Record<string, unknown>;
  when?: Condition;
};

export type DocumentExtractionOutput = {
  key: string;
  required: boolean;
  outputCategory?: "legal_requirement" | "operational_optional";
  when?: Condition;
};

export type DocumentExtractionNotice = {
  key: string;
  severity: NoticeSeverity;
  message: string;
  when?: Condition;
};

export type DocumentTemplateBindingStatus =
  | "mapped"
  | "missing_canonical_field"
  | "system_value";

export type DocumentTemplateBindingSource = "member_form" | "system" | "notary";

export type DocumentTemplateBinding = {
  placeholder: string;
  description: string;
  required: boolean;
  source: DocumentTemplateBindingSource;
  status: DocumentTemplateBindingStatus;
  canonicalKey?: string;
  notes?: string;
};

export type DocumentTemplateCoverage = {
  totalBindings: number;
  mappedBindings: number;
  missingBindings: number;
  systemBindings: number;
};

export type CanonicalFieldOccurrence = {
  documentKey: string;
  family: DocumentFamily;
  documentType: string;
  sourceFieldKey: string;
  required: boolean;
  collectFrom: DocumentExtractionField["collectFrom"];
};

export type CanonicalFieldIndexItem = {
  canonicalKey: string;
  inDocuments: CanonicalFieldOccurrence[];
};

export type DocumentExtractionContract = {
  documentKey: string;
  family: DocumentFamily;
  documentType: string;
  jurisdiction: string;
  uiProfile: string;
  derivationMode: string;
  reviewStatus: string;
  templateResolution: InputRequirementsContract["template_resolution"];
  classification: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  workflow: {
    steps: string[];
    requiredArtifacts: string[];
    submissionChecks: string[];
  };
  documentOutputs: DocumentExtractionOutput[];
  notices: DocumentExtractionNotice[];
  templateBindings: DocumentTemplateBinding[];
  templateCoverage: DocumentTemplateCoverage;
  sections: Array<{
    key: string;
    title: string;
    presence: string;
    repeatable: boolean;
    fieldCount: number;
  }>;
  fields: DocumentExtractionField[];
};

export type MemberFormDocumentExtractionPayload = {
  jurisdiction: string;
  generatedAt: string;
  families: DocumentFamily[];
  documents: DocumentExtractionContract[];
  canonicalFieldIndex: CanonicalFieldIndexItem[];
  sharedCanonicalKeys: string[];
};

const buildSourceKey = (
  family: string,
  documentType: string,
  sectionKey: string,
  fieldKey: string,
) => {
  return [family, documentType, sectionKey, fieldKey].join("|");
};

const toDocumentKey = (family: DocumentFamily, documentType: string) => {
  return `${family}_${documentType}`;
};

const isDocumentFamily = (family: string): family is DocumentFamily => {
  return DOCUMENT_FAMILIES.includes(family as DocumentFamily);
};

type TemplateBindingConfig = {
  placeholder: string;
  description: string;
  required: boolean;
  source: DocumentTemplateBindingSource;
  canonicalKey?: string;
  notes?: string;
};

const DOCUMENT_TEMPLATE_BINDINGS_CONFIG: Readonly<
  Record<string, ReadonlyArray<TemplateBindingConfig>>
> = {
  trust_rrr: [
    {
      placeholder: "TrustName",
      description: "Registered trust name shown in title and confirmation section.",
      required: true,
      source: "member_form",
      canonicalKey: "trust_name",
    },
    {
      placeholder: "DarciNo",
      description: "Registry number assigned to this DARCi trust registration.",
      required: true,
      source: "system",
      notes: "Issued by platform during registration.",
    },
    {
      placeholder: "Trustmaker(s)",
      description: "Trustmaker names.",
      required: true,
      source: "member_form",
      canonicalKey: "grantors",
    },
    {
      placeholder: "Document#.Name / Document#.Date",
      description:
        "Prior trust documents listed in chronology order, including the originating trust document followed by amendments and supporting records.",
      required: true,
      source: "member_form",
      canonicalKey: "prior_document_items",
      notes:
        "Preserve member-entered document order and chronology_order when assembling trust output context.",
    },
    {
      placeholder: "Trustee(s)",
      description: "Current trustees listed in title and signature blocks.",
      required: true,
      source: "member_form",
      canonicalKey: "trustees",
    },
    {
      placeholder: "TrustDate",
      description: "Trust creation date.",
      required: true,
      source: "member_form",
      canonicalKey: "trust_date",
    },
    {
      placeholder: "RevokePower",
      description: "Who may revoke the trust.",
      required: true,
      source: "member_form",
      canonicalKey: "revocation_holders",
    },
    {
      placeholder: "TaxSettlor",
      description: "Primary Trustmaker tax ID owner for trust operations.",
      required: true,
      source: "member_form",
      canonicalKey: "tax_id_owner",
    },
    {
      placeholder: "TrustState",
      description: "Governing state law.",
      required: true,
      source: "member_form",
      canonicalKey: "jurisdiction",
    },
    {
      placeholder: "SignatureAuthority",
      description: "Signature rule for trustees exercising powers.",
      required: true,
      source: "member_form",
      canonicalKey: "trustee_signature_authority",
    },
    {
      placeholder: "SignatureAuthorityCustomText",
      description: "Custom trustee signing instructions used when custom signature authority is selected.",
      required: false,
      source: "member_form",
      canonicalKey: "trustee_signature_authority_custom_text",
    },
    {
      placeholder: "Trustee powers checkboxes",
      description: "Transaction authority grid for trustee powers.",
      required: true,
      source: "member_form",
      canonicalKey: "trustee_powers",
    },
    {
      placeholder: "TrusteeIncapacityStandard",
      description: "Standard required to evidence trustee incapacity.",
      required: true,
      source: "member_form",
      canonicalKey: "trustee_incapacity_standard",
    },
    {
      placeholder: "TM1/TM2 signatures",
      description: "Trustmaker signature participants.",
      required: true,
      source: "member_form",
      canonicalKey: "grantors",
    },
    {
      placeholder: "Trustee1/Trustee2 signatures",
      description: "Trustee signature participants.",
      required: true,
      source: "member_form",
      canonicalKey: "trustees",
    },
    {
      placeholder: "County / Day / Month / Year",
      description: "Notarial acknowledgment date and venue details.",
      required: true,
      source: "notary",
      notes: "Collected in notary/execution phase.",
    },
    {
      placeholder: "Illuminotary",
      description: "Notary identity in acknowledgment block.",
      required: true,
      source: "notary",
    },
  ],
  poa_general: [
    {
      placeholder: "DdpoaNo",
      description: "DARCi DDPOA identifier.",
      required: true,
      source: "system",
      notes: "Issued by platform during POA creation.",
    },
    {
      placeholder: "Principal.FullName",
      description: "Principal full legal name.",
      required: true,
      source: "member_form",
      canonicalKey: "principal_full_name",
    },
    {
      placeholder: "Principal.Phone / Principal.Email",
      description: "Principal contact details.",
      required: true,
      source: "member_form",
      canonicalKey: "principal_contact",
    },
    {
      placeholder: "Agent[0].FullName",
      description: "Primary agent full legal name.",
      required: true,
      source: "member_form",
      canonicalKey: "agent_full_name",
    },
    {
      placeholder: "Agent[0].Phone / Agent[0].Email",
      description: "Primary agent contact details.",
      required: true,
      source: "member_form",
      canonicalKey: "agent_contact",
    },
    {
      placeholder: "Powers A-M / N",
      description: "Selected statutory authority scope checkboxes.",
      required: true,
      source: "member_form",
      canonicalKey: "authority_scope_selection",
    },
    {
      placeholder: "SpecialInstructions[text 6400]",
      description: "Special instructions clause content.",
      required: false,
      source: "member_form",
      canonicalKey: "special_instructions_text",
    },
    {
      placeholder: "Multiple Agents joint/separate rule",
      description: "How multiple agents act (jointly or independently).",
      required: true,
      source: "member_form",
      canonicalKey: "agent_signature_authority",
      notes: "Expected by DDPOA template language.",
    },
    {
      placeholder: "Execution day / month / year",
      description: "POA execution date.",
      required: true,
      source: "member_form",
      canonicalKey: "execution_date",
      notes: "May be captured at signing stage if not intake stage.",
    },
    {
      placeholder: "QR Code",
      description: "Rendered verification QR tied to DDPOA number.",
      required: true,
      source: "system",
    },
    {
      placeholder: "CA_Notarial_Acknowledgment_Block",
      description: "California acknowledgment text block.",
      required: true,
      source: "system",
      notes: "Selected from template resolution / execution profile.",
    },
  ],
};

const buildTemplateBindings = (
  documentKey: string,
  fields: DocumentExtractionField[],
): {
  templateBindings: DocumentTemplateBinding[];
  templateCoverage: DocumentTemplateCoverage;
} => {
  const configured = DOCUMENT_TEMPLATE_BINDINGS_CONFIG[documentKey] ?? [];
  const canonicalKeysInDocument = new Set(fields.map((field) => field.canonicalKey));

  const templateBindings = configured.map((binding): DocumentTemplateBinding => {
    if (binding.source === "system" || binding.source === "notary") {
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

    const canonicalKey = binding.canonicalKey;
    const isMapped =
      typeof canonicalKey === "string" && canonicalKeysInDocument.has(canonicalKey);

    return {
      placeholder: binding.placeholder,
      description: binding.description,
      required: binding.required,
      source: binding.source,
      status: isMapped ? "mapped" : "missing_canonical_field",
      ...(canonicalKey ? { canonicalKey } : {}),
      ...(binding.notes ? { notes: binding.notes } : {}),
    };
  });

  const templateCoverage: DocumentTemplateCoverage = {
    totalBindings: templateBindings.length,
    mappedBindings: templateBindings.filter((binding) => binding.status === "mapped").length,
    missingBindings: templateBindings.filter(
      (binding) => binding.status === "missing_canonical_field",
    ).length,
    systemBindings: templateBindings.filter((binding) => binding.status === "system_value")
      .length,
  };

  return {
    templateBindings,
    templateCoverage,
  };
};

const getDocumentTypeFromContract = (contract: InputRequirementsContract) => {
  if ("poa_type" in contract) {
    return contract.poa_type;
  }

  return contract.document_type;
};

const getFamilyFromContract = (contract: InputRequirementsContract): DocumentFamily | null => {
  if ("poa_type" in contract) {
    return "poa";
  }

  if ("trust_capabilities" in contract) {
    return "trust";
  }

  return null;
};

const getClassificationFromContract = (
  contract: InputRequirementsContract,
): Record<string, unknown> => {
  if ("poa_type" in contract) {
    return contract.classification as Record<string, unknown>;
  }

  if ("trust_capabilities" in contract) {
    return contract.classification as Record<string, unknown>;
  }

  return {};
};

const getCapabilitiesFromContract = (
  contract: InputRequirementsContract,
): Record<string, unknown> => {
  if ("poa_type" in contract) {
    return contract.poa_capabilities as Record<string, unknown>;
  }

  if ("trust_capabilities" in contract) {
    return contract.trust_capabilities as Record<string, unknown>;
  }

  return {};
};

const buildCanonicalKeyBySource = (memberForm: MemberFormRulesContract) => {
  const canonicalKeyBySource = new Map<string, string>();

  for (const section of memberForm.aggregatedForm.sections) {
    for (const field of section.fields) {
      for (const source of field.sources) {
        if (!isDocumentFamily(source.family)) {
          continue;
        }

        canonicalKeyBySource.set(
          buildSourceKey(
            source.family,
            source.document_type,
            source.section_key,
            source.field_key,
          ),
          field.canonical_key,
        );
      }
    }
  }

  return canonicalKeyBySource;
};

const toExtractionField = (
  family: DocumentFamily,
  documentType: string,
  section: InputRequirementSection,
  field: InputRequirementField,
  canonicalKeyBySource: Map<string, string>,
): DocumentExtractionField => {
  const canonicalKey =
    canonicalKeyBySource.get(
      buildSourceKey(family, documentType, section.key, field.key),
    ) ?? field.key;

  const validation =
    canonicalKey === "prior_document_items"
      ? {
          ...(field.validation ?? {}),
          chronology_ordering: "array_order_then_chronology_order",
          originating_document_position: 1,
          originating_document_allowed_types: [
            "trust_agreement",
            "declaration_of_trust",
          ],
          required_chain_context_fields: [
            "document_type",
            "title",
            "date",
            "recording_reference",
            "chronology_order",
          ],
        }
      : field.validation;

  return {
    canonicalKey,
    sourceFieldKey: field.key,
    sourceLabel: field.label,
    sourceRequired: field.required,
    sectionKey: section.key,
    sectionTitle: section.title,
    sectionPresence: section.presence,
    label: field.label,
    semanticType: field.semantic_type,
    dataType: field.data_type,
    required: field.required,
    repeatable: section.repeatable,
    collectFrom: field.collect_from,
    defaultSource: field.default_source,
    ...(field.help_text ? { helpText: field.help_text } : {}),
    ...(validation ? { validation } : {}),
    ...(field.when ? { when: field.when } : {}),
  };
};

const buildCanonicalFieldIndex = (documents: DocumentExtractionContract[]) => {
  const index = new Map<string, CanonicalFieldOccurrence[]>();

  for (const document of documents) {
    for (const field of document.fields) {
      const current = index.get(field.canonicalKey) ?? [];
      current.push({
        documentKey: document.documentKey,
        family: document.family,
        documentType: document.documentType,
        sourceFieldKey: field.sourceFieldKey,
        required: field.required,
        collectFrom: field.collectFrom,
      });
      index.set(field.canonicalKey, current);
    }
  }

  return [...index.entries()]
    .map(([canonicalKey, inDocuments]) => ({
      canonicalKey,
      inDocuments: inDocuments.sort((left, right) => {
        const leftKey = `${left.documentKey}|${left.sourceFieldKey}`;
        const rightKey = `${right.documentKey}|${right.sourceFieldKey}`;
        return leftKey.localeCompare(rightKey);
      }),
    }))
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey));
};

export const buildMemberFormDocumentExtractionPayload = (
  memberForm: MemberFormRulesContract,
): MemberFormDocumentExtractionPayload => {
  const canonicalKeyBySource = buildCanonicalKeyBySource(memberForm);

  const documents: DocumentExtractionContract[] = [];

  for (const familyContract of memberForm.familyContracts) {
    const family = getFamilyFromContract(familyContract.inputRequirements);
    if (!family) {
      continue;
    }

    const documentType = getDocumentTypeFromContract(familyContract.inputRequirements);
    const documentKey = toDocumentKey(family, documentType);

    const sections = familyContract.inputRequirements.sections.filter(
      (section) => section.presence !== "hidden",
    );

    const fields = sections
      .flatMap((section) => {
        return section.fields.map((field) =>
          toExtractionField(
            family,
            documentType,
            section,
            field,
            canonicalKeyBySource,
          ),
        );
      })
      .sort((left, right) => {
        const leftKey = `${left.sectionKey}|${left.sourceFieldKey}`;
        const rightKey = `${right.sectionKey}|${right.sourceFieldKey}`;
        return leftKey.localeCompare(rightKey);
      });

    const { templateBindings, templateCoverage } = buildTemplateBindings(
      documentKey,
      fields,
    );

    documents.push({
      documentKey,
      family,
      documentType,
      jurisdiction: familyContract.inputRequirements.jurisdiction,
      uiProfile: familyContract.inputRequirements.ui_profile,
      derivationMode: familyContract.inputRequirements.derivation_mode,
      reviewStatus: familyContract.inputRequirements.review_status,
      templateResolution: familyContract.inputRequirements.template_resolution,
      classification: getClassificationFromContract(familyContract.inputRequirements),
      capabilities: getCapabilitiesFromContract(familyContract.inputRequirements),
      workflow: {
        steps: familyContract.inputRequirements.workflow.steps,
        requiredArtifacts: familyContract.inputRequirements.workflow.required_artifacts,
        submissionChecks: familyContract.inputRequirements.workflow.submission_checks,
      },
      documentOutputs: familyContract.inputRequirements.document_outputs,
      notices: familyContract.inputRequirements.notices,
      templateBindings,
      templateCoverage,
      sections: sections.map((section) => ({
        key: section.key,
        title: section.title,
        presence: section.presence,
        repeatable: section.repeatable,
        fieldCount: section.fields.length,
      })),
      fields,
    });
  }

  documents.sort((left, right) => left.documentKey.localeCompare(right.documentKey));

  const canonicalFieldIndex = buildCanonicalFieldIndex(documents);
  const sharedCanonicalKeys = canonicalFieldIndex
    .filter((item) => new Set(item.inDocuments.map((entry) => entry.documentKey)).size > 1)
    .map((item) => item.canonicalKey)
    .sort((left, right) => left.localeCompare(right));

  return {
    jurisdiction: memberForm.jurisdiction,
    generatedAt: new Date().toISOString(),
    families: [...DOCUMENT_FAMILIES],
    documents,
    canonicalFieldIndex,
    sharedCanonicalKeys,
  };
};

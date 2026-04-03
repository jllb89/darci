import {
  deriveInputRequirements,
  normalizePoaDocumentType,
  type InputRequirementsContract,
} from "./inputRequirements";
import {
  getIdnRequirement,
  idnDocumentTypes,
  listIdnJurisdictions,
  type IdnDocumentType,
} from "./idnService";
import {
  deriveMemberFacingFormContract,
  type MemberFacingFormContract,
} from "./memberInputAggregator";
import {
  getPoaRequirementDetails,
  listPoaJurisdictions,
  normalizeJurisdiction,
  poaTypes,
  type PoaGlossaryTermRecord,
} from "./poaService";
import {
  getTrustRequirement,
  listTrustJurisdictions,
  trustDocumentTypes,
  type TrustDocumentType,
} from "./trustService";

export const memberFormFamilies = ["poa", "trust", "idn"] as const;

export type MemberFormFamily = (typeof memberFormFamilies)[number];
type PoaDocumentType = (typeof poaTypes)[number];

export type MemberFormSelection = {
  families: MemberFormFamily[];
  poaType: PoaDocumentType;
  trustType: TrustDocumentType;
  idnType: IdnDocumentType;
};

const MEMBER_FORM_INTAKE_FAMILIES = ["poa", "trust"] as const;

export type ConditionFactValue = string | string[] | boolean | null;

export type FamilyFactContext = {
  family: MemberFormFamily;
  documentType: string;
  facts: Record<string, ConditionFactValue>;
};

export type SourceConditionContext = {
  family: MemberFormFamily;
  documentType: string;
  sectionKey: string;
  fieldKey: string;
  facts: Record<string, ConditionFactValue>;
};

export type MemberFormRulesContract = {
  jurisdiction: string;
  families: MemberFormFamily[];
  documentTypes: string[];
  aggregatedForm: MemberFacingFormContract;
  familyContracts: Array<{
    family: MemberFormFamily;
    documentType: string;
    inputRequirements: InputRequirementsContract;
    factContext: Record<string, ConditionFactValue>;
  }>;
  sourceConditionContexts: SourceConditionContext[];
};

export type MissingFamilyRequirement = {
  family: MemberFormFamily;
  documentType: string;
};

export type MemberFormRulesByJurisdictionResult = {
  contract: MemberFormRulesContract | null;
  missing: MissingFamilyRequirement[];
};

const BASELINE_FACTS = [
  "document_type",
  "manual_review_required",
  "execution_model",
  "acknowledgment_profile",
  "capability_special_authority_initials_required",
  "capability_springing_authority_supported",
] as const;

const POA_FIELD_GLOSSARY_KEYS: Readonly<Record<string, string>> = {
  principal_full_name: "principal",
  principal_address: "principal",
  principal_contact: "principal",
  agent_full_name: "agent",
  agent_address: "agent",
  agent_contact: "agent",
  successor_agent_list: "successor_agent",
  authority_scope_selection: "special_authority",
  special_authority_initials: "special_authority",
  springing_trigger_description: "springing_power",
  special_instructions_text: "special_instructions",
};

const MEMBER_FORM_FALLBACK_HELP_TEXT_BY_FIELD_KEY: Readonly<Record<string, string>> = {
  jurisdiction:
    "Choose the jurisdiction that controls document requirements and execution rules.",
  poa_type:
    "Choose the Power of Attorney type so DARCi can apply the right state-specific rule set.",
  trust_name:
    "Enter the legal trust name exactly as shown in the governing trust instrument.",
  trust_date:
    "Use the trust execution date from the governing trust instrument.",
  revocability_status:
    "Indicate whether the trust is revocable, irrevocable, or limited by specific conditions.",
  revocation_holders:
    "List any person(s) who hold authority to revoke or amend the trust under the governing instrument.",
  trustee_signature_authority:
    "Describe who must sign when multiple trustees are serving (for example, all trustees or any one trustee).",
  tax_id_owner:
    "Identify whether the trust, grantor, or trustee reports the trust tax identification for transaction context.",
  asset_titling_format:
    "Describe how trust assets should be titled in transaction documents.",
  restatement_summary:
    "Summarize the key changes reflected in this restatement request.",
  key_trust_terms:
    "Capture the key trust terms that should be preserved in generated trust outputs.",
  trustee_incapacity_standard:
    "Describe the standard used to determine trustee incapacity under the trust instrument.",
  trustee_power_matrix:
    "Summarize trustee powers relevant to third-party transactions and any limits that apply.",
  prior_document_items:
    "List prior trust documents or amendments that should be considered during generation.",
  uploaded_document_file:
    "Upload the source document so DARCi can extract and validate required trust details.",
};

export const applyPoaGlossaryHelpText = (
  contract: InputRequirementsContract,
  glossary: Pick<PoaGlossaryTermRecord, "glossary_key" | "product_description">[],
): InputRequirementsContract => {
  if (!("poa_type" in contract) || glossary.length === 0) {
    return contract;
  }

  const glossaryByKey = new Map(
    glossary
      .filter(
        (term): term is Pick<PoaGlossaryTermRecord, "glossary_key" | "product_description"> =>
          Boolean(term.glossary_key) && Boolean(term.product_description),
      )
      .map((term) => [term.glossary_key, term.product_description]),
  );

  if (glossaryByKey.size === 0) {
    return contract;
  }

  return {
    ...contract,
    sections: contract.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        const glossaryKey = POA_FIELD_GLOSSARY_KEYS[field.key];
        if (!glossaryKey) {
          return field;
        }

        const glossaryHelpText = glossaryByKey.get(glossaryKey);
        if (!glossaryHelpText) {
          return field;
        }

        return {
          ...field,
          help_text: glossaryHelpText,
        };
      }),
    })),
  };
};

export const applyMemberFormFallbackHelpText = (
  contract: InputRequirementsContract,
): InputRequirementsContract => {
  return {
    ...contract,
    sections: contract.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        if (field.collect_from !== "member" || field.help_text) {
          return field;
        }

        const fallbackHelpText = MEMBER_FORM_FALLBACK_HELP_TEXT_BY_FIELD_KEY[field.key];
        if (!fallbackHelpText) {
          return field;
        }

        return {
          ...field,
          help_text: fallbackHelpText,
        };
      }),
    })),
  };
};

const getFamilyAndDocumentType = (
  contract: InputRequirementsContract,
): { family: MemberFormFamily; documentType: string } => {
  if ("poa_type" in contract) {
    return {
      family: "poa",
      documentType: contract.poa_type,
    };
  }

  if ("trust_capabilities" in contract) {
    return {
      family: "trust",
      documentType: contract.document_type,
    };
  }

  return {
    family: "idn",
    documentType: contract.document_type,
  };
};

const normalizeFamilies = (families: MemberFormFamily[]) => {
  const unique = new Set<MemberFormFamily>();

  for (const family of memberFormFamilies) {
    if (families.includes(family)) {
      unique.add(family);
    }
  }

  return [...unique.values()];
};

const getDefaultSelection = (): MemberFormSelection => {
  return {
    families: [...MEMBER_FORM_INTAKE_FAMILIES],
    poaType: "general",
    trustType: "rrr",
    idnType: "acknowledgment",
  };
};

export const buildMemberFormIntakeSelection = (): MemberFormSelection => {
  return getDefaultSelection();
};

export const buildMemberFormSelection = (
  input: Partial<MemberFormSelection> = {},
): MemberFormSelection => {
  const defaults = getDefaultSelection();
  const normalizedFamilies = normalizeFamilies(input.families ?? defaults.families);

  return {
    families: normalizedFamilies.length ? normalizedFamilies : defaults.families,
    poaType: input.poaType ?? defaults.poaType,
    trustType: input.trustType ?? defaults.trustType,
    idnType: input.idnType ?? defaults.idnType,
  };
};

const resolveFactValue = (
  contract: InputRequirementsContract,
  fact: string,
): ConditionFactValue => {
  switch (fact) {
    case "document_type": {
      return "poa_type" in contract ? contract.poa_type : contract.document_type;
    }
    case "manual_review_required": {
      return (
        contract.derivation_mode === "manual_review" ||
        contract.review_status === "needs_review"
      );
    }
    case "execution_model": {
      if ("poa_type" in contract) {
        return contract.classification.execution_model;
      }

      return null;
    }
    case "acknowledgment_profile": {
      return contract.template_resolution.acknowledgment_profile ?? null;
    }
    case "capability_special_authority_initials_required": {
      if ("poa_type" in contract) {
        return contract.poa_capabilities.special_authority_initials_required;
      }

      return null;
    }
    case "capability_springing_authority_supported": {
      if ("poa_type" in contract) {
        return contract.poa_capabilities.springing_authority_supported;
      }

      return null;
    }
    default:
      return null;
  }
};

const collectFactsFromContract = (contract: InputRequirementsContract) => {
  const facts = new Set<string>(BASELINE_FACTS);

  for (const section of contract.sections) {
    for (const field of section.fields) {
      for (const clause of field.when?.all ?? []) {
        facts.add(clause.fact);
      }
    }
  }

  for (const output of contract.document_outputs) {
    for (const clause of output.when?.all ?? []) {
      facts.add(clause.fact);
    }
  }

  for (const notice of contract.notices) {
    for (const clause of notice.when?.all ?? []) {
      facts.add(clause.fact);
    }
  }

  return [...facts.values()].sort((left, right) => left.localeCompare(right));
};

export const buildContractFactContext = (
  contract: InputRequirementsContract,
): Record<string, ConditionFactValue> => {
  const facts = collectFactsFromContract(contract);

  return Object.fromEntries(
    facts.map((fact) => [fact, resolveFactValue(contract, fact)]),
  );
};

const buildSourceConditionContexts = (
  aggregatedForm: MemberFacingFormContract,
  familyFactContextByKey: Map<string, FamilyFactContext>,
): SourceConditionContext[] => {
  const unique = new Map<string, SourceConditionContext>();

  for (const section of aggregatedForm.sections) {
    for (const field of section.fields) {
      for (const source of field.sources) {
        const familyKey = `${source.family}|${source.document_type}`;
        const context = familyFactContextByKey.get(familyKey);

        if (!context) {
          continue;
        }

        const sourceKey = [
          source.family,
          source.document_type,
          source.section_key,
          source.field_key,
        ].join("|");

        if (unique.has(sourceKey)) {
          continue;
        }

        unique.set(sourceKey, {
          family: source.family,
          documentType: source.document_type,
          sectionKey: source.section_key,
          fieldKey: source.field_key,
          facts: context.facts,
        });
      }
    }
  }

  return [...unique.values()].sort((left, right) => {
    const leftKey = `${left.family}|${left.documentType}|${left.sectionKey}|${left.fieldKey}`;
    const rightKey = `${right.family}|${right.documentType}|${right.sectionKey}|${right.fieldKey}`;

    return leftKey.localeCompare(rightKey);
  });
};

export const buildMemberFormRulesContract = (
  contracts: InputRequirementsContract[],
): MemberFormRulesContract => {
  const aggregatedForm = deriveMemberFacingFormContract(contracts);
  const familyContracts = contracts
    .map((contract) => {
      const { family, documentType } = getFamilyAndDocumentType(contract);

      return {
        family,
        documentType,
        inputRequirements: contract,
        factContext: buildContractFactContext(contract),
      };
    })
    .sort((left, right) => {
      const leftKey = `${left.family}|${left.documentType}`;
      const rightKey = `${right.family}|${right.documentType}`;

      return leftKey.localeCompare(rightKey);
    });

  const familyFactContextByKey = new Map<string, FamilyFactContext>(
    familyContracts.map((familyContract) => [
      `${familyContract.family}|${familyContract.documentType}`,
      {
        family: familyContract.family,
        documentType: familyContract.documentType,
        facts: familyContract.factContext,
      },
    ]),
  );

  return {
    jurisdiction: aggregatedForm.jurisdiction,
    families: aggregatedForm.families,
    documentTypes: aggregatedForm.document_types,
    aggregatedForm,
    familyContracts,
    sourceConditionContexts: buildSourceConditionContexts(
      aggregatedForm,
      familyFactContextByKey,
    ),
  };
};

type JurisdictionOption = {
  code: string;
  label: string;
};

const intersectJurisdictionLists = (lists: JurisdictionOption[][]) => {
  if (lists.length === 0) {
    return [];
  }

  const firstList = lists[0];
  if (!firstList) {
    return [];
  }

  const intersection = new Set(firstList.map((item) => item.code));

  for (const list of lists.slice(1)) {
    const nextCodes = new Set(list.map((item) => item.code));

    for (const code of [...intersection.values()]) {
      if (!nextCodes.has(code)) {
        intersection.delete(code);
      }
    }
  }

  return firstList.filter((item) => intersection.has(item.code));
};

export const listMemberFormJurisdictions = async (
  selection: MemberFormSelection,
): Promise<JurisdictionOption[]> => {
  const lists: JurisdictionOption[][] = [];

  if (selection.families.includes("poa")) {
    lists.push(await listPoaJurisdictions(selection.poaType));
  }

  if (selection.families.includes("trust")) {
    lists.push(await listTrustJurisdictions(selection.trustType));
  }

  if (selection.families.includes("idn")) {
    lists.push(await listIdnJurisdictions(selection.idnType));
  }

  return intersectJurisdictionLists(lists);
};

const buildContractsBySelection = async (
  jurisdiction: string,
  selection: MemberFormSelection,
): Promise<{
  contracts: InputRequirementsContract[];
  missing: MissingFamilyRequirement[];
}> => {
  const contracts: InputRequirementsContract[] = [];
  const missing: MissingFamilyRequirement[] = [];

  if (selection.families.includes("poa")) {
    const poaDetails = await getPoaRequirementDetails(jurisdiction, selection.poaType);

    if (!poaDetails) {
      missing.push({
        family: "poa",
        documentType: selection.poaType,
      });
    } else {
      const poaContract = deriveInputRequirements({
        family: "poa",
        documentType: normalizePoaDocumentType(selection.poaType),
        record: poaDetails.requirement,
      });

      contracts.push(
        applyMemberFormFallbackHelpText(
          applyPoaGlossaryHelpText(poaContract, poaDetails.glossary),
        ),
      );
    }
  }

  if (selection.families.includes("trust")) {
    const trustRequirement = await getTrustRequirement(
      jurisdiction,
      selection.trustType,
    );

    if (!trustRequirement) {
      missing.push({
        family: "trust",
        documentType: selection.trustType,
      });
    } else {
      contracts.push(
        applyMemberFormFallbackHelpText(
          deriveInputRequirements({
            family: "trust",
            documentType: selection.trustType,
            record: trustRequirement,
          }),
        ),
      );
    }
  }

  if (selection.families.includes("idn")) {
    const idnRequirement = await getIdnRequirement(jurisdiction, selection.idnType);

    if (!idnRequirement) {
      missing.push({
        family: "idn",
        documentType: selection.idnType,
      });
    } else {
      contracts.push(
        applyMemberFormFallbackHelpText(
          deriveInputRequirements({
            family: "idn",
            documentType: selection.idnType,
            record: idnRequirement,
          }),
        ),
      );
    }
  }

  return {
    contracts,
    missing,
  };
};

export const deriveMemberFormRulesByJurisdiction = async (
  jurisdiction: string,
  selection: MemberFormSelection,
): Promise<MemberFormRulesByJurisdictionResult> => {
  const normalizedJurisdiction = normalizeJurisdiction(jurisdiction);
  const { contracts, missing } = await buildContractsBySelection(
    normalizedJurisdiction,
    selection,
  );

  if (missing.length > 0) {
    return {
      contract: null,
      missing,
    };
  }

  return {
    contract: buildMemberFormRulesContract(contracts),
    missing: [],
  };
};

export const memberFormTypeEnums = {
  poaTypes,
  trustDocumentTypes,
  idnDocumentTypes,
};

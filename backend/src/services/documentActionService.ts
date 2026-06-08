import {
  listDocumentGenerationRuns,
  listDocumentOutputSigners,
  listDocumentParties,
  listDocumentSignatures,
  type DocumentGenerationRunRecord,
  type DocumentOutputSignerRecord,
  type DocumentPartyRecord,
  type DocumentRecord,
  type SignatureRecord,
} from "./documentService";

export type DocumentTypeLabel = "Trust" | "POA" | "Document notarization" | "Document";

export type DocumentNextActionCode =
  | "complete_intake"
  | "resolve_review_blockers"
  | "collect_signatures"
  | "finalize_and_download"
  | "no_action_required";

export type DocumentNextAction = {
  code: DocumentNextActionCode;
  label: string;
  description: string;
  targetPath: string;
  priority: "high" | "medium" | "low";
};

export type DocumentSignerSummary = {
  signers: Array<{
    signerId: string;
    role: string;
    roleLabel: string;
    name: string | null;
    status: "pending" | "signed";
    isRequired: boolean;
  }>;
  signerRoles: string[];
  pendingSignerRoles: string[];
  pendingRequiredSignatureCount: number;
};

export type DocumentActionEnrichment = {
  documentTypeLabel: DocumentTypeLabel;
  principalName: string | null;
  signerSummary: DocumentSignerSummary;
  nextAction: DocumentNextAction;
};

const roleLabels: Record<string, string> = {
  principal: "Principal",
  agent: "Agent",
  successor_agent: "Successor agent",
  grantor: "Trustmaker",
  trustee: "Trustee",
  successor_trustee: "Successor trustee",
  trustmaker: "Trustmaker",
  witness: "Witness",
  notary: "Notary",
};

const normalize = (value?: string | null) => value?.trim().toLowerCase() ?? "";

const toTitleWords = (value: string) => {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
};

export const resolveDocumentTypeLabel = (document: Pick<
  DocumentRecord,
  "document_type" | "product_flow_mode" | "selected_families"
>): DocumentTypeLabel => {
  const selectedFamilies = (document.selected_families ?? []).map((entry) => normalize(entry));

  if (selectedFamilies.includes("trust")) {
    return "Trust";
  }

  if (selectedFamilies.includes("poa")) {
    return "POA";
  }

  if (selectedFamilies.includes("idn")) {
    return "Document notarization";
  }

  const productFlowMode = normalize(document.product_flow_mode);
  if (productFlowMode.includes("trust")) {
    return "Trust";
  }

  if (productFlowMode.includes("poa") || productFlowMode.includes("power")) {
    return "POA";
  }

  if (productFlowMode.includes("idn") || productFlowMode.includes("notar")) {
    return "Document notarization";
  }

  const documentType = normalize(document.document_type);
  if (documentType.includes("trust")) {
    return "Trust";
  }

  if (documentType.includes("poa") || documentType.includes("power")) {
    return "POA";
  }

  if (documentType.includes("idn") || documentType.includes("notar")) {
    return "Document notarization";
  }

  return "Document";
};

export const getRoleLabel = (role: string | null | undefined) => {
  const normalized = normalize(role);
  return roleLabels[normalized] ?? toTitleWords(normalized || "signer");
};

export const resolvePrincipalName = (parties: DocumentPartyRecord[]) => {
  const preferredRoles = ["principal", "grantor", "trustee"];

  for (const role of preferredRoles) {
    const party = parties.find(
      (candidate) => candidate.party_role === role && candidate.full_name.trim().length > 0,
    );
    if (party) {
      return party.full_name.trim();
    }
  }

  return (
    parties.find((party) => party.full_name.trim().length > 0)?.full_name.trim() ?? null
  );
};

const getLatestRunIdsByOutput = (generationRuns: DocumentGenerationRunRecord[]) => {
  const latestRunIdsByOutput = new Map<string, string>();

  for (const run of generationRuns) {
    if (!latestRunIdsByOutput.has(run.output_key)) {
      latestRunIdsByOutput.set(run.output_key, run.id);
    }
  }

  return new Set(latestRunIdsByOutput.values());
};

export const filterCurrentSignerObligations = (input: {
  signers: DocumentOutputSignerRecord[];
  generationRuns: DocumentGenerationRunRecord[];
}) => {
  const latestRunIds = getLatestRunIdsByOutput(input.generationRuns);
  if (latestRunIds.size === 0) {
    return input.signers;
  }

  const currentSigners = input.signers.filter((signer) =>
    latestRunIds.has(signer.generation_run_id),
  );

  return currentSigners.length > 0 ? currentSigners : input.signers;
};

export const buildCapturedOutputSignerIds = (signatures: SignatureRecord[]) => {
  const capturedOutputSignerIds = new Set<string>();

  for (const signature of signatures) {
    if (signature.status === "captured" && signature.document_output_signer_id) {
      capturedOutputSignerIds.add(signature.document_output_signer_id);
    }
  }

  return capturedOutputSignerIds;
};

export const buildDocumentSignerSummary = (input: {
  signers: DocumentOutputSignerRecord[];
  signatures: SignatureRecord[];
}) => {
  const capturedOutputSignerIds = buildCapturedOutputSignerIds(input.signatures);
  const signerObligations = input.signers.filter(
    (signer) => signer.obligation_type === "signer",
  );
  const signers = signerObligations.map((signer) => {
    const status = capturedOutputSignerIds.has(signer.id) ? "signed" : "pending";

    return {
      signerId: signer.id,
      role: signer.party_role,
      roleLabel: getRoleLabel(signer.party_role),
      name: signer.party_name?.trim() || null,
      status,
      isRequired: signer.is_required,
    } satisfies DocumentSignerSummary["signers"][number];
  });
  const signerRoles = Array.from(new Set(signers.map((signer) => signer.roleLabel)));
  const pendingRequiredSigners = signers.filter(
    (signer) => signer.isRequired && signer.status === "pending",
  );

  return {
    signers,
    signerRoles,
    pendingSignerRoles: Array.from(
      new Set(pendingRequiredSigners.map((signer) => signer.roleLabel)),
    ),
    pendingRequiredSignatureCount: pendingRequiredSigners.length,
  } satisfies DocumentSignerSummary;
};

export const buildDocumentNextAction = (input: {
  document: DocumentRecord;
  signerSummary: DocumentSignerSummary;
}) => {
  const documentId = encodeURIComponent(input.document.id);
  const status = normalize(input.document.status);
  const intakeStatus = normalize(input.document.intake_status);

  if (
    intakeStatus === "draft" ||
    status === "draft" ||
    status.includes("intake")
  ) {
    return {
      code: "complete_intake",
      label: "Continue",
      description: "Complete intake so the document can move to review.",
      targetPath: `/app/start?documentId=${documentId}`,
      priority: "high",
    } satisfies DocumentNextAction;
  }

  if (status.includes("blocked") || status.includes("review")) {
    return {
      code: "resolve_review_blockers",
      label: status.includes("blocked") ? "Fix blockers" : "Review document",
      description: "Review document outputs and resolve any blocking issues.",
      targetPath: `/app/review?documentId=${documentId}`,
      priority: status.includes("blocked") ? "high" : "medium",
    } satisfies DocumentNextAction;
  }

  if (input.signerSummary.pendingRequiredSignatureCount > 0) {
    return {
      code: "collect_signatures",
      label: "Continue signing",
      description: `${input.signerSummary.pendingRequiredSignatureCount} required signature(s) are still pending.`,
      targetPath: `/app/sign?documentId=${documentId}`,
      priority: "high",
    } satisfies DocumentNextAction;
  }

  if (status.includes("sign")) {
    return {
      code: "collect_signatures",
      label: "View Document",
      description: "Open the document workspace and review signature progress.",
      targetPath: `/app/sign?documentId=${documentId}`,
      priority: "medium",
    } satisfies DocumentNextAction;
  }

  if (status.includes("complete") || status.includes("notar") || status.includes("final")) {
    return {
      code: "finalize_and_download",
      label: "Open document",
      description: "Open the finalized document package.",
      targetPath: `/app/sign?documentId=${documentId}`,
      priority: "low",
    } satisfies DocumentNextAction;
  }

  return {
    code: "no_action_required",
    label: "Open document",
    description: "Open the document workspace for details.",
    targetPath: `/app/sign?documentId=${documentId}`,
    priority: "low",
  } satisfies DocumentNextAction;
};

export const buildDocumentActionEnrichment = async (input: {
  document: DocumentRecord;
}) => {
  const [generationRuns, rawSigners, parties, signatures] = await Promise.all([
    listDocumentGenerationRuns(input.document.id),
    listDocumentOutputSigners({ documentId: input.document.id }),
    listDocumentParties(input.document.id),
    listDocumentSignatures({ documentId: input.document.id }),
  ]);
  const signers = filterCurrentSignerObligations({
    signers: rawSigners,
    generationRuns,
  });
  const signerSummary = buildDocumentSignerSummary({ signers, signatures });

  return {
    documentTypeLabel: resolveDocumentTypeLabel(input.document),
    principalName: resolvePrincipalName(parties),
    signerSummary,
    nextAction: buildDocumentNextAction({
      document: input.document,
      signerSummary,
    }),
  } satisfies DocumentActionEnrichment;
};

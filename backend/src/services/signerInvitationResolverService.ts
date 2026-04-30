import {
  getDocumentById,
  listDocumentGenerationRuns,
  listDocumentOutputSigners,
  listDocumentParties,
  listDocumentSignatures,
  type DocumentGenerationRunRecord,
  type DocumentOutputSignerRecord,
  type DocumentPartyRecord,
  type SignatureRecord,
} from "./documentService";
import {
  listDocumentInvites,
  type DocumentInviteDetail,
} from "./documentInviteService";
import type { DocumentInviteStatus, InviteClaimMode } from "./inviteClaimService";

type CreatorResolutionStrategy =
  | "actor_email_match"
  | "single_principal_fallback"
  | "single_grantor_fallback"
  | "unresolved";

type TriggerBlockedReason =
  | "actor_not_document_owner"
  | "creator_party_unresolved"
  | "creator_signer_unresolved"
  | "completed_signer_not_creator"
  | "creator_signing_incomplete"
  | "creator_already_complete_before_capture";

export type RemainingSignerInvitationSkipReason =
  | "creator_obligation"
  | "already_signed"
  | "active_invite_exists"
  | "missing_email"
  | "group_satisfied";

export type RemainingSignerInvitationCandidate = {
  documentId: string;
  documentOutputSignerId: string;
  documentPartyId: string | null;
  generationRunId: string;
  outputKey: string;
  documentKey: string;
  partyRole: string;
  obligationType: string;
  recipientEmail: string;
  recipientName: string;
  claimMode: InviteClaimMode;
  idempotencyKey: string;
};

export type RemainingSignerInvitationSkip = {
  documentOutputSignerId: string;
  documentPartyId: string | null;
  generationRunId: string;
  outputKey: string;
  documentKey: string;
  partyRole: string;
  partyName: string;
  reason: RemainingSignerInvitationSkipReason;
  activeInviteId?: string;
  idempotencyKey?: string;
};

export type RemainingSignerInvitationResolution = {
  documentId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  trigger: {
    actorIsDocumentOwner: boolean;
    creatorResolutionStrategy: CreatorResolutionStrategy;
    creatorPartyIds: string[];
    creatorOutputSignerIds: string[];
    completedOutputSignerId: string | null;
    completedOutputSignerIsCreator: boolean;
    creatorSigningCompleteBefore: boolean;
    creatorSigningCompleteAfter: boolean;
    creatorSigningJustCompleted: boolean;
    shouldQueueInvites: boolean;
    blockedReason: TriggerBlockedReason | null;
  };
  candidates: RemainingSignerInvitationCandidate[];
  skipped: RemainingSignerInvitationSkip[];
};

export class SignerInvitationResolverError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "SignerInvitationResolverError";
    this.statusCode = statusCode;
  }
}

const activeInviteStatuses = new Set<DocumentInviteStatus>([
  "draft",
  "queued",
  "sent",
  "opened",
  "claimed",
  "accepted",
]);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase() ?? "";
  return emailPattern.test(normalized) ? normalized : null;
};

const buildIdempotencyKey = (documentId: string, outputSignerId: string) =>
  `signing-remaining:${documentId}:${outputSignerId}`;

const getSignatureGroupMinimumRequired = (metadata: Record<string, unknown>) => {
  const candidate = metadata.groupMinimumRequired;

  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    return 1;
  }

  return Math.max(1, Math.floor(candidate));
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

const filterCurrentSignerObligations = (input: {
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

const buildCapturedOutputSignerIds = (input: {
  signatures: SignatureRecord[];
  excludeSignatureId?: string | null;
  excludeOutputSignerId?: string | null;
}) => {
  const capturedOutputSignerIds = new Set<string>();
  const excludeSignatureId = input.excludeSignatureId?.trim() || null;
  const excludeOutputSignerId = input.excludeOutputSignerId?.trim() || null;

  for (const signature of input.signatures) {
    if (signature.status !== "captured" || !signature.document_output_signer_id) {
      continue;
    }

    if (excludeSignatureId && signature.id === excludeSignatureId) {
      continue;
    }

    if (!excludeSignatureId && excludeOutputSignerId) {
      if (signature.document_output_signer_id === excludeOutputSignerId) {
        continue;
      }
    }

    capturedOutputSignerIds.add(signature.document_output_signer_id);
  }

  return capturedOutputSignerIds;
};

const getGroupKey = (signer: DocumentOutputSignerRecord) =>
  signer.signing_group ? `${signer.generation_run_id}:${signer.signing_group}` : null;

const buildGroupSatisfaction = (input: {
  signers: DocumentOutputSignerRecord[];
  capturedOutputSignerIds: Set<string>;
}) => {
  const groups = new Map<
    string,
    {
      minimumRequired: number;
      capturedCount: number;
    }
  >();

  for (const signer of input.signers) {
    if (
      signer.obligation_type !== "signer" ||
      signer.is_required ||
      !signer.signing_group
    ) {
      continue;
    }

    const groupKey = getGroupKey(signer);
    if (!groupKey) {
      continue;
    }

    const existing = groups.get(groupKey);
    const minimumRequired = getSignatureGroupMinimumRequired(signer.metadata ?? {});
    const capturedCount = input.capturedOutputSignerIds.has(signer.id) ? 1 : 0;

    groups.set(groupKey, {
      minimumRequired: existing
        ? Math.max(existing.minimumRequired, minimumRequired)
        : minimumRequired,
      capturedCount: (existing?.capturedCount ?? 0) + capturedCount,
    });
  }

  return new Map(
    Array.from(groups.entries()).map(([key, group]) => [
      key,
      group.capturedCount >= group.minimumRequired,
    ]),
  );
};

const areSignerRequirementsSatisfied = (input: {
  signers: DocumentOutputSignerRecord[];
  capturedOutputSignerIds: Set<string>;
}) => {
  const signerObligations = input.signers.filter(
    (signer) => signer.obligation_type === "signer",
  );

  if (signerObligations.length === 0) {
    return false;
  }

  const groupSatisfaction = buildGroupSatisfaction({
    signers: signerObligations,
    capturedOutputSignerIds: input.capturedOutputSignerIds,
  });

  return signerObligations.every((signer) => {
    if (signer.is_required) {
      return input.capturedOutputSignerIds.has(signer.id);
    }

    const groupKey = getGroupKey(signer);
    if (!groupKey) {
      return true;
    }

    return groupSatisfaction.get(groupKey) ?? false;
  });
};

const resolveCreatorParties = (input: {
  parties: DocumentPartyRecord[];
  actorEmail: string | null;
}) => {
  const signingParties = input.parties.filter((party) => party.is_signing_party);

  if (input.actorEmail) {
    const emailMatches = signingParties.filter(
      (party) => normalizeEmail(party.email) === input.actorEmail,
    );

    if (emailMatches.length > 0) {
      return {
        strategy: "actor_email_match" as const,
        parties: emailMatches,
      };
    }
  }

  const principalParties = signingParties.filter(
    (party) => party.party_role === "principal",
  );
  if (principalParties.length === 1) {
    return {
      strategy: "single_principal_fallback" as const,
      parties: principalParties,
    };
  }

  const grantorParties = signingParties.filter((party) => party.party_role === "grantor");
  if (grantorParties.length === 1) {
    return {
      strategy: "single_grantor_fallback" as const,
      parties: grantorParties,
    };
  }

  return {
    strategy: "unresolved" as const,
    parties: [],
  };
};


const loadDocumentInvites = async (documentId: string) => {
  const invites: DocumentInviteDetail[] = [];
  const limit = 100;
  let offset = 0;
  let total = 0;

  do {
    const page = await listDocumentInvites({
      role: "service_role",
      viewerUserId: null,
      documentId,
      documentOutputSignerId: null,
      status: null,
      limit,
      offset,
    });

    invites.push(...page.invites);
    total = page.page.total;
    offset += page.page.limit;
  } while (offset < total);

  return invites;
};

const getActiveInviteByOutputSignerId = (invites: DocumentInviteDetail[]) => {
  const activeInviteByOutputSignerId = new Map<string, DocumentInviteDetail>();

  for (const invite of invites) {
    if (!invite.documentOutputSignerId || !activeInviteStatuses.has(invite.status)) {
      continue;
    }

    if (!activeInviteByOutputSignerId.has(invite.documentOutputSignerId)) {
      activeInviteByOutputSignerId.set(invite.documentOutputSignerId, invite);
    }
  }

  return activeInviteByOutputSignerId;
};

const getPartyById = (parties: DocumentPartyRecord[]) => {
  return new Map(parties.map((party) => [party.id, party]));
};

const getBlockedReason = (input: {
  actorIsDocumentOwner: boolean;
  creatorPartyCount: number;
  creatorSignerCount: number;
  completedOutputSignerIsCreator: boolean;
  creatorSigningCompleteAfter: boolean;
  creatorSigningCompleteBefore: boolean;
}): TriggerBlockedReason | null => {
  if (!input.actorIsDocumentOwner) {
    return "actor_not_document_owner";
  }

  if (input.creatorPartyCount === 0) {
    return "creator_party_unresolved";
  }

  if (input.creatorSignerCount === 0) {
    return "creator_signer_unresolved";
  }

  if (!input.completedOutputSignerIsCreator) {
    return "completed_signer_not_creator";
  }

  if (!input.creatorSigningCompleteAfter) {
    return "creator_signing_incomplete";
  }

  if (input.creatorSigningCompleteBefore) {
    return "creator_already_complete_before_capture";
  }

  return null;
};

export const resolveRemainingSignerInvitationsAfterCreatorSignature = async (input: {
  documentId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  completedOutputSignerId?: string | null;
  completedSignatureId?: string | null;
}): Promise<RemainingSignerInvitationResolution> => {
  const document = await getDocumentById(input.documentId);
  if (!document) {
    throw new SignerInvitationResolverError(404, "Document not found");
  }

  const actorUserId = input.actorUserId?.trim() || null;
  const actorEmail = normalizeEmail(input.actorEmail);
  const completedOutputSignerId = input.completedOutputSignerId?.trim() || null;

  const [generationRuns, rawSigners, parties, signatures] = await Promise.all([
    listDocumentGenerationRuns(document.id),
    listDocumentOutputSigners({ documentId: document.id }),
    listDocumentParties(document.id),
    listDocumentSignatures({ documentId: document.id }),
  ]);

  const signers = filterCurrentSignerObligations({
    signers: rawSigners,
    generationRuns,
  }).filter((signer) => signer.obligation_type === "signer");
  const creatorPartyResolution = resolveCreatorParties({ parties, actorEmail });
  const creatorPartyIds = new Set(
    creatorPartyResolution.parties.map((party) => party.id),
  );
  const creatorSigners = signers.filter(
    (signer) => signer.document_party_id && creatorPartyIds.has(signer.document_party_id),
  );
  const capturedAfter = buildCapturedOutputSignerIds({ signatures });
  const capturedBefore = buildCapturedOutputSignerIds({
    signatures,
    excludeSignatureId: input.completedSignatureId ?? null,
    excludeOutputSignerId: completedOutputSignerId,
  });
  const creatorSigningCompleteBefore = areSignerRequirementsSatisfied({
    signers: creatorSigners,
    capturedOutputSignerIds: capturedBefore,
  });
  const creatorSigningCompleteAfter = areSignerRequirementsSatisfied({
    signers: creatorSigners,
    capturedOutputSignerIds: capturedAfter,
  });
  const completedOutputSignerIsCreator = completedOutputSignerId
    ? creatorSigners.some((signer) => signer.id === completedOutputSignerId)
    : false;
  const actorIsDocumentOwner = Boolean(actorUserId && actorUserId === document.owner_id);
  const blockedReason = getBlockedReason({
    actorIsDocumentOwner,
    creatorPartyCount: creatorPartyResolution.parties.length,
    creatorSignerCount: creatorSigners.length,
    completedOutputSignerIsCreator,
    creatorSigningCompleteAfter,
    creatorSigningCompleteBefore,
  });
  const shouldQueueInvites = blockedReason === null;
  const trigger = {
    actorIsDocumentOwner,
    creatorResolutionStrategy: creatorPartyResolution.strategy,
    creatorPartyIds: Array.from(creatorPartyIds),
    creatorOutputSignerIds: creatorSigners.map((signer) => signer.id),
    completedOutputSignerId,
    completedOutputSignerIsCreator,
    creatorSigningCompleteBefore,
    creatorSigningCompleteAfter,
    creatorSigningJustCompleted:
      creatorSigningCompleteAfter && !creatorSigningCompleteBefore,
    shouldQueueInvites,
    blockedReason,
  };

  if (!shouldQueueInvites) {
    return {
      documentId: document.id,
      actorUserId,
      actorEmail,
      trigger,
      candidates: [],
      skipped: [],
    };
  }

  const [activeInviteByOutputSignerId, partyById, groupSatisfaction] = await Promise.all([
    loadDocumentInvites(document.id).then(getActiveInviteByOutputSignerId),
    Promise.resolve(getPartyById(parties)),
    Promise.resolve(
      buildGroupSatisfaction({
        signers,
        capturedOutputSignerIds: capturedAfter,
      }),
    ),
  ]);
  const candidates: RemainingSignerInvitationCandidate[] = [];
  const skipped: RemainingSignerInvitationSkip[] = [];

  for (const signer of signers) {
    const idempotencyKey = buildIdempotencyKey(document.id, signer.id);
    const isCreatorSigner = creatorSigners.some(
      (creatorSigner) => creatorSigner.id === signer.id,
    );
    const party = signer.document_party_id
      ? partyById.get(signer.document_party_id) ?? null
      : null;
    const baseSkip = {
      documentOutputSignerId: signer.id,
      documentPartyId: signer.document_party_id,
      generationRunId: signer.generation_run_id,
      outputKey: signer.output_key,
      documentKey: signer.document_key,
      partyRole: signer.party_role,
      partyName: signer.party_name,
    };

    if (isCreatorSigner) {
      skipped.push({
        ...baseSkip,
        reason: "creator_obligation",
      });
      continue;
    }

    if (capturedAfter.has(signer.id)) {
      skipped.push({
        ...baseSkip,
        reason: "already_signed",
      });
      continue;
    }

    const groupKey = getGroupKey(signer);
    if (!signer.is_required && groupKey && groupSatisfaction.get(groupKey)) {
      skipped.push({
        ...baseSkip,
        reason: "group_satisfied",
      });
      continue;
    }

    const activeInvite = activeInviteByOutputSignerId.get(signer.id) ?? null;
    if (activeInvite) {
      skipped.push({
        ...baseSkip,
        reason: "active_invite_exists",
        activeInviteId: activeInvite.id,
        idempotencyKey,
      });
      continue;
    }

    const recipientEmail = normalizeEmail(party?.email ?? null);
    if (!recipientEmail) {
      skipped.push({
        ...baseSkip,
        reason: "missing_email",
        idempotencyKey,
      });
      continue;
    }

    candidates.push({
      documentId: document.id,
      documentOutputSignerId: signer.id,
      documentPartyId: signer.document_party_id,
      generationRunId: signer.generation_run_id,
      outputKey: signer.output_key,
      documentKey: signer.document_key,
      partyRole: signer.party_role,
      obligationType: signer.obligation_type,
      recipientEmail,
      recipientName: party?.full_name?.trim() || signer.party_name,
      claimMode: "required_signup",
      idempotencyKey,
    });
  }

  return {
    documentId: document.id,
    actorUserId,
    actorEmail,
    trigger,
    candidates,
    skipped,
  };
};

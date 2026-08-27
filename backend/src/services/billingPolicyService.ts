import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

export const billingEnforcementModes = ["disabled", "observe", "enforced"] as const;
export type BillingEnforcementMode = (typeof billingEnforcementModes)[number];

export const billingPolicyReasonCodes = {
  allowed: "billing_allowed",
  disabled: "billing_enforcement_disabled",
  membershipRequired: "billing_membership_required",
  membershipInactive: "billing_membership_inactive",
  periodInactive: "billing_period_inactive",
  limitReached: "billing_workflow_limit_reached",
  entitlementUnavailable: "billing_entitlement_unavailable",
} as const;

export type BillingPolicyReasonCode =
  (typeof billingPolicyReasonCodes)[keyof typeof billingPolicyReasonCodes];

type BillingAccountRecord = {
  id: string;
  owner_user_id: string;
  status: string;
};

type EntitlementRecord = {
  id: string;
  billing_account_id: string;
  subscription_item_id: string | null;
  status: string;
  quantity_total: number | null;
  quantity_used: number;
  starts_at: string | null;
  ends_at: string | null;
};

export type MemberBillingPolicyDecision = {
  mode: BillingEnforcementMode;
  allowed: boolean;
  canProceed: boolean;
  wouldBlock: boolean;
  reasonCode: BillingPolicyReasonCode;
  billingAccountId: string | null;
  entitlementId: string | null;
  subscriptionItemId: string | null;
  quantityLimit: number | null;
  quantityUsed: number;
  quantityRemaining: number | null;
  periodStart: string | null;
  periodEnd: string | null;
};

export type DocumentReleaseControlRecord = {
  id: string;
  document_id: string;
  document_version_id: string;
  document_hash_record_id: string;
  release_status: "pending" | "billing_held" | "released";
  hold_reason: string | null;
  held_at: string | null;
  released_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export class BillingPolicyError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: BillingPolicyReasonCode | string,
    message: string,
  ) {
    super(message);
    this.name = "BillingPolicyError";
  }
}

const parseMode = (value: string | undefined): BillingEnforcementMode => {
  const normalized = value?.trim().toLowerCase();
  return billingEnforcementModes.includes(normalized as BillingEnforcementMode)
    ? (normalized as BillingEnforcementMode)
    : "observe";
};

export const getBillingEnforcementMode = () =>
  parseMode(process.env.BILLING_ENFORCEMENT_MODE);

const getDefaultBillingAccount = async (ownerUserId: string) => {
  const { data, error } = await supabaseAdmin
    .from("billing_accounts")
    .select("id, owner_user_id, status")
    .eq("owner_user_id", ownerUserId)
    .eq("account_key", "default")
    .eq("is_default", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Billing account policy lookup failed: ${error.message}`);
  }

  return (data as BillingAccountRecord | null) ?? null;
};

const getCurrentEntitlement = async (billingAccountId: string) => {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("billing_entitlements")
    .select(
      "id, billing_account_id, subscription_item_id, status, quantity_total, quantity_used, starts_at, ends_at",
    )
    .eq("billing_account_id", billingAccountId)
    .eq("entitlement_type", "document_workflow_capacity")
    .eq("status", "active")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Billing entitlement policy lookup failed: ${error.message}`);
  }

  return (data as EntitlementRecord | null) ?? null;
};

const buildDecision = (input: {
  mode: BillingEnforcementMode;
  reasonCode: BillingPolicyReasonCode;
  account?: BillingAccountRecord | null;
  entitlement?: EntitlementRecord | null;
  allowed: boolean;
}) => {
  const quantityLimit = input.entitlement?.quantity_total ?? null;
  const quantityUsed = input.entitlement?.quantity_used ?? 0;
  const quantityRemaining = quantityLimit === null
    ? null
    : Math.max(quantityLimit - quantityUsed, 0);

  return {
    mode: input.mode,
    allowed: input.allowed,
    canProceed: input.mode !== "enforced" || input.allowed,
    wouldBlock: !input.allowed,
    reasonCode: input.reasonCode,
    billingAccountId: input.account?.id ?? null,
    entitlementId: input.entitlement?.id ?? null,
    subscriptionItemId: input.entitlement?.subscription_item_id ?? null,
    quantityLimit,
    quantityUsed,
    quantityRemaining,
    periodStart: input.entitlement?.starts_at ?? null,
    periodEnd: input.entitlement?.ends_at ?? null,
  } satisfies MemberBillingPolicyDecision;
};

export const evaluateMemberBillingPolicy = async (ownerUserId: string) => {
  const mode = getBillingEnforcementMode();
  if (mode === "disabled") {
    return buildDecision({
      mode,
      reasonCode: billingPolicyReasonCodes.disabled,
      allowed: true,
    });
  }

  const account = await getDefaultBillingAccount(ownerUserId);
  if (!account) {
    return buildDecision({
      mode,
      reasonCode: billingPolicyReasonCodes.membershipRequired,
      allowed: false,
    });
  }

  if (account.status !== "active") {
    return buildDecision({
      mode,
      account,
      reasonCode: billingPolicyReasonCodes.membershipInactive,
      allowed: false,
    });
  }

  const entitlement = await getCurrentEntitlement(account.id);
  if (!entitlement) {
    return buildDecision({
      mode,
      account,
      reasonCode: billingPolicyReasonCodes.membershipInactive,
      allowed: false,
    });
  }

  if (entitlement.quantity_total === null) {
    return buildDecision({
      mode,
      account,
      entitlement,
      reasonCode: billingPolicyReasonCodes.entitlementUnavailable,
      allowed: false,
    });
  }

  if (entitlement.quantity_used >= entitlement.quantity_total) {
    return buildDecision({
      mode,
      account,
      entitlement,
      reasonCode: billingPolicyReasonCodes.limitReached,
      allowed: false,
    });
  }

  return buildDecision({
    mode,
    account,
    entitlement,
    reasonCode: billingPolicyReasonCodes.allowed,
    allowed: true,
  });
};

const recordPolicyDecision = async (input: {
  ownerUserId: string;
  documentId?: string | null;
  action: string;
  decision: MemberBillingPolicyDecision;
}) => {
  const { error } = await supabaseAdmin.from("audit_events").insert({
    actor_id: input.ownerUserId,
    entity_type: input.documentId ? "document" : "user",
    entity_id: input.documentId ?? input.ownerUserId,
    action: input.action,
    metadata: {
      enforcement_mode: input.decision.mode,
      allowed: input.decision.allowed,
      can_proceed: input.decision.canProceed,
      reason_code: input.decision.reasonCode,
      billing_account_id: input.decision.billingAccountId,
      entitlement_id: input.decision.entitlementId,
      quantity_limit: input.decision.quantityLimit,
      quantity_used: input.decision.quantityUsed,
      quantity_remaining: input.decision.quantityRemaining,
      period_start: input.decision.periodStart,
      period_end: input.decision.periodEnd,
    },
  });

  if (error) {
    throw new Error(`Billing policy audit failed: ${error.message}`);
  }
};

const errorForDecision = (decision: MemberBillingPolicyDecision) => {
  if (decision.reasonCode === billingPolicyReasonCodes.limitReached) {
    return new BillingPolicyError(
      409,
      decision.reasonCode,
      "Your membership workflow allowance has been reached. Upgrade or wait for renewal.",
    );
  }

  return new BillingPolicyError(
    402,
    decision.reasonCode,
    "An active member membership is required to continue.",
  );
};

export const assertMemberCanCreateWorkflow = async (input: {
  ownerUserId: string;
}) => {
  const decision = await evaluateMemberBillingPolicy(input.ownerUserId);
  await recordPolicyDecision({
    ownerUserId: input.ownerUserId,
    action: "billing.workflow_creation_evaluated",
    decision,
  });

  if (!decision.canProceed) {
    throw errorForDecision(decision);
  }

  return decision;
};

const policyCodeFromRpcError = (message: string) => {
  const knownCodes = [
    "BILLING_ENTITLEMENT_NOT_FOUND",
    "BILLING_ENTITLEMENT_NOT_USABLE",
    "BILLING_SUBSCRIPTION_NOT_ENTITLED",
    "BILLING_PERIOD_NOT_ACTIVE",
    "BILLING_WORKFLOW_LIMIT_REACHED",
    "BILLING_USAGE_DRIFT",
    "BILLING_DOCUMENT_STATUS_CONFLICT",
    "BILLING_DOCUMENT_OWNER_MISMATCH",
  ];
  return knownCodes.find((code) => message.includes(code)) ?? null;
};

const mapRpcPolicyError = (message: string) => {
  if (message.includes("BILLING_WORKFLOW_LIMIT_REACHED")) {
    return new BillingPolicyError(
      409,
      billingPolicyReasonCodes.limitReached,
      "Your membership workflow allowance has been reached. Upgrade or wait for renewal.",
    );
  }
  if (message.includes("BILLING_PERIOD_NOT_ACTIVE")) {
    return new BillingPolicyError(
      402,
      billingPolicyReasonCodes.periodInactive,
      "The current membership period is not active.",
    );
  }
  if (
    message.includes("BILLING_ENTITLEMENT") ||
    message.includes("BILLING_SUBSCRIPTION_NOT_ENTITLED")
  ) {
    return new BillingPolicyError(
      402,
      billingPolicyReasonCodes.membershipInactive,
      "An active member membership is required to continue.",
    );
  }
  return new BillingPolicyError(409, "billing_policy_conflict", message);
};

export const consumeMemberDocumentWorkflow = async (input: {
  ownerUserId: string;
  documentId: string;
  expectedDocumentStatus: "draft" | "pending_review";
  nextDocumentStatus: "pending_signature" | "pending_notary";
  actorUserId?: string | null;
}) => {
  const decision = await evaluateMemberBillingPolicy(input.ownerUserId);
  if (!decision.allowed || !decision.billingAccountId || !decision.entitlementId) {
    await recordPolicyDecision({
      ownerUserId: input.ownerUserId,
      documentId: input.documentId,
      action: "billing.document_workflow_submission_evaluated",
      decision,
    });
    if (!decision.canProceed) {
      throw errorForDecision(decision);
    }
    return { transitionHandled: false, decision, usage: null };
  }

  const { data, error } = await supabaseAdmin.rpc("consume_member_document_workflow", {
    p_billing_account_id: decision.billingAccountId,
    p_entitlement_id: decision.entitlementId,
    p_document_id: input.documentId,
    p_idempotency_key: `document:${input.documentId}:first_submission`,
    p_expected_document_status: input.expectedDocumentStatus,
    p_next_document_status: input.nextDocumentStatus,
    p_actor_user_id: input.actorUserId ?? input.ownerUserId,
  });

  if (error) {
    const policyCode = policyCodeFromRpcError(error.message);
    if (decision.mode === "observe" && policyCode) {
      const observedDecision = {
        ...decision,
        allowed: false,
        canProceed: true,
        wouldBlock: true,
        reasonCode: policyCode.includes("LIMIT")
          ? billingPolicyReasonCodes.limitReached
          : billingPolicyReasonCodes.entitlementUnavailable,
      } satisfies MemberBillingPolicyDecision;
      await recordPolicyDecision({
        ownerUserId: input.ownerUserId,
        documentId: input.documentId,
        action: "billing.document_workflow_submission_observed",
        decision: observedDecision,
      });
      return { transitionHandled: false, decision: observedDecision, usage: null };
    }
    throw mapRpcPolicyError(error.message);
  }

  const usage = Array.isArray(data) ? data[0] ?? null : data;
  return { transitionHandled: true, decision, usage };
};

export const getDocumentReleaseControl = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("document_release_controls")
    .select(
      "id, document_id, document_version_id, document_hash_record_id, release_status, hold_reason, held_at, released_at, metadata, created_at, updated_at",
    )
    .eq("document_id", documentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Document release lookup failed: ${error.message}`);
  }

  return (data as DocumentReleaseControlRecord | null) ?? null;
};

export const isDocumentFinalPackageHeld = async (documentId: string) => {
  const control = await getDocumentReleaseControl(documentId);
  return control?.release_status === "billing_held";
};

export const isFinalPackageReleaseUnavailable = (
  control: DocumentReleaseControlRecord | null,
) => {
  if (control?.release_status === "billing_held") return true;
  return getBillingEnforcementMode() === "enforced" && control?.release_status !== "released";
};

export const canViewerAccessFinalPackage = async (input: {
  documentId: string;
  viewerRole?: string | null | undefined;
}) => {
  if (["notary", "admin", "service_role"].includes(input.viewerRole ?? "")) {
    return true;
  }
  return !isFinalPackageReleaseUnavailable(await getDocumentReleaseControl(input.documentId));
};

export const isFinalPackageDocumentVersion = (version: {
  is_final?: boolean | null;
  file_name?: string | null;
  storage_path?: string | null;
}) => {
  const fileName = version.file_name?.trim().toLowerCase() ?? "";
  const storagePath = version.storage_path?.trim().toLowerCase() ?? "";
  return Boolean(
    version.is_final ||
      /-acknowledged-v\d+\.pdf$/.test(fileName) ||
      /-acknowledged-v\d+\.pdf$/.test(storagePath) ||
      /-finalized-v\d+\.pdf$/.test(fileName) ||
      /-finalized-v\d+\.pdf$/.test(storagePath),
  );
};

const setDocumentReleaseStatus = async (input: {
  documentId: string;
  documentVersionId: string;
  documentHashRecordId: string;
  releaseStatus: "billing_held" | "released";
  holdReason?: string | null;
  actorUserId?: string | null | undefined;
  metadata?: Record<string, unknown>;
}) => {
  const { data, error } = await supabaseAdmin.rpc("set_document_release_status", {
    p_document_id: input.documentId,
    p_document_version_id: input.documentVersionId,
    p_document_hash_record_id: input.documentHashRecordId,
    p_release_status: input.releaseStatus,
    p_hold_reason: input.holdReason ?? null,
    p_actor_user_id: input.actorUserId ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) {
    throw new Error(`Document release update failed: ${error.message}`);
  }
  return data as DocumentReleaseControlRecord;
};

export const applyFinalPackageBillingPolicy = async (input: {
  ownerUserId: string;
  documentId: string;
  documentVersionId: string;
  documentHashRecordId: string;
  actorUserId?: string | null | undefined;
}) => {
  const decision = await evaluateMemberBillingPolicy(input.ownerUserId);
  const hasActiveMembership = Boolean(
    decision.billingAccountId &&
      decision.entitlementId &&
      decision.reasonCode !== billingPolicyReasonCodes.membershipRequired &&
      decision.reasonCode !== billingPolicyReasonCodes.membershipInactive &&
      decision.reasonCode !== billingPolicyReasonCodes.periodInactive,
  );
  const shouldHold = decision.mode === "enforced" && !hasActiveMembership;

  return setDocumentReleaseStatus({
    documentId: input.documentId,
    documentVersionId: input.documentVersionId,
    documentHashRecordId: input.documentHashRecordId,
    releaseStatus: shouldHold ? "billing_held" : "released",
    holdReason: shouldHold ? "membership_not_entitled_at_finalization" : null,
    actorUserId: input.actorUserId,
    metadata: {
      source: "finalization_billing_policy",
      enforcement_mode: decision.mode,
      policy_reason_code: decision.reasonCode,
      membership_active: hasActiveMembership,
      would_hold_if_enforced: !hasActiveMembership,
    },
  });
};

export const releaseMemberBillingHeldDocuments = async (input: {
  billingAccountId: string;
  sourceEventId?: string | null;
}) => {
  const { data: account, error: accountError } = await supabaseAdmin
    .from("billing_accounts")
    .select("id, owner_user_id, status")
    .eq("id", input.billingAccountId)
    .single();
  if (accountError || !account) {
    throw new Error(`Held-document account lookup failed: ${accountError?.message}`);
  }

  const decision = await evaluateMemberBillingPolicy(account.owner_user_id);
  if (!decision.entitlementId) {
    return { releasedCount: 0, releaseControlIds: [] as string[] };
  }

  const { data: held, error: heldError } = await supabaseAdmin
    .from("document_release_controls")
    .select(
      "id, document_id, document_version_id, document_hash_record_id, documents!inner(owner_id)",
    )
    .eq("release_status", "billing_held")
    .eq("documents.owner_id", account.owner_user_id);
  if (heldError) {
    throw new Error(`Held-document lookup failed: ${heldError.message}`);
  }

  const released: string[] = [];
  for (const control of held ?? []) {
    const result = await setDocumentReleaseStatus({
      documentId: control.document_id,
      documentVersionId: control.document_version_id,
      documentHashRecordId: control.document_hash_record_id,
      releaseStatus: "released",
      metadata: {
        source: "membership_reactivation",
        stripe_event_id: input.sourceEventId ?? null,
        entitlement_id: decision.entitlementId,
      },
    });
    released.push(result.id);
  }

  return { releasedCount: released.length, releaseControlIds: released };
};

export const reverseMemberWorkflowUsage = async (input: {
  usageEventId: string;
  idempotencyKey: string;
  reason: string;
  actorUserId?: string | null | undefined;
}) => {
  const { data, error } = await supabaseAdmin.rpc("reverse_billing_usage_event", {
    p_usage_event_id: input.usageEventId,
    p_idempotency_key: input.idempotencyKey,
    p_reason: input.reason,
    p_actor_user_id: input.actorUserId,
  });
  if (error) {
    throw new Error(`Billing usage reversal failed: ${error.message}`);
  }
  return Array.isArray(data) ? data[0] ?? null : data;
};

export const forceReleaseBillingHeldDocument = async (input: {
  documentId: string;
  reason: string;
  actorUserId?: string | null | undefined;
}) => {
  const control = await getDocumentReleaseControl(input.documentId);
  if (!control || control.release_status !== "billing_held") {
    throw new BillingPolicyError(409, "document_not_billing_held", "Document is not billing held");
  }
  return setDocumentReleaseStatus({
    documentId: control.document_id,
    documentVersionId: control.document_version_id,
    documentHashRecordId: control.document_hash_record_id,
    releaseStatus: "released",
    actorUserId: input.actorUserId,
    metadata: {
      source: "support_override",
      reason: input.reason,
    },
  });
};

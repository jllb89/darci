export const memberBillingReasonCodes = [
  "billing_membership_required",
  "billing_membership_inactive",
  "billing_period_inactive",
  "billing_workflow_limit_reached",
  "billing_entitlement_unavailable",
] as const;

export type MemberBillingReasonCode = (typeof memberBillingReasonCodes)[number];

export type BillingPolicyFailurePayload = {
  error?: string;
  message?: string;
};

export const isMemberBillingReasonCode = (
  value: string | null | undefined,
): value is MemberBillingReasonCode => {
  return memberBillingReasonCodes.includes(value as MemberBillingReasonCode);
};

export const readMemberBillingReasonCode = (
  payload: BillingPolicyFailurePayload | null | undefined,
) => {
  return isMemberBillingReasonCode(payload?.error) ? payload.error : null;
};

export const getMemberBillingDenialCopy = (reasonCode: MemberBillingReasonCode) => {
  if (reasonCode === "billing_workflow_limit_reached") {
    return {
      title: "Monthly document allowance reached",
      body: "Upgrade your membership or wait for the next billing period. Changing plans does not reset documents already used this period.",
      actionLabel: "View membership and upgrade",
    };
  }

  if (reasonCode === "billing_membership_inactive" || reasonCode === "billing_period_inactive") {
    return {
      title: "Restore your membership to continue",
      body: "Already accepted notary work can still finish, but a current membership is required to create or submit another document workflow.",
      actionLabel: "Manage membership",
    };
  }

  return {
    title: "A DARCi membership is required",
    body: "Choose a monthly document allowance before creating or submitting this workflow.",
    actionLabel: "View membership plans",
  };
};

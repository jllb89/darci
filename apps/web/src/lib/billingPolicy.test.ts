import { describe, expect, it } from "vitest";
import {
  getMemberBillingDenialCopy,
  isMemberBillingReasonCode,
  readMemberBillingReasonCode,
  getMemberMembershipDenialCopyForStatus,
} from "./billingPolicy";

describe("member billing policy UI contract", () => {
  it("gives the dashboard the same actionable membership guidance as a form denial", () => {
    expect(getMemberMembershipDenialCopyForStatus({ entitled: false, reasonCode: "billing_membership_required" }))
      .toEqual(getMemberBillingDenialCopy("billing_membership_required"));
    expect(getMemberMembershipDenialCopyForStatus({ entitled: true, reasonCode: null })).toBeNull();
    expect(getMemberMembershipDenialCopyForStatus({ entitled: false, reasonCode: "network_error" })).toBeNull();
  });

  it("never mistakes an entitlement lookup outage for a missing subscription", () => {
    const copy = getMemberBillingDenialCopy("billing_entitlement_unavailable");
    expect(copy.title).toBe("We couldn’t check your membership");
    expect(copy.body).toContain("does not mean you need to buy");
  });
  it("recognizes only server billing denial reason codes", () => {
    expect(isMemberBillingReasonCode("billing_workflow_limit_reached")).toBe(true);
    expect(isMemberBillingReasonCode("validation_error")).toBe(false);
    expect(readMemberBillingReasonCode({ error: "billing_membership_required" })).toBe(
      "billing_membership_required",
    );
  });

  it("keeps quota guidance limited to upgrade or renewal", () => {
    const copy = getMemberBillingDenialCopy("billing_workflow_limit_reached");
    expect(copy.body).toContain("Upgrade");
    expect(copy.body).toContain("wait for the next billing period");
    expect(copy.body).toContain("does not reset");
  });
});

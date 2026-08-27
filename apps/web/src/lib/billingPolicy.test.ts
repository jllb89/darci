import { describe, expect, it } from "vitest";
import {
  getMemberBillingDenialCopy,
  isMemberBillingReasonCode,
  readMemberBillingReasonCode,
} from "./billingPolicy";

describe("member billing policy UI contract", () => {
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

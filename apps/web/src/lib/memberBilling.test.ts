import { describe, expect, it } from "vitest";
import {
  FALLBACK_MEMBER_PLANS,
  createCheckoutIdempotencyToken,
  isActiveMembershipState,
  isRecoveryMembershipState,
} from "./memberBilling";

describe("member billing helpers", () => {
  it("keeps the simplified catalog limited to three document allowances", () => {
    expect(FALLBACK_MEMBER_PLANS.map((plan) => plan.documentWorkflowAllowance)).toEqual([
      3, 10, 25,
    ]);
    expect(new Set(FALLBACK_MEMBER_PLANS.map((plan) => plan.billingInterval))).toEqual(
      new Set(["month"]),
    );
  });

  it("generates checkout tokens accepted by the backend schema", () => {
    expect(createCheckoutIdempotencyToken()).toMatch(
      /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/,
    );
  });

  it("separates entitled and recovery subscription states", () => {
    expect(isActiveMembershipState("active")).toBe(true);
    expect(isActiveMembershipState("trialing")).toBe(true);
    expect(isRecoveryMembershipState("past_due")).toBe(true);
    expect(isRecoveryMembershipState("unpaid")).toBe(true);
    expect(isRecoveryMembershipState("active")).toBe(false);
  });
});

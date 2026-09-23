import { describe, expect, it } from "vitest";
import {
  LEGACY_MEMBER_PLAN_FIXTURES,
  createCheckoutIdempotencyToken,
  isActiveMembershipState,
  isRecoveryMembershipState,
} from "./memberBilling";

describe("member billing helpers", () => {
  it("preserves the three historical contracts without using them as storefront fallbacks", () => {
    expect(LEGACY_MEMBER_PLAN_FIXTURES.map((plan) => plan.documentWorkflowAllowance)).toEqual([
      3, 10, 25,
    ]);
    expect(new Set(LEGACY_MEMBER_PLAN_FIXTURES.map((plan) => plan.billingInterval))).toEqual(
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

  it("keeps plan prices ordered from Starter through Volume", () => {
    expect(LEGACY_MEMBER_PLAN_FIXTURES.map((plan) => plan.unitAmountCents)).toEqual([
      4900, 9900, 19900,
    ]);
  });
});

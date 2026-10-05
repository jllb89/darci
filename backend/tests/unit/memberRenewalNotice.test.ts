import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { buildMemberRenewalNotice, renewalNoticeCandidate } from "../../src/services/memberRenewalNotice";

const now = Date.parse("2026-10-05T12:00:00Z");
const end = now / 1000 + 3 * 86400;
const subscription = (changes = {}) => ({
  status: "active", cancel_at_period_end: false, cancel_at: null, pause_collection: null,
  items: { data: [{ current_period_start: end - 30 * 86400, current_period_end: end, discounts: [] }] },
  discounts: [], ...changes,
}) as unknown as Stripe.Subscription;
const discount = (duration: string, percent = 100, until: number | null = null) => ({
  id: "di_test", end: until, source: { coupon: { duration, percent_off: percent } },
}) as Stripe.Discount;

describe("membership offer-ending reminders", () => {
  it.each([20, 100])("recognizes a %s%% once-only discount retained only on the first invoice", percent => {
    expect(renewalNoticeCandidate(subscription(), [discount("once", percent)], now)).toEqual({ kind: "discount_ending", renewal: end });
  });
  it("recognizes an expiring repeating offer, including item-level discounts", () => {
    const sub = subscription();
    sub.items.data[0]!.discounts = [discount("repeating", 50, end)];
    expect(renewalNoticeCandidate(sub, [], now)?.kind).toBe("discount_ending");
  });
  it("does not call a permanent or continuing discount a trial", () => {
    expect(renewalNoticeCandidate(subscription({ discounts: [discount("forever")] }), [], now)).toBeNull();
    expect(renewalNoticeCandidate(subscription({ discounts: [discount("repeating", 50, end + 86400)] }), [], now)).toBeNull();
  });
  it("recognizes actual trials separately", () => {
    expect(renewalNoticeCandidate(subscription({ status: "trialing", trial_end: end }), [], now)).toEqual({ kind: "trial_ending", renewal: end });
  });
  it.each([
    { cancel_at_period_end: true }, { cancel_at: end }, { status: "canceled" },
    { status: "past_due" }, { pause_collection: { behavior: "void" } },
  ])("suppresses reminders for non-renewing subscriptions: %j", changes => {
    expect(renewalNoticeCandidate(subscription(changes), [discount("once")], now)).toBeNull();
  });
  it("uses the 72-hour boundary, accepts short trials and never replays expired notices", () => {
    const sub = subscription({ status: "trialing", trial_end: end });
    expect(renewalNoticeCandidate(sub, [], now - 1)).toBeNull();
    expect(renewalNoticeCandidate(sub, [], now)).not.toBeNull();
    expect(renewalNoticeCandidate(sub, [], end * 1000 - 1000)).not.toBeNull();
    expect(renewalNoticeCandidate(sub, [], end * 1000)).toBeNull();
  });
  it("uses Stripe's actual preview including credits/tax, not catalog price", () => {
    const notice = buildMemberRenewalNotice("sub_test", { kind: "discount_ending", renewal: end }, { amount_due: 1723, currency: "usd", total_discount_amounts: [] });
    expect(notice).toMatchObject({ estimatedAmountCents: 1723, currency: "USD", kind: "discount_ending" });
    expect(notice?.message).toContain("$17.23");
    expect(notice?.message).toContain("Review or cancel");
    expect(notice?.message).not.toContain("trial");
  });
  it.each([0, -100])("does not announce a charge when credits/another offer cover the invoice (%s)", amount_due => {
    expect(buildMemberRenewalNotice("sub_test", { kind: "trial_ending", renewal: end }, { amount_due, currency: "usd", total_discount_amounts: [] })).toBeNull();
  });
});

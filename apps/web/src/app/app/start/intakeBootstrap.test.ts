import { describe, expect, it } from "vitest";
import { readIntakeBootstrapFailure } from "./intakeBootstrap";
import type { DocumentIntakeBootstrapResponsePayload } from "./startPageTypes";

describe("intake bootstrap failures", () => {
  it("preserves the actionable membership reason before displaying a contract form", () => {
    expect(readIntakeBootstrapFailure(false, {
      error: "billing_membership_required", message: "An active member membership is required to continue.",
    })).toEqual({
      billingReasonCode: "billing_membership_required", message: "An active member membership is required to continue.",
    });
  });
  it("does not label authentication, network or missing-draft failures as membership denials", () => {
    expect(readIntakeBootstrapFailure(false, { error: "unauthorized" })?.billingReasonCode).toBeNull();
    expect(readIntakeBootstrapFailure(false, null)?.billingReasonCode).toBeNull();
    expect(readIntakeBootstrapFailure(true, {})?.message).toContain("retry");
  });
  it("allows a persisted draft only after a successful response", () => {
    const payload = { document: { id: "draft-1" } } as DocumentIntakeBootstrapResponsePayload;
    expect(readIntakeBootstrapFailure(true, payload)).toBeNull();
    expect(readIntakeBootstrapFailure(false, payload)).not.toBeNull();
  });
});

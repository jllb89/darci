import { afterEach, describe, expect, it } from "vitest";
import {
  getBillingEnforcementMode,
  isFinalPackageReleaseUnavailable,
  isFinalPackageDocumentVersion,
} from "../../src/services/billingPolicyService";

describe("billing policy helpers", () => {
  const originalMode = process.env.BILLING_ENFORCEMENT_MODE;

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.BILLING_ENFORCEMENT_MODE;
    } else {
      process.env.BILLING_ENFORCEMENT_MODE = originalMode;
    }
  });

  it("defaults safely to observe mode until the billing UI activation gate is met", () => {
    delete process.env.BILLING_ENFORCEMENT_MODE;
    expect(getBillingEnforcementMode()).toBe("observe");
    process.env.BILLING_ENFORCEMENT_MODE = "ENFORCED";
    expect(getBillingEnforcementMode()).toBe("enforced");
  });

  it("recognizes acknowledgment and finalized artifacts as final-package assets", () => {
    expect(isFinalPackageDocumentVersion({ is_final: true })).toBe(true);
    expect(isFinalPackageDocumentVersion({ file_name: "trust-acknowledged-v7.pdf" })).toBe(true);
    expect(isFinalPackageDocumentVersion({ storage_path: "owner/doc/poa-finalized-v9.pdf" })).toBe(true);
    expect(isFinalPackageDocumentVersion({ file_name: "poa-signed-v4.pdf" })).toBe(false);
  });

  it("fails closed on a missing release decision only when enforcement is active", () => {
    process.env.BILLING_ENFORCEMENT_MODE = "observe";
    expect(isFinalPackageReleaseUnavailable(null)).toBe(false);
    process.env.BILLING_ENFORCEMENT_MODE = "enforced";
    expect(isFinalPackageReleaseUnavailable(null)).toBe(true);
    expect(isFinalPackageReleaseUnavailable({ release_status: "released" } as never)).toBe(false);
    expect(isFinalPackageReleaseUnavailable({ release_status: "billing_held" } as never)).toBe(true);
  });
});

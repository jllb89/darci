import { afterEach, describe, expect, it } from "vitest";

import { anchorToLedger } from "../../src/services/ledgerService";

const originalAppEnv = process.env.APP_ENV;
const originalDotenvPath = process.env.DOTENV_CONFIG_PATH;
const originalLedgerMode = process.env.LEDGER_ANCHOR_MODE;
const originalStubAllowance = process.env.LEDGER_ALLOW_STUB_PROVIDER;

afterEach(() => {
  if (originalAppEnv === undefined) {
    delete process.env.APP_ENV;
  } else {
    process.env.APP_ENV = originalAppEnv;
  }

  if (originalDotenvPath === undefined) {
    delete process.env.DOTENV_CONFIG_PATH;
  } else {
    process.env.DOTENV_CONFIG_PATH = originalDotenvPath;
  }

  if (originalLedgerMode === undefined) {
    delete process.env.LEDGER_ANCHOR_MODE;
  } else {
    process.env.LEDGER_ANCHOR_MODE = originalLedgerMode;
  }

  if (originalStubAllowance === undefined) {
    delete process.env.LEDGER_ALLOW_STUB_PROVIDER;
  } else {
    process.env.LEDGER_ALLOW_STUB_PROVIDER = originalStubAllowance;
  }
});

describe("ledgerService", () => {
  it("anchors through the stub provider in test environments", async () => {
    process.env.APP_ENV = "test";
    process.env.LEDGER_ANCHOR_MODE = "stub";
    delete process.env.LEDGER_ALLOW_STUB_PROVIDER;

    const result = await anchorToLedger("AB12CD34EF56", "a".repeat(64));

    expect(result).toMatchObject({
      status: "anchored",
      provider: "stub",
      ledgerTxId: "ledger_AB12CD34EF56",
    });
  });

  it("fails closed when a non-local environment has no explicit stub allowance", async () => {
    process.env.APP_ENV = "staging";
    process.env.LEDGER_ANCHOR_MODE = "stub";
    delete process.env.LEDGER_ALLOW_STUB_PROVIDER;

    const result = await anchorToLedger("AB12CD34EF56", "a".repeat(64));

    expect(result).toMatchObject({
      status: "failed",
      provider: "unconfigured",
      ledgerTxId: null,
      anchoredAt: null,
    });
    expect(result.errorMessage).toContain('mode "stub"');
    expect(result.errorMessage).toContain('environment "staging"');
  });

  it("rejects simulated anchoring in staging even with the legacy override", async () => {
    process.env.APP_ENV = "staging";
    process.env.LEDGER_ANCHOR_MODE = "stub";
    process.env.LEDGER_ALLOW_STUB_PROVIDER = "true";

    const result = await anchorToLedger("AB12CD34EF56", "a".repeat(64));

    expect(result).toMatchObject({
      status: "failed",
      provider: "unconfigured",
      ledgerTxId: null,
    });
  });

  it("records hash-only disposition without inventing an external receipt", async () => {
    process.env.APP_ENV = "production";
    process.env.LEDGER_ANCHOR_MODE = "hash_only";
    expect(await anchorToLedger("AB12CD34EF56", "a".repeat(64))).toMatchObject({status:"not_required",provider:"hash_only",ledgerTxId:null,anchoredAt:null});
    expect((await anchorToLedger("AB12CD34EF56", "not-a-hash")).status).toBe("failed");
  });
});

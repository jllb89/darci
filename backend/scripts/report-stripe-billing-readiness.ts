import {
  getBillingLifecycleAcceptanceReport,
  getBillingOperationsReport,
} from "../src/services/billingOperationsService";

const args = new Set(process.argv.slice(2));
const databaseOnly = args.has("--database-only");
const requireAcceptance = args.has("--require-acceptance");
const jsonOnly = args.has("--json");

const sinceArgument = process.argv.slice(2).find((value) => value.startsWith("--since="));
const since = sinceArgument?.slice("--since=".length);
if (since && Number.isNaN(new Date(since).getTime())) {
  throw new Error("--since must be an ISO-8601 timestamp");
}

const run = async () => {
  const [operations, lifecycle] = await Promise.all([
    getBillingOperationsReport({ includeProvider: !databaseOnly, webhookLimit: 500 }),
    getBillingLifecycleAcceptanceReport({ ...(since ? { since } : {}) }),
  ]);
  const output = {
    generatedAt: new Date().toISOString(),
    operations,
    lifecycle,
  };

  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    process.stdout.write([
      "DARCi Stripe observe-mode readiness",
      `Provider scan: ${operations.providerScanComplete ? "complete" : "database only"}`,
      `Reconciliation: ${operations.counts.critical} critical, ${operations.counts.high} high, ${operations.counts.medium} medium`,
      `Lifecycle coverage: ${lifecycle.passedCount}/${lifecycle.totalCount}`,
      `Acceptance ID: ${lifecycle.acceptanceId ?? "not yet available"}`,
      `Enforcement recommendation: ${operations.readiness.enforcementRecommendation}`,
      "",
      ...operations.issues.map((issue) => `[${issue.severity}] ${issue.code}: ${issue.message}`),
      ...lifecycle.checks.filter((check) => !check.passed).map((check) => `[missing] ${check.label}`),
      "",
    ].join("\n"));
  }

  if (operations.readiness.blockingIssueCount > 0 || (requireAcceptance && !lifecycle.complete)) {
    process.exitCode = 1;
  }
};

void run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

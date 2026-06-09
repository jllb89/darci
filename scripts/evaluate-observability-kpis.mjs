import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const catalogPath = path.join(repoRoot, "docs", "first-class-error-reporting-catalog.json");

const sourceRoots = [
  path.join(repoRoot, "backend", "src"),
  path.join(repoRoot, "backend", "scripts"),
  path.join(repoRoot, "apps", "web", "src"),
];

const sourceExtensions = new Set([".ts", ".tsx"]);
const criticalCorrelationFiles = new Set([
  "backend/src/services/documentGenerationRenderService.ts",
  "apps/web/src/app/app/review/page.tsx",
  "apps/web/src/app/app/sign/page.tsx",
  "apps/web/src/app/app/notary/requests/[id]/page.tsx",
]);

const walkSourceFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".next") {
        continue;
      }

      files.push(...await walkSourceFiles(entryPath));
      continue;
    }

    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
};

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const collectSourceFacts = async () => {
  const emittedCodes = new Set();
  const directUnclassifiedEmissions = [];
  const criticalCaptureSites = [];
  const files = (await Promise.all(sourceRoots.map(walkSourceFiles))).flat();

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    const relativePath = path.relative(repoRoot, filePath);

    for (const match of source.matchAll(/new\s+DomainError\s*\(\s*\{[\s\S]*?code:\s*"([^"]+)"/g)) {
      emittedCodes.add(match[1]);
    }

    for (const match of source.matchAll(/throwStorageError\(\s*"([^"]+)"/g)) {
      emittedCodes.add(match[1]);
    }

    for (const match of source.matchAll(/errorCode:\s*"([^"]+)"/g)) {
      emittedCodes.add(match[1]);
    }

    if (/UNCLASSIFIED_ERROR/.test(source) && !relativePath.endsWith("domainError.ts")) {
      directUnclassifiedEmissions.push(relativePath);
    }

    if (criticalCorrelationFiles.has(relativePath)) {
      for (const match of source.matchAll(/captureDomainException\s*\(/g)) {
        const snippet = source.slice(match.index ?? 0, (match.index ?? 0) + 1400);
        criticalCaptureSites.push({
          source: relativePath,
          hasCorrelationId: /requestId|request_id/.test(snippet),
        });
      }
    }
  }

  return {
    emittedCodes,
    directUnclassifiedEmissions,
    criticalCaptureSites,
  };
};

const percent = (numerator, denominator) => {
  if (denominator === 0) {
    return 0;
  }

  return (numerator / denominator) * 100;
};

const hasRunbookMapping = (entry) => {
  return Boolean(
    entry.owner &&
    entry.runbookAnchor &&
    Array.isArray(entry.alertRuleIds) &&
    entry.alertRuleIds.length > 0 &&
    Array.isArray(entry.checks) &&
    entry.checks.length >= 1 &&
    Array.isArray(entry.mitigations) &&
    entry.mitigations.length >= 1,
  );
};

const hasFastDiagnosisMapping = (entry) => {
  return Boolean(
    hasRunbookMapping(entry) &&
    entry.checks.length >= 2 &&
    entry.mitigations.length >= 1,
  );
};

const evaluate = async () => {
  const catalog = await readJson(catalogPath);
  const sourceFacts = await collectSourceFacts();
  const alertRuleIds = new Set((catalog.alertRules ?? []).map((rule) => rule.id));
  const catalogEntries = catalog.errors ?? [];
  const catalogByCode = new Map(catalogEntries.map((entry) => [entry.code, entry]));
  const p0Entries = catalogEntries.filter((entry) => entry.severity === "P0");
  const p0MissingRunbook = p0Entries.filter((entry) => !hasRunbookMapping(entry));
  const emittedCatalogMissing = [...sourceFacts.emittedCodes].filter((code) => !catalogByCode.has(code));
  const emittedWithoutActionableFingerprint = emittedCatalogMissing.length + sourceFacts.directUnclassifiedEmissions.length;
  const missingCorrelationSites = sourceFacts.criticalCaptureSites.filter((site) => !site.hasCorrelationId);
  const fastDiagnosisMissing = catalogEntries.filter((entry) => {
    if (entry.severity === "P3") {
      return false;
    }

    return !hasFastDiagnosisMapping(entry);
  });
  const p3Entries = catalogEntries.filter((entry) => entry.severity === "P3");
  const p0AlertRules = catalog.alertRules.filter((rule) => rule.severity === "P0");
  const p0AlertRulesWithoutRunbook = p0AlertRules.filter((rule) => !rule.runbookAnchor || !alertRuleIds.has(rule.id));
  const noiseProxyPercent = percent(p3Entries.length, catalogEntries.length);
  const fingerprintProxyPercent = percent(emittedWithoutActionableFingerprint, sourceFacts.emittedCodes.size);
  const missingCorrelationProxyPercent = percent(
    missingCorrelationSites.length,
    sourceFacts.criticalCaptureSites.length,
  );

  return [
    {
      kpi: "Mean time to identify root cause",
      target: "under 5 minutes",
      status: fastDiagnosisMissing.length === 0 ? "static_ready" : "fail",
      localProxy: `${catalogEntries.length - fastDiagnosisMissing.length}/${catalogEntries.length} catalog entries have owner, alert, runbook, checks, and mitigation metadata`,
      liveDataRequired: "Actual MTTR requires incident timestamps from Sentry/Linear/on-call records.",
      failures: fastDiagnosisMissing.map((entry) => entry.code),
    },
    {
      kpi: "Events missing correlation IDs",
      target: "under 2%",
      status: missingCorrelationProxyPercent < 2 ? "static_ready" : "fail",
      localProxy: `${missingCorrelationSites.length}/${sourceFacts.criticalCaptureSites.length} critical capture sites lack requestId/request_id (${missingCorrelationProxyPercent.toFixed(2)}%)`,
      liveDataRequired: "Actual percentage requires production Sentry events or log export with request_id/document_id/generation_run_id fields.",
      failures: missingCorrelationSites.map((site) => site.source),
    },
    {
      kpi: "Ungrouped/unstable fingerprint rate",
      target: "under 5%",
      status: fingerprintProxyPercent < 5 ? "static_ready" : "fail",
      localProxy: `${emittedWithoutActionableFingerprint}/${sourceFacts.emittedCodes.size} emitted codes lack catalog coverage or directly emit UNCLASSIFIED_ERROR (${fingerprintProxyPercent.toFixed(2)}%)`,
      liveDataRequired: "Actual grouped-event rate requires Sentry issue/event grouping data.",
      failures: [...emittedCatalogMissing, ...sourceFacts.directUnclassifiedEmissions],
    },
    {
      kpi: "P0 alerts without runbook mapping",
      target: "0",
      status: p0MissingRunbook.length === 0 && p0AlertRulesWithoutRunbook.length === 0 ? "met_static" : "fail",
      localProxy: `${p0MissingRunbook.length} P0 catalog entries and ${p0AlertRulesWithoutRunbook.length} P0 alert rules missing runbook metadata`,
      liveDataRequired: null,
      failures: [
        ...p0MissingRunbook.map((entry) => entry.code),
        ...p0AlertRulesWithoutRunbook.map((rule) => rule.id),
      ],
    },
    {
      kpi: "Telemetry noise ratio",
      target: "under 10%",
      status: noiseProxyPercent < 10 ? "static_ready" : "fail",
      localProxy: `${p3Entries.length}/${catalogEntries.length} catalog entries are synthetic/noise-class severity (${noiseProxyPercent.toFixed(2)}%)`,
      liveDataRequired: "Actual noise ratio requires production event volume by severity/actionability.",
      failures: noiseProxyPercent < 10 ? [] : p3Entries.map((entry) => entry.code),
    },
  ];
};

const printResults = (results) => {
  console.log("Observability KPI readiness evaluation");
  console.log("Live production telemetry is required to prove runtime KPI attainment.");

  for (const result of results) {
    console.log(`\n${result.status === "fail" ? "FAIL" : "PASS"}: ${result.kpi}`);
    console.log(`  target: ${result.target}`);
    console.log(`  local proxy: ${result.localProxy}`);
    if (result.liveDataRequired) {
      console.log(`  live data required: ${result.liveDataRequired}`);
    }
    if (result.failures.length > 0) {
      console.log(`  failures: ${result.failures.join(", ")}`);
    }
  }
};

const results = await evaluate();
printResults(results);

if (results.some((result) => result.status === "fail")) {
  process.exitCode = 1;
}
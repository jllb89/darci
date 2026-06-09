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
const allowedCatalogOnlyCodes = new Set(["UNCLASSIFIED_ERROR"]);
const severityLevels = new Set(["P0", "P1", "P2", "P3"]);
const criticalTelemetryFiles = new Set([
  "backend/src/services/documentGenerationRenderService.ts",
  "apps/web/src/app/app/review/page.tsx",
  "apps/web/src/app/app/sign/page.tsx",
  "apps/web/src/app/app/notary/requests/[id]/page.tsx",
  "apps/web/src/app/global-error.tsx",
]);
const forbiddenCriticalCapturePatterns = [
  { label: "Sentry.captureException", regex: /\bSentry\.captureException\s*\(/ },
  { label: "captureException", regex: /\bcaptureException\s*\(/ },
  { label: "captureAppException", regex: /\bcaptureAppException\s*\(/ },
];

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

const readJson = async (filePath) => {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
};

const extractCodeFamily = (source, matchIndex) => {
  const nearby = source.slice(matchIndex, matchIndex + 700);
  const familyMatch = nearby.match(/(?:family|errorFamily):\s*"([^"]+)"/);
  return familyMatch?.[1] ?? null;
};

const collectSourceFacts = async () => {
  const codes = new Map();
  const criticalCaptureViolations = [];
  const files = (await Promise.all(sourceRoots.map(walkSourceFiles))).flat();

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    const relativePath = path.relative(repoRoot, filePath);

    if (criticalTelemetryFiles.has(relativePath)) {
      for (const pattern of forbiddenCriticalCapturePatterns) {
        if (pattern.regex.test(source)) {
          criticalCaptureViolations.push(
            `${relativePath} uses ${pattern.label}; critical flows must use captureDomainException with a cataloged code.`,
          );
        }
      }
    }

    for (const match of source.matchAll(/new\s+DomainError\s*\(\s*\{[\s\S]*?code:\s*"([^"]+)"/g)) {
      const code = match[1];
      codes.set(code, {
        code,
        family: extractCodeFamily(source, match.index ?? 0),
        source: relativePath,
      });
    }

    for (const match of source.matchAll(/throwStorageError\(\s*"([^"]+)"/g)) {
      const code = match[1];
      codes.set(code, {
        code,
        family: "storage",
        source: relativePath,
      });
    }

    for (const match of source.matchAll(/errorCode:\s*"([^"]+)"/g)) {
      const code = match[1];
      codes.set(code, {
        code,
        family: extractCodeFamily(source, match.index ?? 0),
        source: relativePath,
      });
    }
  }

  return {
    codes,
    criticalCaptureViolations,
  };
};

const fail = (messages) => {
  for (const message of messages) {
    console.error(`- ${message}`);
  }

  process.exitCode = 1;
};

const main = async () => {
  const catalog = await readJson(catalogPath);
  const sourceFacts = await collectSourceFacts();
  const sourceCodes = sourceFacts.codes;
  const errors = [];

  errors.push(...sourceFacts.criticalCaptureViolations);

  if (!catalog || typeof catalog !== "object") {
    fail(["Catalog must be a JSON object."]);
    return;
  }

  const ownerIds = new Set(Object.keys(catalog.owners ?? {}));
  const alertRuleIds = new Set((catalog.alertRules ?? []).map((rule) => rule.id));
  const catalogEntries = catalog.errors ?? [];
  const catalogByCode = new Map();

  if (!Array.isArray(catalog.alertRules) || catalog.alertRules.length === 0) {
    errors.push("Catalog must define at least one alert rule.");
  }

  for (const rule of catalog.alertRules ?? []) {
    if (!rule.id) {
      errors.push("Every alert rule must include id.");
    }
    if (!severityLevels.has(rule.severity)) {
      errors.push(`Alert rule ${rule.id ?? "<missing>"} has invalid severity ${rule.severity}.`);
    }
    if (!ownerIds.has(rule.owner)) {
      errors.push(`Alert rule ${rule.id ?? "<missing>"} references unknown owner ${rule.owner}.`);
    }
    if (!rule.sentryQuery || typeof rule.sentryQuery !== "string") {
      errors.push(`Alert rule ${rule.id ?? "<missing>"} must include sentryQuery.`);
    }
    if (!rule.threshold || typeof rule.threshold !== "object") {
      errors.push(`Alert rule ${rule.id ?? "<missing>"} must include threshold.`);
    }
    if (!rule.runbookAnchor || typeof rule.runbookAnchor !== "string") {
      errors.push(`Alert rule ${rule.id ?? "<missing>"} must include runbookAnchor.`);
    }
  }

  for (const entry of catalogEntries) {
    if (!entry.code) {
      errors.push("Every catalog entry must include code.");
      continue;
    }

    if (catalogByCode.has(entry.code)) {
      errors.push(`Duplicate catalog entry for ${entry.code}.`);
      continue;
    }

    catalogByCode.set(entry.code, entry);

    if (!entry.family) {
      errors.push(`${entry.code} must include family.`);
    }
    if (!severityLevels.has(entry.severity)) {
      errors.push(`${entry.code} has invalid severity ${entry.severity}.`);
    }
    if (!ownerIds.has(entry.owner)) {
      errors.push(`${entry.code} references unknown owner ${entry.owner}.`);
    }
    if (!Array.isArray(entry.alertRuleIds) || entry.alertRuleIds.length === 0) {
      errors.push(`${entry.code} must reference at least one alert rule.`);
    } else {
      for (const ruleId of entry.alertRuleIds) {
        if (!alertRuleIds.has(ruleId)) {
          errors.push(`${entry.code} references unknown alert rule ${ruleId}.`);
        }
      }
    }
    if (!entry.runbookAnchor || typeof entry.runbookAnchor !== "string") {
      errors.push(`${entry.code} must include runbookAnchor.`);
    }
    if (!Array.isArray(entry.checks) || entry.checks.length === 0) {
      errors.push(`${entry.code} must include at least one diagnostic check.`);
    }
    if (!Array.isArray(entry.mitigations) || entry.mitigations.length === 0) {
      errors.push(`${entry.code} must include at least one mitigation.`);
    }
  }

  for (const [code, sourceEntry] of sourceCodes.entries()) {
    const catalogEntry = catalogByCode.get(code);
    if (!catalogEntry) {
      errors.push(`${code} is emitted in ${sourceEntry.source} but missing from the catalog.`);
      continue;
    }

    if (sourceEntry.family && catalogEntry.family !== sourceEntry.family) {
      errors.push(`${code} family mismatch: source emits ${sourceEntry.family}, catalog has ${catalogEntry.family}.`);
    }
  }

  if (sourceCodes.has("UNCLASSIFIED_ERROR")) {
    errors.push("UNCLASSIFIED_ERROR must remain a catalog/runbook fallback policy and must not be emitted directly by source code.");
  }

  for (const code of catalogByCode.keys()) {
    if (!sourceCodes.has(code) && !allowedCatalogOnlyCodes.has(code)) {
      errors.push(`${code} is in the catalog but is not emitted by scanned source files.`);
    }
  }

  if (errors.length > 0) {
    fail(errors);
    return;
  }

  console.log(`Validated ${catalogByCode.size} catalog entries against ${sourceCodes.size} emitted error codes.`);
  console.log(`Validated ${alertRuleIds.size} alert rules and ${ownerIds.size} owners.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
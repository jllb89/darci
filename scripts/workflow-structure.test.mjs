import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
const ci = read('ci'), deploy = read('deploy-staging'), ios = read('ios');
const mobileMake = readFileSync(new URL('../apps/mobile/Makefile', import.meta.url), 'utf8');
const mobileProject = readFileSync(new URL('../apps/mobile/project.yml', import.meta.url), 'utf8');
const job = (source, name) => source.split(`\n  ${name}:\n`)[1]?.split(/\n  [\w-]+:\n/)[0] ?? '';

test('server deployment reuses exact-commit CI instead of running the suite twice', () => {
  assert.doesNotMatch(deploy, /uses: .*ci\.yml/);
  assert.match(job(deploy, 'validate'), /node scripts\/workflow-gates\.mjs wait-ci/);
  assert.doesNotMatch(ci, /\n  ios:/);
  assert.equal(ios.match(/xcodebuild build-for-testing/g)?.length, 1);
  assert.equal(ios.match(/xcodebuild test-without-building/g)?.length, 1);
  assert.doesNotMatch(ios, /xcodebuild test -/);
  assert.match(ios, /xcodebuild test-without-building -xctestrun/);
  assert.doesNotMatch(ios, /generic\/platform=iOS Simulator/);
});

test('iOS CI pins its toolchain and dependency graph while retaining every test', () => {
  assert.match(ios, /permissions:\n  contents: read/);
  assert.match(ios, /cancel-in-progress: true/);
  assert.match(ios, /DEVELOPER_DIR: \/Applications\/Xcode_26\.6\.app\/Contents\/Developer/);
  assert.match(ios, /DARCI_IOS_RUNTIME: com\.apple\.CoreSimulator\.SimRuntime\.iOS-26-5/);
  assert.match(mobileMake, /cp \$\(PACKAGE_LOCK\) \$\(GENERATED_PACKAGE_LOCK\)/);
  assert.match(mobileProject, /test:\n      config: Debug\n      targets:\n        - DARCiMobileTests\n        - DARCiMobileUITests/);
  assert.match(ios, /-onlyUsePackageVersionsFromResolvedFile/);
  assert.match(ios, /-skipPackageUpdates/);
  assert.match(ios, /-parallel-testing-enabled NO/);
  assert.match(ios, /defaults write com\.apple\.iphonesimulator ConnectHardwareKeyboard -bool false/);
  assert.doesNotMatch(ios, /-only-testing|-skip-testing|continue-on-error|\.env\.staging/);
});

test('iOS CI separates stable packages from incremental products and preserves diagnostics', () => {
  assert.equal(ios.match(/uses: actions\/cache\/restore@v4/g)?.length, 2);
  assert.equal(ios.match(/uses: actions\/cache\/save@v4/g)?.length, 2);
  assert.ok(ios.indexOf('Save successful build products') < ios.indexOf('Run the full unit and UI test suites'));
  assert.match(ios, /steps\.build\.outcome == 'success'/);
  assert.match(ios, /steps\.build-cache\.outputs\.cache-primary-key/);
  assert.doesNotMatch(ios, /hashFiles\([^\n]*ios\.yml/);
  assert.match(ios, /node scripts\/summarize-ios-tests\.mjs/);
  assert.match(ios, /darci-ios-test-summary\.json/);
  assert.match(ios, /darci-ios-packages/);
  assert.match(ios, /darci-ios-build\/Build/);
  assert.match(ios, /darci-ios-build\/ModuleCache\.noindex/);
  assert.match(ios, /darci-ios-test-results\.xcresult/);
  assert.match(ios, /COMPILER_INDEX_STORE_ENABLE=NO/);
});

test('prerequisites gate candidate builds, which run alongside validation', () => {
  assert.match(job(deploy, 'preflight'), /node backend\/scripts\/check-phase1-staging-deploy\.mjs/);
  assert.match(job(deploy, 'build-images'), /needs: \[changes, preflight\]/);
  assert.match(job(deploy, 'validate'), /needs: \[changes, preflight\]/);
  assert.match(job(deploy, 'deploy'), /- validate/);
  assert.match(job(deploy, 'deploy'), /- build-images/);
  assert.match(job(deploy, 'deploy'), /check-phase1-staging-deploy\.mjs/);
});

test('digest scans and database-security tests remain mandatory', () => {
  assert.match(job(deploy, 'build-images'), /--scanners vuln --severity HIGH,CRITICAL/);
  assert.match(job(deploy, 'build-images'), /--ignorefile \/dev\/null --exit-code 1/);
  assert.doesNotMatch(job(deploy, 'build-images'), /:staging-latest/);
  assert.match(ci, /test-phase1-storage-boundary\.mjs/);
  assert.match(ci, /test-phase1-billing-sql\.mjs/);
});

test('failed-rollout changes and runtime templates remain in the next build', () => {
  assert.match(job(deploy, 'changes'), /workflow-gates\.mjs baseline/);
  assert.match(job(deploy, 'changes'), /base: \$\{\{ steps\.baseline\.outputs\.base \}\}/);
  assert.match(job(deploy, 'changes'), /'docs\/\*\*'/);
  assert.match(job(deploy, 'changes'), /'supabase\/migrations\/\*\*'/);
});

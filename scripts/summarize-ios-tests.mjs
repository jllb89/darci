import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const clean = value => String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/[<>`]/g, '');

export function summarizeIOSTests(summary) {
  if (!Number.isInteger(summary.totalTestCount) || !Array.isArray(summary.testFailures)) {
    throw new Error('Invalid xcresult test summary');
  }
  const lines = [
    '## iOS test results',
    '',
    `${clean(summary.result)}: ${summary.passedTests} passed, ${summary.failedTests} failed, ${summary.skippedTests} skipped (${summary.totalTestCount} total).`,
    '',
  ];
  for (const failure of summary.testFailures) {
    lines.push(`- ${clean(failure.testIdentifierString || failure.testName)}: ${clean(failure.failureText)}`);
  }
  if (summary.testFailures.length) {
    lines.push('', 'Download the darci-ios-test-results artifact for screenshots, recordings and detailed diagnostics.');
  }
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = summarizeIOSTests(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  console.log(output);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, output);
  // Reporting only. The xcodebuild step independently fails the job on test errors.
}

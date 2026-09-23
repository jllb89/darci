import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeIOSTests } from './summarize-ios-tests.mjs';

const summary = {
  result: 'Failed', totalTestCount: 132, passedTests: 131, failedTests: 1, skippedTests: 0,
  testFailures: [{ testIdentifierString: 'DARCiMobileUITests/testLaunchesOnboardingSplash()', failureText: 'XCTAssertTrue failed' }],
};

test('reports totals and the failing test without the full Xcode log', () => {
  const output = summarizeIOSTests(summary);
  assert.match(output, /131 passed, 1 failed, 0 skipped \(132 total\)/);
  assert.match(output, /DARCiMobileUITests\/testLaunchesOnboardingSplash\(\): XCTAssertTrue failed/);
  assert.match(output, /darci-ios-test-results artifact/);
});

test('reports clean runs without a failure artifact claim', () => {
  const output = summarizeIOSTests({ ...summary, result: 'Passed', passedTests: 132, failedTests: 0, testFailures: [] });
  assert.match(output, /Passed: 132 passed, 0 failed/);
  assert.doesNotMatch(output, /Download/);
});

test('flattens multiline errors and rejects missing test data', () => {
  assert.doesNotMatch(summarizeIOSTests({ ...summary, testFailures: [{ testName: 'testFallback()', failureText: '<error>\n`details`' }] }), /<error>|`details`/);
  assert.throws(() => summarizeIOSTests({}), /Invalid xcresult/);
});

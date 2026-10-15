import assert from 'node:assert/strict';
import {test} from 'node:test';
import {APP_REVIEW_WINDOW_MS, createAppReviewWindow} from './app-review-window.mjs';

test('review allowance uses exactly 30 days, even at millisecond boundaries', () => {
  for (const start of ['2026-10-13T22:01:49.303Z', '2026-10-31T23:59:59.999Z', '2026-12-31T23:59:59.999Z']) {
    const window = createAppReviewWindow(Date.parse(start));
    assert.equal(window.startsAt, start);
    assert.equal(Date.parse(window.expiresAt) - Date.parse(window.startsAt), APP_REVIEW_WINDOW_MS);
  }
});

test('review window reads the clock only once', () => {
  const original = Date.now;
  let calls = 0;
  Date.now = () => 1_792_015_309_303 + calls++ * 8;
  try {
    const window = createAppReviewWindow();
    assert.equal(calls, 1);
    assert.equal(Date.parse(window.expiresAt) - Date.parse(window.startsAt), APP_REVIEW_WINDOW_MS);
  } finally { Date.now = original; }
});

test('invalid review window starts are rejected', () => {
  assert.throws(() => createAppReviewWindow(NaN));
});

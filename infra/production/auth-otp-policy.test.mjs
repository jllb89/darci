import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alignProductionOtpSettings, assertProductionOtpSettings, productionOtpSettings} from './auth-otp-policy.mjs';

test('repair changes only both OTP lengths and preserves auth security and delivery settings', async () => {
  let config = {disable_signup: true, mailer_otp_length: 6, sms_otp_length: 6,
    mailer_otp_exp: 3600, sms_otp_exp: 60, hook_send_sms_enabled: true, mfa_totp_verify_enabled: true};
  const calls = [];
  const result = await alignProductionOtpSettings(async (path, options) => {
    assert.equal(path, '/config/auth'); calls.push(options);
    if (options) {assert.equal(options.method, 'PATCH'); assert.deepEqual(options.body, productionOtpSettings); config = {...config, ...options.body};}
    return {...config};
  });
  assert.equal(calls.length, 3); assert.equal(result.changed, true);
  assert.deepEqual(result.after, productionOtpSettings); assert.equal(result.messagesSent, 0);
  assert.deepEqual(result.unrelatedSettingsChanged, []);
});
test('already aligned production is read-only and idempotent', async () => {
  const result = await alignProductionOtpSettings(async (_, options) => {
    assert.equal(options, undefined); return {disable_signup: true, ...productionOtpSettings};
  });
  assert.equal(result.changed, false);
});
test('rejects open-signup baseline and mismatched email or SMS readback', async () => {
  await assert.rejects(alignProductionOtpSettings(async () => ({disable_signup: false})));
  for (const key of Object.keys(productionOtpSettings)) {
    assert.throws(() => assertProductionOtpSettings({...productionOtpSettings, [key]: 6}));
  }
});
test('detects unexpected auth changes instead of silently treating repair as successful', async () => {
  let reads = 0;
  await assert.rejects(alignProductionOtpSettings(async (_, options) => {
    if (options) return {};
    reads += 1;
    return {disable_signup: reads === 1, ...productionOtpSettings};
  }), /Unexpected unrelated/);
});

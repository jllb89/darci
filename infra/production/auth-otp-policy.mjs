import assert from 'node:assert/strict';

// Match DARCi's deployed phone challenge contract and eight-box native UI.
// Supabase defaults to six digits when a new project is provisioned.
export const productionOtpSettings = Object.freeze({mailer_otp_length: 8, sms_otp_length: 8});

export function assertProductionOtpSettings(config) {
  for (const [key, value] of Object.entries(productionOtpSettings)) {
    assert.equal(config[key], value, `Production ${key} must match DARCi's eight-digit challenge`);
  }
}

export async function alignProductionOtpSettings(management) {
  const before = await management('/config/auth');
  assert.equal(before.disable_signup, true, 'Expected private production with signup closed');
  const lengths = config => Object.fromEntries(Object.keys(productionOtpSettings).map(k => [k, config[k]]));
  const changed = Object.keys(productionOtpSettings).some(k => before[k] !== productionOtpSettings[k]);
  if (changed) await management('/config/auth', {method: 'PATCH', body: {...productionOtpSettings}});
  const after = await management('/config/auth');
  assertProductionOtpSettings(after);
  const unrelated = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(k => !(k in productionOtpSettings) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  assert.deepEqual(unrelated, [], 'Unexpected unrelated auth configuration change');
  return {changed, before: lengths(before), after: lengths(after), signupEnabled: false,
    unrelatedSettingsChanged: unrelated, messagesSent: 0};
}

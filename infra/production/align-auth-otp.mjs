import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {productionManagement} from './provider-credentials.mjs';
import {alignProductionOtpSettings, assertProductionOtpSettings} from './auth-otp-policy.mjs';

assert(process.argv.length === 3 && ['--apply', '--check'].includes(process.argv[2]), 'Use --check or --apply');
if (process.argv[2] === '--check') {
  const config = await productionManagement('/config/auth');
  assertProductionOtpSettings(config);
  console.log(JSON.stringify({passed: true, project: 'jdrgluisxhgegdsesman', emailDigits: 8, smsDigits: 8, messagesSent: 0}));
} else {
  const result = await alignProductionOtpSettings(productionManagement);
  const directory = mkdtempSync('.recovery-private/production-otp-alignment-');
  const report = {at: new Date().toISOString(), project: 'jdrgluisxhgegdsesman', ...result};
  writeFileSync(directory + '/report.json', JSON.stringify(report, null, 2), {mode: 0o600});
  console.log(JSON.stringify({...report, evidence: directory + '/report.json'}));
}

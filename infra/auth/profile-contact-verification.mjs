import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {supabaseManagementToken} from '../production/provider-credentials.mjs';

export const emailChangeTemplate = `<html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#111">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:white">
<tr><td style="padding:24px;background:#00ef35;font-size:24px">DARCi</td></tr>
<tr><td style="padding:28px 24px"><h1 style="font-size:24px;font-weight:normal;margin:0 0 20px">Confirm your email change</h1>
<p style="font-size:16px;line-height:1.5">Use this code in Settings to confirm the change from {{ .Email }} to {{ .NewEmail }}.</p>
<p style="font-size:32px;font-family:monospace;padding:20px;background:#f5f5f5;text-align:center">{{ .Token }}</p>
<p style="font-size:14px;line-height:1.5;color:#555">For security, we may send a separate code to each address. In Settings, select the inbox this code came from. Your email changes only after all required confirmations are complete.</p>
<p style="font-size:14px;line-height:1.5;color:#555">If you didn’t request this change, don’t share this code. Contact support if you need help.</p></td></tr>
</table></td></tr></table></body></html>`;

export const contactVerificationSettings = Object.freeze({
  mailer_subjects_email_change: 'Confirm your DARCi email change',
  mailer_templates_email_change_content: emailChangeTemplate,
});

export function assertContactVerification(config) {
  assert.equal(config.mailer_autoconfirm, false, 'Email confirmation must remain required');
  assert.equal(config.sms_autoconfirm, false, 'Phone confirmation must remain required');
  assert.equal(config.mailer_secure_email_change_enabled, true, 'Keep both-inbox confirmation enabled');
  assert.match(config.mailer_templates_email_change_content || '', /{{\s*\.Token\s*}}/, 'Email-change template must contain an OTP');
  assert.equal(config.hook_send_sms_enabled, true, 'Expected existing SMS delivery hook');
}

export async function configureContactVerification(management, additionalSettings = {}) {
  const before = await management('GET');
  // Do not loosen confirmation or alter signup, callbacks, OTP lengths, credentials or other templates.
  assert.equal(before.mailer_autoconfirm, false);
  assert.equal(before.sms_autoconfirm, false);
  assert.equal(before.mailer_secure_email_change_enabled, true);
  const patch = {...contactVerificationSettings, ...additionalSettings};
  const changed = Object.keys(patch).filter(k => before[k] !== patch[k]);
  if (changed.length) await management('PATCH', Object.fromEntries(changed.map(k => [k, patch[k]])));
  const after = await management('GET');
  assertContactVerification(after);
  for (const [key, value] of Object.entries(patch)) {
    // Management API masks SMTP credentials on reads; never compare/log a password.
    if (key === 'smtp_pass') {
      if (!after[key]) throw new Error('SMTP credential missing after update');
    } else if (after[key] !== value) throw new Error(`Setting not applied: ${key}`);
  }
  // Hosted Auth exposes both legacy fields and their uppercase-keyed template mirrors.
  // Permit only the corresponding email-change entry, never unrelated template changes.
  const mirrors = {
    mailer_subjects_custom_contents: 'mailer_subjects_email_change',
    mailer_templates_custom_contents: 'mailer_templates_email_change_content',
  };
  const permittedMirrors = [];
  for (const [mirror, source] of Object.entries(mirrors)) {
    if (JSON.stringify(before[mirror]) === JSON.stringify(after[mirror])) continue;
    const entry = source.toUpperCase();
    assert.equal(after[mirror]?.[entry], patch[source], `Unexpected mirror value: ${mirror}`);
    const remaining = value => Object.fromEntries(Object.entries(value || {}).filter(([k]) => k !== entry));
    assert.deepEqual(remaining(after[mirror]), remaining(before[mirror]), `Unexpected unrelated template mirror change: ${mirror}`);
    permittedMirrors.push(mirror);
  }
  const unrelated = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(k => !(k in patch) && !permittedMirrors.includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  assert.deepEqual(unrelated, [], 'Unexpected unrelated Auth setting changes');
  return {changed, messagesSent: 0};
}

async function main() {
  const [environment, mode, smtpOption] = process.argv.slice(2);
  assert(['staging', 'production'].includes(environment) && ['--check', '--apply'].includes(mode), 'Use staging|production --check|--apply [--configure-staging-smtp]');
  assert(!smtpOption || (smtpOption === '--configure-staging-smtp' && environment === 'staging' && mode === '--apply'), 'SMTP option is staging-only');
  const project = environment === 'staging' ? 'oqferisuloumoojgbjde' : 'jdrgluisxhgegdsesman';
  const token = supabaseManagementToken();
  const management = async (method, body) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${project}/config/auth`, {
      method, headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
    });
    assert(r.ok, `Auth configuration request failed: ${r.status}`);
    return r.json();
  };
  const before = await management('GET');
  if (mode === '--check') {
    assertContactVerification(before);
    console.log(JSON.stringify({environment, passed: true, smtpConfigured: !!before.smtp_host, messagesSent: 0}));
    return;
  }
  const additional = {};
  if (smtpOption) {
    assert(!before.smtp_host || before.smtp_host === 'smtp.resend.com', 'Do not replace a different staging SMTP provider');
    const require = createRequire(import.meta.url);
    const env = require('../../backend/node_modules/dotenv').parse(readFileSync('.env.staging'));
    const sender = env.AUTH_OTP_FROM_ADDRESS;
    const address = sender?.match(/<([^>]+)>/)?.[1];
    assert(address && env.RESEND_API_KEY, 'Missing existing staging sender/Resend credential');
    Object.assign(additional, {smtp_host: 'smtp.resend.com', smtp_port: '465', smtp_user: 'resend',
      smtp_pass: env.RESEND_API_KEY, smtp_admin_email: address, smtp_sender_name: 'DARCi'});
  }
  // Backup only changed settings locally; credentials must never be logged or committed.
  const directory = mkdtempSync('/private/tmp/darci-contact-auth-');
  const keys = Object.keys({...contactVerificationSettings, ...additional});
  writeFileSync(`${directory}/before.json`, JSON.stringify(Object.fromEntries(keys.map(k => [k, before[k]]))), {mode: 0o600});
  const result = await configureContactVerification(management, additional);
  console.log(JSON.stringify({environment, ...result, backup: `${directory}/before.json`}));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  console.error('Contact Auth configuration or validation failed; credential diagnostics are suppressed.');
  process.exitCode = 1;
});

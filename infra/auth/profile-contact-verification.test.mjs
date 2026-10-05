import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertContactVerification, configureContactVerification, contactVerificationSettings} from './profile-contact-verification.mjs';

const config = () => ({mailer_autoconfirm: false, sms_autoconfirm: false, mailer_secure_email_change_enabled: true,
  hook_send_sms_enabled: true, disable_signup: true, mailer_otp_length: 8, sms_otp_length: 8,
  smtp_pass: 'not-to-be-changed', mailer_templates_magic_link_content: 'existing login template',
  mailer_templates_email_change_content: '<a href="{{ .ConfirmationURL }}">Confirm</a>'});

test('adds only the OTP change template and subject, preserving all security/provider settings', async () => {
  let current = config(); const patches = [];
  const management = async (method, body) => {
    if (method === 'PATCH') { patches.push(body); current = {...current, ...body}; }
    return {...current};
  };
  const result = await configureContactVerification(management);
  assert.deepEqual(patches, [contactVerificationSettings]);
  assert.equal(result.messagesSent, 0); assert.equal(current.smtp_pass, 'not-to-be-changed');
  assertContactVerification(current);
  await configureContactVerification(management); assert.equal(patches.length, 1);
});

test('refuses an environment that bypasses verification', async () => {
  for (const changes of [{mailer_autoconfirm: true}, {sms_autoconfirm: true}, {mailer_secure_email_change_enabled: false}]) {
    let mutations = 0;
    await assert.rejects(configureContactVerification(async method => { if (method === 'PATCH') mutations++; return {...config(), ...changes}; }));
    assert.equal(mutations, 0);
  }
});

test('detects unexpected configuration changes', async () => {
  let current = config();
  await assert.rejects(configureContactVerification(async (method, body) => {
    if (method === 'PATCH') current = {...current, ...body, disable_signup: false};
    return {...current};
  }), /unrelated/);
});

test('accepts only the requested email-change entries in hosted template mirrors', async () => {
  for (const corruptUnrelated of [false, true]) {
    let current = {...config(), mailer_subjects_custom_contents: {MAILER_SUBJECTS_MAGIC_LINK: 'Existing'},
      mailer_templates_custom_contents: {MAILER_TEMPLATES_MAGIC_LINK_CONTENT: 'Existing body'}};
    const operation = configureContactVerification(async (method, body) => {
      if (method === 'PATCH') current = {...current, ...body,
        mailer_subjects_custom_contents: {...current.mailer_subjects_custom_contents,
          MAILER_SUBJECTS_EMAIL_CHANGE: body.mailer_subjects_email_change,
          ...(corruptUnrelated ? {MAILER_SUBJECTS_MAGIC_LINK: 'Changed'} : {})},
        mailer_templates_custom_contents: {...current.mailer_templates_custom_contents,
          MAILER_TEMPLATES_EMAIL_CHANGE_CONTENT: body.mailer_templates_email_change_content}};
      return {...current};
    });
    if (corruptUnrelated) await assert.rejects(operation, /unrelated template mirror/);
    else await operation;
  }
});

test('accepts masked SMTP credentials without exposing them in assertion diagnostics', async () => {
  let current = config();
  const result = await configureContactVerification(async (method, body) => {
    if (method === 'PATCH') current = {...current, ...body, smtp_pass: 'masked-password'};
    return {...current};
  }, {smtp_host: 'smtp.resend.com', smtp_pass: 'synthetic-credential'});
  assert.equal(result.messagesSent, 0);
});

// Existing synthetic users only: login acceptance does not authorize public signup.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {productionManagement} from './provider-credentials.mjs';
import {productionOtpSettings} from './auth-otp-policy.mjs';
const require=createRequire(import.meta.url);
assert(process.argv.includes('--approved-isolated-auth'));
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
const raw=aws('cloudformation','get-template','--stack-name','darci-production-runtime').TemplateBody;
const template=typeof raw==='string'?JSON.parse(raw):raw;assert(template.Resources.SupabaseSmsWebhookRoute);
const local=require('../../backend/node_modules/dotenv').parse(readFileSync('.env.production'));
const version=stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue;
const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',version).SecretString);
assert(secret.SUPABASE_AUTH_SMS_HOOK_SECRET===local.SUPABASE_AUTH_SMS_HOOK_SECRET,'Pinned SMS secret mismatch');
assert(secret.SUPABASE_AUTH_SMS_HOOK_SECRET?.startsWith('v1,whsec_'));
const before=await productionManagement('/config/auth');assert.equal(before.disable_signup,true);
const changes={...productionOtpSettings,disable_signup:true,external_email_enabled:true,external_phone_enabled:true,
  mfa_totp_enroll_enabled:true,mfa_totp_verify_enabled:true,
  hook_send_sms_enabled:true,hook_send_sms_uri:'https://api.illuminotary.com/webhooks/supabase/auth/send-sms',hook_send_sms_secrets:secret.SUPABASE_AUTH_SMS_HOOK_SECRET};
await productionManagement('/config/auth',{method:'PATCH',body:changes});
const after=await productionManagement('/config/auth');
for(const [key,value] of Object.entries(changes))if(key!=='hook_send_sms_secrets')assert.equal(after[key],value,`${key} readback mismatch`);
const unrelated=Object.keys(before).filter(k=>!(k in changes)&&JSON.stringify(before[k])!==JSON.stringify(after[k]));
assert.deepEqual(unrelated,[],'Unexpected Auth settings changed');
const report={at:new Date().toISOString(),signupEnabled:false,existingUserEmailLogin:true,existingUserPhoneLogin:true,
  totpEnrollmentEnabled:true,totpVerificationEnabled:true,
  smsHookEnabled:true,smsHookUri:changes.hook_send_sms_uri,unrelatedSettingsChanged:unrelated,operatorMessagesSent:0};
const dir=mkdtempSync('.recovery-private/production-auth-acceptance-config-');
writeFileSync(dir+'/report.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({...report,evidence:dir}));

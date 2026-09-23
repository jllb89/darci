import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, chmodSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require = createRequire(import.meta.url);
const dotenv = require('../../backend/node_modules/dotenv');

export function supabaseManagementToken() {
  let value = process.env.SUPABASE_ACCESS_TOKEN;
  if (!value) value = execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  if (value.startsWith('go-keyring-base64:')) value = Buffer.from(value.slice(18), 'base64').toString();
  else if (value.startsWith('go-keyring-encoded:')) value = Buffer.from(value.slice(19), 'hex').toString();
  assert(/^sbp_(oauth_)?[a-f0-9]{40}$/.test(value), 'Unexpected Supabase CLI token format');
  return value;
}

export async function productionManagement(path, {method = 'GET', body} = {}) {
  assert(path.startsWith('/'), 'Expected project-relative management path');
  const response = await fetch('https://api.supabase.com/v1/projects/jdrgluisxhgegdsesman' + path, {
    method, headers: {Authorization: 'Bearer ' + supabaseManagementToken(), 'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
  });
  assert(response.ok, `Production Supabase management request failed: ${response.status}`);
  return response.json();
}

// Mechanical, guarded credential synchronization. Values never enter tool output,
// patch arguments or command-line arguments. Only approved Maps values cross environments.
async function prepare() {
  assert(process.argv.includes('--prepare-approved-env'));
  execFileSync('git', ['check-ignore', '.env.production'], {stdio: 'pipe'});
  assert.equal(execFileSync('git', ['ls-files', '.env.production'], {encoding: 'utf8'}).trim(), '');
  const original = readFileSync('.env.production', 'utf8');
  const local = dotenv.parse(original), stage = dotenv.parse(readFileSync('.env.staging'));
  const runtime = JSON.parse(JSON.parse(execFileSync('aws', ['secretsmanager', 'get-secret-value', '--secret-id', '/darci/production/app',
    '--region', 'us-east-1', '--output', 'json'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']})).SecretString);
  assert.equal(runtime.SUPABASE_URL, 'https://jdrgluisxhgegdsesman.supabase.co');
  const wanted = {...Object.fromEntries(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'REDIS_URL',
    'IDENTITY_FIELD_ENCRYPTION_KEY', 'IDENTITY_FIELD_ENCRYPTION_KEY_ID', 'ABUSE_RATE_KEY_SECRET', 'RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET']
    .map(k => [k, runtime[k] || ''])),
    NEXT_PUBLIC_SUPABASE_URL: runtime.SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: runtime.SUPABASE_ANON_KEY,
    APP_ENV: 'production', NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.illuminotary.com',
    WEB_APP_URL: 'https://app.illuminotary.com', NEXT_PUBLIC_WEB_BASE_URL: 'https://app.illuminotary.com',
    STRIPE_SECRET_KEY: '', STRIPE_PUBLISHABLE_KEY: local.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: local.STRIPE_PUBLISHABLE_KEY || '', STRIPE_WEBHOOK_SECRET: '',
    STRIPE_PROVIDER_ENVIRONMENT: 'live', STRIPE_LIVE_MODE_ENABLED: 'false', STRIPE_RETURN_URL: 'https://app.illuminotary.com/app/billing',
    APNS_KEY_ID: '', APNS_TEAM_ID: '', APNS_PRIVATE_KEY: '', APNS_BUNDLE_ID: 'com.illuminote.darci', APNS_ENVIRONMENT: 'production',
    SUPABASE_AUTH_SMS_HOOK_SECRET: '', SUPABASE_AUTH_SMS_HOOK_ENABLED: 'false', PINPOINT_SMS_REGION: 'us-east-1',
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: stage.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    GOOGLE_MAPS_SERVER_API_KEY: stage.GOOGLE_MAPS_SERVER_API_KEY || '',
    GOOGLE_MAPS_GEOCODE_USE_SERVER: 'true', NEXT_PUBLIC_GOOGLE_MAPS_LIBRARIES: 'places',
    NEXT_PUBLIC_GOOGLE_MAPS_AUTOCOMPLETE_ENABLED: 'true',
  };
  let result = original;
  const added = [], populated = [];
  for (const [key, value] of Object.entries(wanted)) {
    if (local[key]?.trim()) continue; // Never overwrite a value supplied by Jorge.
    const line = `${key}=${value ? JSON.stringify(value) : ''}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(result)) {if (value) {result = result.replace(pattern, () => line); populated.push(key);}}
    else {result += '\n' + line; added.push(key);}
  }
  result += '\n';
  writeFileSync('.env.production', result, {mode: 0o600}); chmodSync('.env.production', 0o600);
  const parsed = dotenv.parse(result);
  for (const [key, value] of Object.entries(local)) if (value.trim()) assert.equal(parsed[key], value, `Existing ${key} changed`);
  console.log(JSON.stringify({added, populated, missing: Object.keys(wanted).filter(k => !parsed[k]?.trim()), protectedMode: '0600'}));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) prepare().catch(() => {
  console.error('Credential preparation stopped; no secret diagnostics emitted.'); process.exitCode = 1;
});

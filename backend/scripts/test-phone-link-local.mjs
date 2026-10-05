// Real local GoTrue/PostgREST and Redis; SMS and email transport are intercepted.
// Never load production env files or use real recipient addresses.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const require = createRequire(import.meta.url);
assert(process.argv.includes('--confirm-isolated'));
const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
assert(['http://127.0.0.1:54321', 'http://127.0.0.1:55321'].includes(config.API_URL));
Object.assign(process.env, { APP_ENV: 'phone-link-rehearsal', SUPABASE_URL: config.API_URL,
  SUPABASE_ANON_KEY: config.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: config.SERVICE_ROLE_KEY,
  ABUSE_RATE_KEY_SECRET: randomUUID(), RESEND_API_KEY: 'intercepted-local-only',
  AUTH_OTP_FROM_ADDRESS: 'DARCi <fixture@example.invalid>', WEB_APP_URL: 'http://localhost:3000',
  AUTH_ALLOWED_ORIGINS: '', AUTH_REQUEST_SIGNATURE_SECRET: '', SENTRY_ENABLED: 'false', SENTRY_DSN: '' });
const directory = await mkdtemp('/tmp/darci-phone-link-provider-');
const socket = `${directory}/redis.sock`;
process.env.REDIS_URL = socket;
const server = spawn('redis-server', ['--port','0','--unixsocket',socket,'--unixsocketperm','700','--save','','--appendonly','no'], { stdio: ['ignore','pipe','pipe'] });
let smsCode, emailCode;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.href);
  if (url.origin === 'https://api.resend.com' && url.pathname === '/emails') {
    const body = JSON.parse(init.body);
    assert(String(body.to).endsWith('@example.invalid'));
    emailCode = body.text.match(/code is (\d+)/)?.[1];
    assert(emailCode);
    return new Response(JSON.stringify({ id: 'local-intercepted-email' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  assert.equal(url.origin, config.API_URL, 'Unexpected outbound network destination');
  return originalFetch(input, init);
};
let safety;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Local Redis startup timed out')), 5000);
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.stdout.on('data', chunk => { if (String(chunk).toLowerCase().includes('ready to accept connections')) { clearTimeout(timeout); resolve(); } });
  });
  const { createClient } = require('@supabase/supabase-js');
  const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.createUser({ email: `phone-link-${randomUUID()}@example.invalid`, email_confirm: true, user_metadata: { first_name: 'Phone Link', last_name: 'Fixture' } });
  assert.equal(error, null);
  const user = data.user;
  // Unique synthetic NANP number: no real SMS is dispatched by this script.
  const phone = `+1555${String(Date.now()).slice(-7)}`;
  const profile = await admin.from('users').upsert({ id: user.id, supabase_user_id: user.id, email: user.email, phone, status: 'active', role: 'member', first_name: 'Phone Link', last_name: 'Fixture' }, { onConflict: 'supabase_user_id' }).select('id').single();
  assert.equal(profile.error, null);
  require('../dist/services/supabaseAuthSmsHookService.js').sendSupabaseAuthSms = async ({ otp }) => { smsCode = otp; return { messageId: 'local-intercepted-sms' }; };
  const { phoneLinkService } = require('../dist/services/phoneLinkService.js');
  const controller = require('../dist/controllers/authController.js');
  safety = require('../dist/middleware/productionSafety.js');
  const call = async (handler, body) => {
    let status, payload;
    const response = { setHeader() {}, status(code) { status = code; return this; }, json(value) { payload = value; return this; } };
    await handler({ headers: {}, body, method: 'POST', path: '/auth/otp/phone/link/verify' }, response);
    return { status, payload };
  };
  await phoneLinkService.requestSms(phone);
  const sms = await call(controller.verifyPhoneOtp, { phone, token: smsCode });
  assert.equal(sms.status, 200);
  assert(sms.payload.phoneLink?.token);
  assert(!sms.payload.accessToken);
  const phoneLinkToken = sms.payload.phoneLink.token;
  const email = await call(controller.requestPhoneLinkEmail, { email: user.email, phoneLinkToken });
  assert.equal(email.status, 200);
  assert(emailCode);
  const before = await admin.auth.admin.getUserById(user.id);
  assert(!before.data.user.phone, 'No account update before both proofs');
  const wrong = await call(controller.verifyPhoneLinkEmail, { email: user.email, phoneLinkToken, token: 'incorrect' });
  assert.equal(wrong.status, 401);
  const linked = await call(controller.verifyPhoneLinkEmail, { email: user.email, phoneLinkToken, token: emailCode });
  assert.equal(linked.status, 200, linked.payload?.message);
  assert(linked.payload.accessToken);
  const session = await admin.auth.getUser(linked.payload.accessToken);
  assert.equal(session.data.user.id, user.id);
  const after = await admin.auth.admin.getUserById(user.id);
  assert.equal(after.data.user.phone, phone.slice(1));
  assert(after.data.user.phone_confirmed_at);
  const mirror = await admin.from('users').select('id,phone,phone_confirmed_at').eq('supabase_user_id', user.id).single();
  assert.equal(mirror.data.id, profile.data.id);
  assert.equal(mirror.data.phone, phone);
  assert(mirror.data.phone_confirmed_at);
  const replay = await call(controller.verifyPhoneLinkEmail, { email: user.email, phoneLinkToken, token: emailCode });
  assert.equal(replay.status, 401);
  console.log('PASS: real local phone proof → email OTP → same Auth/app account; confirmed phone persisted, session valid, wrong code/replay rejected. Synthetic local fixture retained; no external messages.');
} finally {
  globalThis.fetch = originalFetch;
  if (safety) await safety.getSafetyRedis().quit();
  if (server.exitCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); await stopped; }
  await rm(directory, { recursive: true, force: true });
}

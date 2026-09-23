// Runs once in an isolated ECS task using the deployed API definition/config.
// Only sends to Jorge. Never starts the general notification runner.
const assert = require('node:assert/strict');
const {createHmac} = require('node:crypto');
const jobId = '53641811-64f3-4bcb-b17f-7dcaf911fdd9';
const deliveryId = '5d1c9e9c-cbed-40e8-91fd-bbf7698157ed';
const recipient = 'lopezb.jl@gmail.com';
const marker = 'production-email-acceptance-20260923';
const endpoint = 'https://api.illuminotary.com/webhooks/resend';
const log = value => console.log(JSON.stringify(value));
async function rest(path, method = 'GET', body) {
  const response = await fetch(process.env.SUPABASE_URL + '/rest/v1/' + path, {
    method, headers: {apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json', Prefer: 'return=representation'},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  });
  assert(response.ok, `Fixture database request failed: ${response.status}`);
  return response.json();
}
async function main() {
  assert.equal(process.env.SUPABASE_URL, 'https://jdrgluisxhgegdsesman.supabase.co');
  assert.equal(process.env.NOTIFICATION_OUTBOX_RUNNER_ENABLED, 'false');
  assert.equal(process.env.STRIPE_LIVE_MODE_ENABLED, 'false');
  assert.equal(process.env.NOTIFICATION_REPLY_TO, recipient);
  assert.equal(process.env.RESEND_FROM_ADDRESS, 'DARCi <notifications@notify.illuminotary.com>');
  // These requests originate outside the operator allowlist. Forwarded-IP spoofing must not help.
  for (const url of ['https://app.illuminotary.com/', 'https://api.illuminotary.com/health/ready',
    'https://api.illuminotary.com/auth/otp/start', endpoint, endpoint + '/extra']) {
    const r = await fetch(url, {headers: {'X-Forwarded-For': '187.247.134.158'}, signal: AbortSignal.timeout(15000)});
    assert.equal(r.status, 403, `Public GET unexpectedly passed: ${url}`);
    log({edgeDenied: new URL(url).host + new URL(url).pathname, status: r.status});
  }
  const unsigned = await fetch(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
  assert.equal(unsigned.status, 400);
  const signedPost = async (body, id, timestamp, valid = true) => {
    const raw = JSON.stringify(body);
    const key = Buffer.from(process.env.RESEND_WEBHOOK_SECRET.slice(6), 'base64');
    const sig = createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64');
    return fetch(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json',
      'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': 'v1,' + (valid ? sig : 'invalid')}, body: raw});
  };
  for (const [kind, time, valid] of [['invalid', Math.floor(Date.now()/1000), false], ['expired', Math.floor(Date.now()/1000)-900, true]]) {
    const r = await signedPost({type: 'email.delivered'}, marker + kind, time, valid);
    assert.equal(r.status, 400); log({signatureRejected: kind, status: r.status});
  }
  if (!(await rest(`notification_jobs?id=eq.${jobId}&select=id`)).length) {
    await rest('notification_jobs', 'POST', {id: jobId, job_kind: 'transactional', channel: 'email', status: 'sent',
      dedupe_key: marker, attempt_count: 1, metadata: {synthetic: true, purpose: marker}});
    await rest('notification_deliveries', 'POST', {id: deliveryId, notification_job_id: jobId, channel: 'email',
      recipient_address: recipient, recipient_display_name: 'Jorge — production acceptance TEST', provider: 'resend',
      status: 'queued', metadata: {synthetic: true, purpose: marker}});
  }
  const delivery = (await rest(`notification_deliveries?id=eq.${deliveryId}&select=*`))[0];
  assert.equal(delivery.recipient_address, recipient);
  assert.equal(delivery.metadata.purpose, marker);
  let messageId = delivery.provider_message_id;
  if (!messageId) {
    const r = await fetch('https://api.resend.com/emails', {method: 'POST',
      headers: {Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': marker},
      body: JSON.stringify({from: process.env.RESEND_FROM_ADDRESS, to: [recipient], reply_to: recipient,
        subject: '[DARCi TEST] Production email delivery verification',
        text: 'Jorge, this is the approved production email delivery test from notify.illuminotary.com. No client messages, legal documents or payments were involved. Please confirm receipt in our chat. Replies go to your approved support inbox.',
        tags: [{name: 'delivery_id', value: deliveryId}, {name: 'purpose', value: marker}]}), signal: AbortSignal.timeout(20000)});
    const data = await r.json();
    assert(r.ok && data.id, `Resend send failed: ${r.status} ${data.name || ''}`);
    messageId = data.id;
    await rest(`notification_deliveries?id=eq.${deliveryId}`, 'PATCH', {provider_message_id: messageId});
  }
  log({testMessageAccepted: true, messageId, jobId, deliveryId});
  let events;
  for (let i = 0; i < 40; i++) {
    events = await rest(`outbound_message_events?notification_delivery_id=eq.${deliveryId}&select=provider_event_id,event_type,event_at,metadata`);
    if (events.some(e => e.event_type === 'delivered')) break;
    if (events.some(e => ['failed', 'bounced', 'complained', 'suppressed'].includes(e.event_type))) throw Error('Provider reported delivery failure');
    await new Promise(r => setTimeout(r, 5000));
  }
  const delivered = events.find(e => e.event_type === 'delivered');
  assert(delivered, 'Delivery callback not yet recorded; inspect provider before retrying sends');
  assert.equal(delivered.metadata.source, 'resend_webhook');
  log({providerCallbacks: events.map(e => ({type: e.event_type, id: e.provider_event_id})), delivered: true});
  // Re-sign the same logical delivery event ID to test database replay idempotency.
  // This is explicitly a synthetic replay, not a second provider-origin delivery.
  const replay = await signedPost({type: 'email.delivered', created_at: delivered.event_at,
    data: {email_id: messageId, tags: {delivery_id: deliveryId}}}, delivered.provider_event_id, Math.floor(Date.now()/1000));
  assert.equal(replay.status, 200);
  const duplicates = await rest(`outbound_message_events?provider_event_id=eq.${delivered.provider_event_id}&select=id`);
  assert.equal(duplicates.length, 1);
  const final = (await rest(`notification_deliveries?id=eq.${deliveryId}&select=status`))[0];
  assert.equal(final.status, 'delivered');
  log({passed: true, duplicateEventCount: duplicates.length, deliveryStatus: final.status, clientMessagesSent: 0});
}
main().catch(error => { log({passed: false, error: error.message}); process.exitCode = 1; });

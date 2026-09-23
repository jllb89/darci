const statuses = new Set(['SUCCESSFUL','DELIVERED','PENDING','INVALID','UNREACHABLE','UNKNOWN','BLOCKED','CARRIER_UNREACHABLE','SPAM','INVALID_MESSAGE','CARRIER_BLOCKED','TTL_EXPIRED','ACCEPTED','FAILED','SENT','UNROUTABLE','QUEUED','PROTECT_BLOCKED']);
function sanitize(event) {
  if (!event || !statuses.has(event.messageStatus) || !/^TEXT_[A-Z_]+$/.test(event.eventType ?? '')
      || !/^[a-zA-Z0-9_-]{8,128}$/.test(event.messageId ?? '')) throw new Error('Invalid SMS delivery event');
  const environment=process.env.APP_ENV ?? 'staging';
  if (!['staging','production'].includes(environment)) throw new Error('Invalid receipt environment');
  const safe = {kind:'auth_sms_delivery', environment, messageId:event.messageId,
    eventType:event.eventType, status:event.messageStatus, isFinal:event.isFinal === true,
    // SUCCESSFUL means carrier acceptance, not device delivery.
    deviceDelivered:event.messageStatus === 'DELIVERED',
  };
  for (const key of ['eventTimestamp','messageRequestTimestamp']) {
    if (Number.isSafeInteger(event[key]) && event[key] > 0) safe[key] = event[key];
  }
  for (const [key, length] of [['hookHash',32],['phoneHash',16]]) {
    if (new RegExp(`^[a-f0-9]{${length}}$`).test(event.context?.[key] ?? '')) safe[key] = event.context[key];
  }
  return safe;
}
exports.sanitize = sanitize;
exports.handler = async event => {
  if (!Array.isArray(event?.Records) || !event.Records.length) throw new Error('Expected SNS records');
  for (const record of event.Records) {
    if (record.EventSource !== 'aws:sns' || record.Sns?.TopicArn !== process.env.EXPECTED_TOPIC_ARN) throw new Error('Unexpected event source');
    let value;
    try { value = JSON.parse(record.Sns.Message); } catch { throw new Error('Invalid SMS event JSON'); }
    console.log(JSON.stringify(sanitize(value)));
  }
};

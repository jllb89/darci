// Exactly one approved notification, exclusively to a freshly registered
// production device belonging to the operator. Never revive inactive tokens.
import assert from 'node:assert/strict';
import {existsSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pushPreflight} from './push-preflight.mjs';
const receipt='.recovery-private/production-operator-push-20260929.json';
assert(process.argv.includes('--approved-one-operator-push'));
assert(!existsSync(receipt),'Receipt already exists; inspect it instead of sending again');
process.umask(0o077);
const {secret,devices}=await pushPreflight();
assert.equal(devices.length,1,'Exactly one active authorized production operator device is required');
const device=devices[0];
assert(Date.now()-Date.parse(device.last_registered_at)<24*60*60*1000,'Device must be freshly registered');
assert(/^[a-f0-9]{64,}$/i.test(device.device_token??''));
for(const key of ['APNS_KEY_ID','APNS_TEAM_ID','APNS_PRIVATE_KEY'])process.env[key]=secret[key];
const require=createRequire(import.meta.url);
const {sendApnsNotification}=require('../../backend/dist/services/apnsClient.js');
const report={at:new Date().toISOString(),status:'attempting',messagesAttempted:1,receiptConfirmed:false,
  scope:'One operator production device only; direct APNs transport test, not a workflow-delivery assertion',
  deviceFingerprint:createHash('sha256').update(device.device_token).digest('hex').slice(0,16)};
writeFileSync(receipt,JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
try {
  const result=await sendApnsNotification({deviceToken:device.device_token,environment:'production',topic:'com.illuminote.darci',
    payload:{aps:{alert:{title:'[DARCi TEST] Production push',body:'Your production notification test. No documents or payments were changed.'},sound:'default'}},
    collapseId:'darci-operator-test-20260929',expiration:Math.floor(Date.now()/1000)+300,pushType:'alert',priority:10});
  Object.assign(report,{status:'accepted_by_apns',httpStatus:result.statusCode,apnsId:result.apnsId});
} catch(error) {
  Object.assign(report,{status:'failed_or_uncertain',httpStatus:error.statusCode??null,
    reason:typeof error.reason==='string'&&/^[A-Za-z0-9_]+$/.test(error.reason)?error.reason:null});
  process.exitCode=1;
}
writeFileSync(receipt,JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify({...report,evidence:receipt}));

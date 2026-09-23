// One explicitly approved operator push. No token/account copying or automatic retry.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),dotenv=require('../../backend/node_modules/dotenv');
const {createClient}=require('../../backend/node_modules/@supabase/supabase-js');
const {sendApnsNotification}=require('../../backend/dist/services/apnsClient.js');
const receipt='.recovery-private/production-apns-20260923-QW4JZ2X6DU.json';
process.umask(0o077);
const report={at:new Date().toISOString(),status:'preflight',messagesAttempted:0,receiptConfirmed:false,
  scope:'One approved operator TestFlight token read transiently from staging. New production Apple key. No production app registration or worker-delivery claim.'};
const save=()=>writeFileSync(receipt,JSON.stringify(report,null,2),{mode:0o600});
try{
  assert(process.argv.includes('--approved-one-operator-push'));
  assert(!existsSync(receipt),'A receipt already exists: inspect it; do not resend');
  const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
  const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];
  assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
  const version=stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue;
  const prod=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',version).SecretString);
  assert.equal(prod.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
  assert.equal(prod.APNS_KEY_ID,'QW4JZ2X6DU');assert.equal(prod.APNS_TEAM_ID,'38K3YA2857');
  const stage=dotenv.parse(readFileSync('.env.staging'));assert.equal(stage.SUPABASE_URL,'https://oqferisuloumoojgbjde.supabase.co');
  const db=createClient(stage.SUPABASE_URL,stage.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const users=await db.from('users').select('id').eq('email','lopezb.jl@gmail.com');assert(!users.error&&users.data.length);
  const devices=await db.from('device_push_tokens').select('device_token,last_registered_at')
    .in('user_id',users.data.map(u=>u.id)).eq('is_active',true).eq('environment','production')
    .eq('app_bundle_id','com.illuminote.darci').eq('provider','apns').eq('permission_status','authorized');
  assert(!devices.error&&devices.data.length===1,'Exactly one authorized production operator installation required');
  const device=devices.data[0];assert(/^[a-f0-9]{64,}$/i.test(device.device_token??''));
  assert(Date.now()-Date.parse(device.last_registered_at)<24*60*60*1000,'Operator token must have registered in the last 24 hours');
  for(const k of ['APNS_KEY_ID','APNS_TEAM_ID','APNS_PRIVATE_KEY'])process.env[k]=prod[k];
  Object.assign(report,{status:'attempting',messagesAttempted:1,secretVersion:version,keyId:prod.APNS_KEY_ID,
    deviceFingerprint:createHash('sha256').update(device.device_token).digest('hex').slice(0,16)});
  // Exclusive receipt creation prevents a duplicate local invocation from sending again.
  writeFileSync(receipt,JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
  const result=await sendApnsNotification({deviceToken:device.device_token,environment:'production',topic:'com.illuminote.darci',
    payload:{aps:{alert:{title:'[DARCi TEST] Production push',body:'Apple push verification only. No documents or payments were changed.'},sound:'default'}},
    collapseId:'darci-operator-apns-20260923',expiration:Math.floor(Date.now()/1000)+300,pushType:'alert',priority:10});
  Object.assign(report,{status:'accepted_by_apns',httpStatus:result.statusCode,apnsId:result.apnsId,completedAt:new Date().toISOString()});
  save();console.log(JSON.stringify({...report,evidence:receipt}));
}catch(error){
  if(report.status==='attempting'){
    Object.assign(report,{status:'failed_or_uncertain',httpStatus:error.statusCode??null,
      reason:typeof error.reason==='string'&&/^[A-Za-z0-9_]+$/.test(error.reason)?error.reason:null});save();
  }
  console.error(JSON.stringify({passed:false,status:report.status,messagesAttempted:report.messagesAttempted,
    reason:'Stopped without retry; inspect the receipt before any new send',evidence:existsSync(receipt)?receipt:null}));process.exitCode=1;
}

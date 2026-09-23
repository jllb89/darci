// Public signed callback acceptance with pre-seeded synthetic receipts: ZERO SMS sends.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFileSync,mkdtempSync} from 'node:fs';
const require=createRequire(import.meta.url),{createClient}=require('../../backend/node_modules/@supabase/supabase-js'),{Webhook}=require('../../backend/node_modules/standardwebhooks');
assert(process.argv.includes('--approved-isolated-production-acceptance'));
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const ok=r=>{assert(!r.error,'Synthetic receipt query failed');return r.data;};
try {
  assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
  const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
  const raw=aws('cloudformation','get-template','--stack-name',stack.StackName).TemplateBody,template=typeof raw==='string'?JSON.parse(raw):raw;
  const image=stack.Parameters.find(p=>p.ParameterKey==='apiImage').ParameterValue;
  const tags=aws('ecr','describe-images','--repository-name','darci-production-api','--image-ids','imageDigest='+image.split('@')[1]).imageDetails[0].imageTags;
  assert(tags.some(t=>t.startsWith('phase2-c454d61-')),'This drill targets the reviewed first Phase 3 release; verify a newer revision explicitly before adapting');
  assert.equal(template.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode,'403');
  const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue).SecretString);
  assert.equal(secret.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
  const db=createClient(secret.SUPABASE_URL,secret.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const key=secret.SUPABASE_AUTH_SMS_HOOK_SECRET.replace(/^v\d+,/,'');
  const body=JSON.stringify({user:{phone:'+525542850675'},sms:{otp:'00000000'}});
  const records=[];
  for(const status of ['accepted','processing','uncertain']) {
    const id='synthetic-no-send-'+randomUUID(),hash=createHash('sha256').update(id).digest('hex');
    ok(await db.from('auth_sms_hook_receipts').insert({hook_hash:hash,payload_hmac:createHmac('sha256',key).update(body).digest('hex'),status,
      ...(status==='accepted'?{provider_message_id:'SYNTHETIC-NO-SEND',completed_at:new Date().toISOString()}:{})}));
    const before=ok(await db.from('auth_sms_hook_receipts').select('*').eq('hook_hash',hash).single());
    const statuses=[];
    for(let i=0;i<2;i++) {
      const timestamp=new Date(),signature=new Webhook(key).sign(id,timestamp,body);
      const r=await fetch('https://api.illuminotary.com/webhooks/supabase/auth/send-sms',{method:'POST',headers:{'Content-Type':'application/json',
        'webhook-id':id,'webhook-timestamp':String(Math.floor(timestamp.getTime()/1000)),'webhook-signature':signature},body,signal:AbortSignal.timeout(15000)});
      assert.equal(r.status,status==='accepted'?200:503);statuses.push(r.status);
    }
    const after=ok(await db.from('auth_sms_hook_receipts').select('*').eq('hook_hash',hash).single());assert.deepEqual(after,before);
    records.push({hookHash:hash,status,responseStatuses:statuses,receiptUnchanged:true});
  }
  const dir=mkdtempSync('.recovery-private/production-sms-replay-');
  const report={at:new Date().toISOString(),passed:true,image,records,smsSent:0,scope:'Preseeded receipts: valid replay acknowledged, in-flight/uncertain handoff denied without provider dispatch. Not a new carrier-delivery test.'};
  writeFileSync(dir+'/report.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({...report,evidence:dir}));
}catch(e){console.error(JSON.stringify({passed:false,errorClass:e.name,reason:'Inspect deployed revision/fixture receipts; never send an unseeded synthetic hook'}));process.exitCode=1;}

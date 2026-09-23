// Reviewed private-production configuration only. No billing activation or client messages.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdtempSync, chmodSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {withProductionProviders, productionWebhookUrl, productionStripeEvents, verifyPreparedStripeEndpoint} from './provider-setup.mjs';
const require = createRequire(import.meta.url);
process.umask(0o077);
const aws = (...args) => JSON.parse(execFileSync('aws', [...args, '--region','us-east-1','--output','json'], {encoding:'utf8',stdio:['ignore','pipe','pipe']}) || '{}');
let stage='preflight';
try {
  assert(process.argv.includes('--approved-private-provider-setup'));
  assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
  execFileSync('git',['check-ignore','.env.production'],{stdio:'pipe'});
  assert.equal(execFileSync('git',['ls-files','.env.production'],{encoding:'utf8'}).trim(),'');
  const dotenv=require('../../backend/node_modules/dotenv');
  let envText=readFileSync('.env.production','utf8'), local=dotenv.parse(envText);
  const saveValue=(name,value)=>{
    assert(!local[name]?.trim() || local[name]===value,`Refusing to replace ${name}`);
    const pattern=new RegExp(`^${name}=.*$`,'m'),line=`${name}=${JSON.stringify(value)}`;
    envText=pattern.test(envText)?envText.replace(pattern,()=>line):envText+'\n'+line+'\n';
    writeFileSync('.env.production',envText,{mode:0o600});chmodSync('.env.production',0o600);local=dotenv.parse(envText);
  };
  assert(local.STRIPE_SECRET_KEY?.startsWith('sk_live_'));assert(local.STRIPE_PUBLISHABLE_KEY?.startsWith('pk_live_'));
  const before=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];
  assert.equal(before.StackStatus,'UPDATE_COMPLETE');
  const oldVersion=before.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue;
  const values=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',oldVersion).SecretString);
  assert.equal(values.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');assert.equal(values.STRIPE_LIVE_MODE_ENABLED,'false');
  const raw=aws('cloudformation','get-template','--stack-name','darci-production-runtime').TemplateBody;
  const baseline=typeof raw==='string'?JSON.parse(raw):raw;
  const senders=aws('pinpoint-sms-voice-v2','describe-phone-numbers').PhoneNumbers;
  const sender=senders.find(p=>p.PhoneNumber==='+18773624121');assert.equal(sender?.Status,'ACTIVE');
  const apns=['APNS_KEY_ID','APNS_TEAM_ID','APNS_PRIVATE_KEY'].every(k=>local[k]?.trim());
  const template=withProductionProviders(baseline,{stripe:true,sms:true,smsSenderArn:sender.PhoneNumberArn,apns});
  const dir=mkdtempSync('.recovery-private/production-provider-deploy-');
  const save=(name,value)=>writeFileSync(`${dir}/${name}`,JSON.stringify(value,null,2),{mode:0o600});
  save('baseline.json',{stack:before,template:baseline});save('template.json',template);
  stage='prepare disabled Stripe endpoint';
  const Stripe=require('../../backend/node_modules/stripe');
  const stripe=new Stripe(local.STRIPE_SECRET_KEY,{apiVersion:'2026-07-29.dahlia',maxNetworkRetries:1,timeout:20000});
  assert.equal((await stripe.accounts.retrieve()).id,'acct_1HxKd9ETAqmB3GAq');
  const endpoints=await stripe.webhookEndpoints.list({limit:100});assert(!endpoints.has_more);
  const matches=endpoints.data.filter(e=>e.url===productionWebhookUrl);assert(matches.length<=1);
  let endpoint=matches[0];
  if(endpoint) {
    assert.equal(endpoint.status,'disabled','An already active endpoint needs a separately reviewed change');
    assert(local.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'),'Existing endpoint secret missing; recover it through Stripe before proceeding');
  } else {
    assert(!local.STRIPE_WEBHOOK_SECRET,'Unexpected local endpoint secret; inspect before creating another endpoint');
    // Stripe creates enabled endpoints. Save its one-time secret, then disable before ingress is deployed.
    endpoint=await stripe.webhookEndpoints.create({url:productionWebhookUrl,enabled_events:productionStripeEvents,
      api_version:'2026-07-29.dahlia',description:'DARCi production — preactivation',metadata:{darci_environment:'production',darci_stage:'preactivation'}},
      {idempotencyKey:'darci:production:webhook:preactivation:20260923'});
    try {assert(endpoint.secret?.startsWith('whsec_'));saveValue('STRIPE_WEBHOOK_SECRET',endpoint.secret);}
    finally {endpoint=await stripe.webhookEndpoints.update(endpoint.id,{disabled:true});}
  }
  verifyPreparedStripeEndpoint(endpoint);
  save('stripe-endpoint.json',{id:endpoint.id,url:endpoint.url,status:endpoint.status,livemode:endpoint.livemode,apiVersion:endpoint.api_version});
  if(!local.SUPABASE_AUTH_SMS_HOOK_SECRET) saveValue('SUPABASE_AUTH_SMS_HOOK_SECRET','v1,whsec_'+randomBytes(32).toString('base64'));
  const names=['STRIPE_SECRET_KEY','STRIPE_PUBLISHABLE_KEY','STRIPE_WEBHOOK_SECRET','SUPABASE_AUTH_SMS_HOOK_SECRET',...(apns?['APNS_KEY_ID','APNS_TEAM_ID','APNS_PRIVATE_KEY']:[])];
  const merged={...values};
  for(const name of names){assert(!values[name] || values[name]===local[name],`Existing production ${name} differs`);merged[name]=local[name];}
  stage='pin production provider secret';
  const created=JSON.parse(execFileSync('aws',['secretsmanager','put-secret-value','--secret-id','/darci/production/app','--secret-string','file:///dev/stdin','--region','us-east-1','--output','json'],
    {input:JSON.stringify(merged),encoding:'utf8',stdio:['pipe','pipe','pipe']}));
  const persisted=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',created.VersionId).SecretString);
  assert(Object.keys(persisted).length===Object.keys(merged).length&&Object.entries(merged).every(([k,v])=>persisted[k]===v),'Pinned secret readback mismatch');
  const report={at:new Date().toISOString(),evidence:dir,previousSecretVersion:oldVersion,secretVersion:created.VersionId,
    stripeEndpoint:endpoint.id,stripeEndpointEnabled:false,apnsConfigured:apns,smsSenderArn:sender.PhoneNumberArn,
    generalSalesEnabled:false,clientMessagesSent:0,templatePrepared:true,deployed:false};
  save('prepared.json',report);console.log(JSON.stringify(report));
} catch(error) {
  console.error(JSON.stringify({passed:false,stage,type:error.name,code:error.code??null,message:'Preparation stopped; no credential/provider payload emitted. Inspect before retrying.'}));process.exitCode=1;
}

// Requires the protected production release to finish first. No payment is made here.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {createRequire} from 'node:module';
import {withOperatorBilling,operatorUserId,operatorPriceCode} from './operator-billing-setup.mjs';
import {productionStripeEvents,productionWebhookUrl} from './provider-setup.mjs';
const require=createRequire(import.meta.url),{Client}=require('../../backend/node_modules/pg');
process.umask(0o077);
assert(process.argv.includes('--approved-operator-live-test'));
const runId=process.argv.find(a=>a.startsWith('--release-run='))?.split('=')[1];assert(/^\d+$/.test(runId??''));
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})||'{}');
let db,dir,phase='release verification';
try {
  assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
  const release=JSON.parse(execFileSync('gh',['api',`repos/jllb89/darci/actions/runs/${runId}`],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  assert.equal(release.path,'.github/workflows/deploy-production.yml');assert.equal(release.head_branch,'master');assert.equal(release.conclusion,'success');
  execFileSync('git',['merge-base','--is-ancestor','c454d61',release.head_sha],{stdio:'pipe'});
  const releasedReconciliation=execFileSync('git',['show',`${release.head_sha}:backend/src/services/billingOperationsService.ts`],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert(releasedReconciliation.includes('provider.livemode !== (getStripeEnvironment() === "live")'),'Release must contain production reconciliation correction');
  const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
  const raw=aws('cloudformation','get-template','--stack-name',stack.StackName).TemplateBody,baseline=typeof raw==='string'?JSON.parse(raw):raw;
  const startsAt=new Date().toISOString(),expiresAt=new Date(Date.now()+23*3600000).toISOString();
  const template=withOperatorBilling(baseline,{startsAt,expiresAt});
  const tag=`phase2-${release.head_sha.slice(0,7)}-${runId}-${release.run_attempt}`;
  for(const service of ['api','worker','web']) {
    const image=stack.Parameters.find(p=>p.ParameterKey===service+'Image').ParameterValue;
    const record=aws('ecr','describe-images','--repository-name','darci-production-'+service,'--image-ids','imageDigest='+image.split('@')[1]).imageDetails[0];
    assert(record.imageTags.includes(tag),'Running image does not match the approved release');
    const svc=aws('ecs','describe-services','--cluster','darci-production','--services','darci-production-'+service).services[0];
    assert.equal(svc.deployments.length,1);assert.equal(svc.deployments[0].rolloutState,'COMPLETED');assert.equal(svc.runningCount,svc.desiredCount);
  }
  const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue).SecretString);
  assert.equal(secret.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');assert.equal(secret.STRIPE_LIVE_MODE_ENABLED,'false');
  const Stripe=require('../../backend/node_modules/stripe'),stripe=new Stripe(secret.STRIPE_SECRET_KEY,{apiVersion:'2026-07-29.dahlia',maxNetworkRetries:1,timeout:20000});
  const account=await stripe.accounts.retrieve();assert.equal(account.id,'acct_1HxKd9ETAqmB3GAq');assert(account.charges_enabled&&account.payouts_enabled);
  const endpoint=await stripe.webhookEndpoints.retrieve('we_1UIw8CETAqmB3GAqJE15Ottu');
  assert.equal(endpoint.url,productionWebhookUrl);assert.equal(endpoint.status,'disabled');assert.equal(endpoint.livemode,true);
  assert.deepEqual([...endpoint.enabled_events].sort(),[...productionStripeEvents].sort());
  const recovery=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/recovery-source').SecretString);
  const url=new URL(recovery.DATABASE_URL);url.hostname='aws-0-us-east-1.pooler.supabase.com';url.username='postgres.jdrgluisxhgegdsesman';url.port='5432';url.search='';
  db=new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('infra/recovery/supabase-ca.crt','utf8')},connectionTimeoutMillis:15000});await db.connect();
  assert.deepEqual((await db.query('select stripe_environment,live_activation_approved from public.billing_runtime_configuration')).rows,[{stripe_environment:'live',live_activation_approved:false}]);
  assert.equal(Number((await db.query('select count(*) from public.billing_subscriptions')).rows[0].count),0);
  const user=(await db.query('select u.id,u.status,a.raw_user_meta_data metadata from public.users u join auth.users a on a.id=u.supabase_user_id where u.id=$1',[operatorUserId])).rows[0];
  assert.equal(user.status,'active');assert.equal(user.metadata.production_operator_acceptance,true);assert.equal(user.metadata.synthetic,true);
  const catalog=(await db.query('select * from public.billing_catalog_prices')).rows;
  assert(catalog.every(p=>!p.is_active),'Existing sale availability changed');
  const price=catalog.find(p=>p.price_code===operatorPriceCode);assert.equal(price.unit_amount_cents,999);assert.equal(price.billing_interval,'month');assert.equal(price.usage_limit_quantity,3);
  const mapping=(await db.query("select * from public.billing_provider_price_mappings where catalog_price_id=$1 and provider_environment='live' and status='verified'",[price.id])).rows[0];assert(mapping);
  const providerPrice=await stripe.prices.retrieve(mapping.provider_price_id);assert(providerPrice.livemode&&providerPrice.active);assert.equal(providerPrice.unit_amount,999);assert.equal(providerPrice.currency,'usd');assert.equal(providerPrice.recurring.interval,'month');
  const portal=(await db.query("select provider_configuration_id from public.billing_provider_configurations where provider_environment='live' and configuration_kind='customer_portal' and status='verified'")).rows[0];assert(portal);
  const portalConfig=await stripe.billingPortal.configurations.retrieve(portal.provider_configuration_id);assert.equal(portalConfig.features.subscription_update.enabled,false);assert.equal(portalConfig.features.subscription_cancel.mode,'at_period_end');
  dir=mkdtempSync('.recovery-private/production-operator-billing-');
  const save=(name,value)=>writeFileSync(dir+'/'+name,JSON.stringify(value,null,2),{mode:0o600});
  save('baseline.json',{stack,template:baseline,catalog,endpoint:{id:endpoint.id,status:endpoint.status}});save('template.json',template);
  save('approval-scope.json',{operatorUserId,operatorPriceCode,startsAt,expiresAt,release:release.head_sha,runId,generalSales:false,chargeAuthority:'Cardholder only',periodEndCancellationApproved:true});
  phase='deploy operator gate';
  aws('cloudformation','update-stack','--stack-name',stack.StackName,'--template-body','file://'+process.cwd()+'/'+dir+'/template.json',
    '--parameters',JSON.stringify(stack.Parameters.map(p=>({ParameterKey:p.ParameterKey,UsePreviousValue:true}))),'--capabilities','CAPABILITY_NAMED_IAM');
  let completed=false;
  for(let i=0;i<100;i++){
    await new Promise(r=>setTimeout(r,15000));
    const after=aws('cloudformation','describe-stacks','--stack-name',stack.StackName).Stacks[0];
    console.log(JSON.stringify({phase,status:after.StackStatus}));
    if(after.StackStatus.endsWith('_IN_PROGRESS'))continue;
    assert.equal(after.StackStatus,'UPDATE_COMPLETE');assert.deepEqual(after.Parameters,stack.Parameters);completed=true;break;
  }
  assert(completed,'Inspect in-progress deployment; do not activate catalog');
  phase='activate single price and signed callback';
  await db.query('begin');
  const state=(await db.query('select stripe_environment,live_activation_approved from public.billing_runtime_configuration for update')).rows;
  assert.deepEqual(state,[{stripe_environment:'live',live_activation_approved:false}]);
  await db.query('update public.billing_runtime_configuration set live_activation_approved=true');
  await db.query('update public.billing_catalog_prices set is_active=true,available_for_purchase=true where id=$1',[price.id]);
  await db.query('commit');
  const enabled=await stripe.webhookEndpoints.update(endpoint.id,{disabled:false});assert.equal(enabled.status,'enabled');
  const report={at:new Date().toISOString(),passed:true,operatorUserId,operatorPriceCode,startsAt,expiresAt,endpoint:endpoint.id,
    productionPrivate:true,generalSales:false,notificationsRunner:false,checkoutCreated:false,paymentsCreated:0};
  save('activation.json',report);console.log(JSON.stringify({...report,evidence:dir}));
}catch(e){if(db)await db.query('rollback').catch(()=>{});console.error(JSON.stringify({passed:false,phase,evidence:dir??null,errorClass:e.name,reason:'Inspect exact activation state before retry; no charge was initiated'}));process.exitCode=1;}
finally{if(db)await db.end();}

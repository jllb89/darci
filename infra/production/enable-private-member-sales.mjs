// Approved Sep 25: paid client testing in private production, web and iOS.
// No Checkout sessions, customers, subscriptions, payment intents or charges created.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {MEMBER_PRICING_V2} from '../../backend/src/config/memberPricing.ts';
import {verifyPrice, accountId, apiVersion} from './stripe-catalog.mjs';
import {productionStripeEvents, productionWebhookUrl} from './provider-setup.mjs';
import {withPrivateMemberSales} from './private-member-sales.mjs';
const require = createRequire(import.meta.url);
const apply = process.argv.includes('--approved-private-live-sales');
const runId = process.argv.find(a => a.startsWith('--release-run='))?.split('=')[1];
assert(!apply || /^\d+$/.test(runId ?? ''), 'Approved release required');
process.umask(0o077);
const aws = (...a) => JSON.parse(execFileSync('aws', [...a, '--region','us-east-1','--output','json'], {encoding:'utf8',stdio:['ignore','pipe','pipe']}) || '{}');
let db, evidence, phase = 'preflight';
try {
  assert.equal(aws('sts','get-caller-identity').Account, '427057633951');
  const stack = aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];
  assert.equal(stack.StackStatus, 'UPDATE_COMPLETE', 'Wait for image deployment before activating');
  const raw = aws('cloudformation','get-template','--stack-name',stack.StackName).TemplateBody;
  const baseline = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const next = withPrivateMemberSales(baseline);
  if (apply) {
    const release = JSON.parse(execFileSync('gh',['api',`repos/jllb89/darci/actions/runs/${runId}`],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
    assert.equal(release.path, '.github/workflows/deploy-production.yml');
    assert.equal(release.head_branch, 'master'); assert.equal(release.conclusion, 'success');
    execFileSync('git',['merge-base','--is-ancestor','7f8e700',release.head_sha],{stdio:'pipe'});
    for (const name of ['api','worker','web']) {
      const image = stack.Parameters.find(p => p.ParameterKey === name + 'Image').ParameterValue;
      const detail = aws('ecr','describe-images','--repository-name','darci-production-'+name,'--image-ids','imageDigest='+image.split('@')[1]).imageDetails[0];
      assert(detail.imageTags.includes(`phase2-${release.head_sha.slice(0,7)}-${runId}-${release.run_attempt}`));
    }
  }
  const secret = JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',stack.Parameters.find(p => p.ParameterKey === 'SecretVersion').ParameterValue).SecretString);
  assert.equal(secret.SUPABASE_URL, 'https://jdrgluisxhgegdsesman.supabase.co');
  assert(secret.STRIPE_SECRET_KEY.startsWith('sk_live_')); assert(secret.STRIPE_WEBHOOK_SECRET.startsWith('whsec_'));
  const Stripe = require('../../backend/node_modules/stripe');
  const stripe = new Stripe(secret.STRIPE_SECRET_KEY, {apiVersion, maxNetworkRetries:1, timeout:20000});
  const account = await stripe.accounts.retrieve();
  assert.equal(account.id, accountId); assert(account.charges_enabled && account.payouts_enabled);
  assert(!(account.requirements?.past_due?.length)); assert(!account.requirements?.disabled_reason);
  const endpoints = await stripe.webhookEndpoints.list({limit:100}); assert(!endpoints.has_more);
  const matches = endpoints.data.filter(e => e.url === productionWebhookUrl && e.status === 'enabled');
  assert.equal(matches.length,1); const endpoint = matches[0];
  assert(endpoint.livemode); assert.equal(endpoint.api_version, apiVersion);
  for (const event of productionStripeEvents) assert(endpoint.enabled_events.includes(event));
  const recovery = JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/recovery-source').SecretString);
  assert.equal(recovery.SUPABASE_URL, secret.SUPABASE_URL);
  const url = new URL(recovery.DATABASE_URL); url.hostname='aws-0-us-east-1.pooler.supabase.com'; url.username='postgres.jdrgluisxhgegdsesman'; url.port='5432'; url.search='';
  const {Client} = require('../../backend/node_modules/pg');
  db = new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('infra/recovery/supabase-ca.crt','utf8')},connectionTimeoutMillis:15000});
  await db.connect();
  assert.deepEqual((await db.query('select stripe_environment,live_activation_approved from public.billing_runtime_configuration')).rows,[{stripe_environment:'live',live_activation_approved:true}]);
  const codes = MEMBER_PRICING_V2.map(p=>p.priceCode);
  const rows = (await db.query('select * from public.billing_catalog_prices where price_code=any($1)',[codes])).rows;
  assert.equal(rows.length,6);
  const verified = [];
  for (const plan of MEMBER_PRICING_V2) {
    const row = rows.find(p=>p.price_code === plan.priceCode);
    assert.equal(row.unit_amount_cents,plan.amount); assert.equal(row.currency_code,'USD');
    assert.equal(row.billing_interval,plan.interval); assert.equal(row.interval_count,1);
    assert.equal(row.usage_limit_quantity,plan.allowance); assert.equal(row.included_entitlement_quantity,plan.allowance); assert.equal(row.is_unlimited,plan.unlimited);
    const mappings = (await db.query("select * from public.billing_provider_price_mappings where catalog_price_id=$1 and provider_environment='live' and status='verified'",[row.id])).rows;
    assert.equal(mappings.length,1); const mapping = mappings[0];
    verifyPrice(await stripe.prices.retrieve(mapping.provider_price_id),plan,mapping.provider_product_id);
    verified.push({code:plan.priceCode,amount:plan.amount,interval:plan.interval,allowance:plan.allowance,active:row.is_active});
  }
  const portals = (await db.query("select provider_configuration_id from public.billing_provider_configurations where provider_environment='live' and configuration_kind='customer_portal' and status='verified'")).rows;
  assert.equal(portals.length,1);
  const portal = await stripe.billingPortal.configurations.retrieve(portals[0].provider_configuration_id);
  assert(portal.active && portal.livemode); assert.equal(portal.features.subscription_cancel.mode,'at_period_end');
  assert(portal.features.subscription_cancel.enabled && portal.features.payment_method_update.enabled && portal.features.invoice_history.enabled);
  assert.equal(portal.features.subscription_update.enabled,false);
  assert.equal(portal.default_return_url,'https://app.illuminotary.com/app/billing');
  const report = {at:new Date().toISOString(),passed:true,scope:apply?'private paid production sales':'read-only preflight',chargesCreated:0,
    prices:verified,webhookEnabled:true,portalVerified:true,accountRequirementsVisible:account.requirements!=null};
  if (!apply) { console.log(JSON.stringify(report)); }
  else {
    phase='catalog activation';
    evidence=mkdtempSync('.recovery-private/production-private-sales-');
    const save = (name,value) => writeFileSync(evidence+'/'+name,JSON.stringify(value,null,2),{mode:0o600});
    const catalogBefore = (await db.query('select * from public.billing_catalog_prices')).rows;
    save('baseline.json',{stack,template:baseline,catalog:catalogBefore}); save('template.json',next);
    save('approval.json',{at:report.at,source:'Jorge: clients are testing and will test in production; needs live and working',paid:true,web:true,iosHostedCheckout:true,publicAccess:false,signupChanged:false});
    await db.query('begin');
    await db.query("set local lock_timeout='5s'; set local statement_timeout='15s'");
    await db.query('select id from public.billing_catalog_prices where price_code=any($1) for update',[codes]);
    const changed = await db.query('update public.billing_catalog_prices set is_active=true,available_for_purchase=true where price_code=any($1) returning price_code',[codes]);
    assert.equal(changed.rowCount,6);
    await db.query("update public.billing_catalog_prices set available_for_purchase=false where price_code=any($1)",[['member_starter_monthly','member_plus_monthly','member_volume_monthly']]);
    await db.query('commit');
    save('catalog-activation.json',{at:new Date().toISOString(),activeCodes:changed.rows.map(p=>p.price_code),subscriptionsChanged:false});
    phase='runtime rollout';
    // Re-read before writing: never race an image deployment or overwrite its parameters.
    assert.deepEqual(aws('cloudformation','describe-stacks','--stack-name',stack.StackName).Stacks[0].Parameters,stack.Parameters);
    assert.equal(aws('cloudformation','describe-stacks','--stack-name',stack.StackName).Stacks[0].StackStatus,'UPDATE_COMPLETE');
    if (JSON.stringify(next)!==JSON.stringify(baseline)) aws('cloudformation','update-stack','--stack-name',stack.StackName,
      '--template-body','file://'+process.cwd()+'/'+evidence+'/template.json','--parameters',JSON.stringify(stack.Parameters.map(p=>({ParameterKey:p.ParameterKey,UsePreviousValue:true}))),'--capabilities','CAPABILITY_NAMED_IAM');
    let complete = false;
    for (let i=0;i<80;i++) {
      const current = aws('cloudformation','describe-stacks','--stack-name',stack.StackName).Stacks[0];
      if(current.StackStatus.endsWith('_IN_PROGRESS')) { if(i%4===0)console.log(JSON.stringify({phase,status:current.StackStatus,evidence})); await new Promise(r=>setTimeout(r,15000)); continue; }
      assert.equal(current.StackStatus,'UPDATE_COMPLETE'); assert.deepEqual(current.Parameters,stack.Parameters);
      const after=aws('cloudformation','get-template','--stack-name',stack.StackName).TemplateBody;
      assert.deepEqual(typeof after==='string'?JSON.parse(after):after,next);
      for(const name of ['api','worker']) {
        const s=aws('ecs','describe-services','--cluster','darci-production','--services','darci-production-'+name).services[0];
        assert.equal(s.deployments.length,1); assert.equal(s.deployments[0].rolloutState,'COMPLETED'); assert.equal(s.runningCount,s.desiredCount);
        const task=aws('ecs','describe-task-definition','--task-definition',s.taskDefinition).taskDefinition.containerDefinitions[0];
        const env=Object.fromEntries(task.environment.map(e=>[e.name,e.value]));
        assert.equal(env.BILLING_LIVE_ACCESS_MODE,'open'); assert.equal(env.IOS_MEMBER_CHECKOUT_ENABLED,'true'); assert.equal(env.BILLING_ENFORCEMENT_MODE,'enforced');
      }
      complete=true; break;
    }
    assert(complete,'Inspect deployment; do not retry blindly');
    save('result.json',{...report,completedAt:new Date().toISOString(),paidCheckoutEnabled:true,iosHostedCheckoutEnabled:true,privateAccessPreserved:true,prices:verified.map(p=>({...p,active:true}))});
    console.log(JSON.stringify({passed:true,evidence,paidCheckoutEnabled:true,iosHostedCheckoutEnabled:true,activePrices:6,chargesCreated:0}));
  }
} catch (error) {
  if(db) await db.query('rollback').catch(()=>{});
  console.error(JSON.stringify({passed:false,phase,evidence:error?evidence:null,errorClass:error.name,
    reason:error.name==='AssertionError'?error.message:'Provider/configuration operation failed; credentials and provider payloads omitted'}));
  process.exitCode=1;
} finally {if(db) await db.end();}

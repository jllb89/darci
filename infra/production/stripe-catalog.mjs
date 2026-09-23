import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {MEMBER_PRICING_V2} from '../../backend/src/config/memberPricing.ts';
const require = createRequire(import.meta.url);
export const accountId = 'acct_1HxKd9ETAqmB3GAq';
export const apiVersion = '2026-07-29.dahlia';

export function verifyPrice(price, plan, productId) {
  assert.equal(price.livemode, true); assert.equal(price.active, true);
  assert.equal(price.product, productId); assert.equal(price.lookup_key, plan.priceCode);
  assert.equal(price.unit_amount, plan.amount); assert.equal(price.currency, 'usd');
  assert.equal(price.type, 'recurring'); assert.equal(price.tax_behavior, 'exclusive');
  assert.equal(price.recurring?.interval, plan.interval); assert.equal(price.recurring.interval_count, 1);
  assert.equal(price.recurring.usage_type, 'licensed');
  assert.equal(price.metadata.darci_allowance_period, 'month');
  assert.equal(price.metadata.darci_workflow_allowance, plan.unlimited ? 'unlimited' : String(plan.allowance));
}

// Deliberately no customer, subscription, Checkout, payment, webhook, or activation API.
// Existing unrelated merchant products/configurations are never changed.
export async function prepareCatalog(stripe) {
  const account = await stripe.accounts.retrieve(); assert.equal(account.id, accountId);
  const products = await stripe.products.list({limit: 100});
  assert(!products.has_more, 'Review pagination before creating a product');
  const matches = products.data.filter(p => p.metadata.darci_product_code === 'member_membership' && p.metadata.darci_environment === 'live');
  assert(matches.length <= 1, 'Ambiguous live membership products');
  const product = matches[0] ?? await stripe.products.create({active: true, name: 'DARCi Member Membership',
    description: 'Monthly document allowances. Notary fees separate; prices before applicable taxes.',
    metadata: {darci_product_code: 'member_membership', darci_environment: 'live', darci_scope: 'member_only'}},
    {idempotencyKey: 'darci:live:catalog:member_membership:product:v2'});
  assert(product.livemode && product.active);
  const prices = [];
  for (const plan of MEMBER_PRICING_V2) {
    const found = await stripe.prices.list({lookup_keys: [plan.priceCode], limit: 100});
    assert(!found.has_more && found.data.length <= 1, 'Ambiguous price lookup');
    const price = found.data[0] ?? await stripe.prices.create({active: true, product: product.id,
      lookup_key: plan.priceCode, nickname: `${plan.name} ${plan.interval === 'year' ? 'Annual' : 'Monthly'}`,
      currency: 'usd', unit_amount: plan.amount, recurring: {interval: plan.interval, interval_count: 1, usage_type: 'licensed'},
      tax_behavior: 'exclusive', metadata: {darci_price_code: plan.priceCode, darci_product_code: 'member_membership',
        darci_environment: 'live', darci_workflow_allowance: plan.unlimited ? 'unlimited' : String(plan.allowance), darci_allowance_period: 'month'}},
      {idempotencyKey: `darci:live:catalog:${plan.priceCode}:v1`});
    verifyPrice(price, plan, product.id); prices.push({plan, price});
  }
  const configs = await stripe.billingPortal.configurations.list({limit: 100}); assert(!configs.has_more);
  const portals = configs.data.filter(p => p.metadata?.darci_configuration_kind === 'member_membership_portal' && p.metadata?.darci_environment === 'live');
  assert(portals.length <= 1);
  const portal = portals[0] ?? await stripe.billingPortal.configurations.create({name: 'DARCi Member Membership (Production)',
    default_return_url: 'https://app.illuminotary.com/app/billing',
    metadata: {darci_configuration_kind: 'member_membership_portal', darci_environment: 'live'},
    features: {customer_update: {enabled: true, allowed_updates: ['email', 'address']}, invoice_history: {enabled: true},
      payment_method_update: {enabled: true}, subscription_cancel: {enabled: true, mode: 'at_period_end'}, subscription_update: {enabled: false}}},
    {idempotencyKey: 'darci:live:portal:member_membership:v2'});
  assert(portal.livemode && portal.active); assert.equal(portal.default_return_url, 'https://app.illuminotary.com/app/billing');
  assert.equal(portal.features.subscription_update.enabled, false); assert.equal(portal.features.subscription_cancel.mode, 'at_period_end');
  return {account, product, prices, portal};
}

async function main() {
  assert(process.argv.includes('--prepare-approved-live-catalog'), 'Explicit catalog-only preparation required');
  const env = require('../../backend/node_modules/dotenv').parse(readFileSync('.env.production'));
  assert(env.STRIPE_SECRET_KEY?.startsWith('sk_live_')); assert(env.STRIPE_PUBLISHABLE_KEY?.startsWith('pk_live_'));
  assert.equal(env.STRIPE_LIVE_MODE_ENABLED, 'false');
  const aws = (...args) => JSON.parse(execFileSync('aws', [...args, '--region', 'us-east-1', '--output', 'json'], {encoding: 'utf8', stdio: ['ignore','pipe','pipe']}));
  assert.equal(aws('sts','get-caller-identity').Account, '427057633951');
  const secret = JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/recovery-source').SecretString);
  assert.equal(secret.SUPABASE_URL, 'https://jdrgluisxhgegdsesman.supabase.co');
  const url = new URL(secret.DATABASE_URL); url.hostname='aws-0-us-east-1.pooler.supabase.com'; url.username='postgres.jdrgluisxhgegdsesman'; url.port='5432'; url.search='';
  const {Client} = require('../../backend/node_modules/pg');
  const db = new Client({connectionString:url.toString(), ssl:{rejectUnauthorized:true, ca:readFileSync('infra/recovery/supabase-ca.crt','utf8')}, connectionTimeoutMillis:15000});
  await db.connect();
  try {
    await db.query('begin'); await db.query("set local lock_timeout='5s'; set local statement_timeout='15s'");
    assert.deepEqual((await db.query('select stripe_environment,live_activation_approved from public.billing_runtime_configuration for update')).rows,
      [{stripe_environment:'live',live_activation_approved:false}]);
    const rows = (await db.query('select * from public.billing_catalog_prices where price_code=any($1) for update',[MEMBER_PRICING_V2.map(p=>p.priceCode)])).rows;
    assert.equal(rows.length,6);
    for (const p of MEMBER_PRICING_V2) {
      const r=rows.find(r=>r.price_code===p.priceCode); assert.equal(r.is_active,false); assert.equal(r.unit_amount_cents,p.amount);
      assert.equal(r.currency_code,'USD'); assert.equal(r.billing_interval,p.interval); assert.equal(r.interval_count,1);
      assert.equal(r.is_unlimited,p.unlimited); assert.equal(r.included_entitlement_quantity,p.allowance); assert.equal(r.usage_limit_quantity,p.allowance);
    }
    const Stripe = require('../../backend/node_modules/stripe');
    const result = await prepareCatalog(new Stripe(env.STRIPE_SECRET_KEY,{apiVersion,maxNetworkRetries:1,timeout:20000}));
    for (const {plan,price} of result.prices) {
      const catalogId=rows.find(r=>r.price_code===plan.priceCode).id;
      const existing=(await db.query("select provider_product_id,provider_price_id,status from public.billing_provider_price_mappings where catalog_price_id=$1 and provider='stripe' and provider_environment='live' and status<>'disabled'",[catalogId])).rows;
      if(existing.length) assert.deepEqual(existing,[{provider_product_id:result.product.id,provider_price_id:price.id,status:'verified'}]);
      else await db.query("insert into public.billing_provider_price_mappings(catalog_price_id,provider,provider_environment,provider_product_id,provider_price_id,status,verified_at,metadata) values($1,'stripe','live',$2,$3,'verified',now(),$4)",
        [catalogId,result.product.id,price.id,{source:'production_catalog_preactivation',api_version:apiVersion}]);
    }
    const existingPortal=(await db.query("select provider_configuration_id,status from public.billing_provider_configurations where provider='stripe' and provider_environment='live' and configuration_kind='customer_portal'")).rows;
    if(existingPortal.length) assert.deepEqual(existingPortal,[{provider_configuration_id:result.portal.id,status:'verified'}]);
    else await db.query("insert into public.billing_provider_configurations(provider,provider_environment,configuration_kind,provider_configuration_id,status,verified_at,metadata) values('stripe','live','customer_portal',$1,'verified',now(),$2)",[result.portal.id,{source:'production_catalog_preactivation',api_version:apiVersion}]);
    await db.query('commit');
    const report={at:new Date().toISOString(),account:result.account.id,chargesEnabled:result.account.charges_enabled,payoutsEnabled:result.account.payouts_enabled,
      requirementsVisible:result.account.requirements!=null,product:result.product.id,portal:result.portal.id,
      prices:result.prices.map(({plan,price})=>({code:plan.priceCode,id:price.id,amount:plan.amount,interval:plan.interval,monthlyAllowance:plan.allowance,unlimited:plan.unlimited})),
      catalogActive:false,liveActivationApproved:false,chargesCreated:0,webhookConfigured:false};
    const dir=mkdtempSync('.recovery-private/production-stripe-catalog-'); writeFileSync(dir+'/report.json',JSON.stringify(report,null,2),{mode:0o600});
    console.log(JSON.stringify({...report,evidence:dir}));
  } finally {await db.query('rollback').catch(()=>{});await db.end();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(error=>{
  console.error(JSON.stringify({passed:false,type:error.type||error.code||error.name,message:'Catalog preparation stopped; inspect exact catalog state before retrying. Secrets/provider payloads omitted.'}));process.exitCode=1;
});

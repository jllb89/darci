// Isolated database proof only. Synthetic provider IDs are not Stripe acceptance evidence.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
assert(process.argv.includes('--confirm-isolated'), 'Disposable local database confirmation required');
const url = new URL(process.env.PHASE1_TEST_DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '54322');
assert.equal(url.pathname, '/postgres');
const db = new Client({ connectionString: url.toString() });
await db.connect();
let stage = 'verify local billing boundary';
try {
  assert.equal((await db.query('select stripe_environment from public.billing_runtime_configuration where singleton')).rows[0].stripe_environment, 'test');
  assert.equal((await db.query("select count(*)::int n from public.billing_provider_price_mappings where status='verified'")).rows[0].n, 0,
    'Use the disposable migration instance, not an instance with configured provider objects');
  for (const file of ['member_billing_phase01.test.sql', 'member_billing_phase23.test.sql']) {
    stage = file;
    const source = await readFile(new URL(`../../supabase/tests/${file}`, import.meta.url), 'utf8');
    assert(/^begin;/i.test(source.trim()) && /rollback;$/i.test(source.trim()), 'SQL proof must roll back');
    await db.query('begin');
    // Fresh migrations intentionally do not activate purchasable plans. Emulate
    // only the catalog prerequisites inside this rolled-back local transaction.
    await db.query(`update public.billing_catalog_prices set is_active=true
      where price_code in ('member_starter_monthly','member_plus_monthly','member_volume_monthly');
      insert into public.billing_provider_price_mappings(catalog_price_id,provider,provider_environment,
        provider_product_id,provider_price_id,status,verified_at,metadata)
      select id,'stripe','test','prod_ISOLATED_SQL_ONLY','price_ISOLATED_SQL_ONLY_'||price_code,'verified',now(),
        '{"fixture":"isolated_sql_only","provider_verified":false}'::jsonb
      from public.billing_catalog_prices where price_code in ('member_starter_monthly','member_plus_monthly','member_volume_monthly');
      insert into public.billing_provider_configurations(provider,provider_environment,configuration_kind,
        provider_configuration_id,status,verified_at,metadata)
      values('stripe','test','customer_portal','bpc_ISOLATED_SQL_ONLY','verified',now(),
        '{"fixture":"isolated_sql_only","provider_verified":false}'::jsonb);`);
    await db.query(source.replace(/^\s*begin;/i, ''));
    console.log(`PASS: ${file}; local synthetic fixtures rolled back; no provider calls.`);
  }
  stage = 'runtime environment and grants';
  await db.query('begin');
  for (const environment of ['live', '', 'production', null]) {
    await db.query('savepoint bad_environment');
    await assert.rejects(db.query('select public.assert_stripe_runtime_environment($1)', [environment]), /STRIPE_RUNTIME_ENVIRONMENT_MISMATCH/);
    await db.query('rollback to savepoint bad_environment');
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal((await db.query("select has_table_privilege($1,'public.billing_runtime_configuration','UPDATE') ok", [role])).rows[0].ok, false);
  }
  await db.query('rollback');
  assert.equal((await db.query("select count(*)::int n from public.billing_provider_price_mappings where status='verified'")).rows[0].n, 0);
  console.log('PASS: live/invalid/missing environment rejected; app roles cannot change the database payment environment; no fixture mappings persisted.');
  console.log('Scope: SQL billing/usage/holds/RLS/leases only. Not real Stripe lifecycle, payment delivery or API acceptance.');
} catch (error) {
  console.error(JSON.stringify({ stage, status: 'failed', reason: error.message }));
  process.exitCode = 1;
} finally { await db.query('rollback'); await db.end(); }

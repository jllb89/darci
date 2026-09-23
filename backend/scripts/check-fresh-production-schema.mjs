// Read-only, local rehearsal only. Run before any test fixture suite.
import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {Client} = require('pg');
assert(process.argv.includes('--confirm-isolated'), 'Explicit local rehearsal confirmation required');
const url = new URL(process.env.PHASE2_TEST_DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert(['54322', '55322'].includes(url.port));
assert.equal(url.pathname, '/postgres');
const db = new Client({connectionString: url.toString(), connectionTimeoutMillis: 10000});
const root = new URL('../../supabase/migrations/', import.meta.url);
const files = (await readdir(root)).filter(f => /^\d{14}_.+\.sql$/.test(f)).sort();
await db.connect();
try {
  await db.query('begin transaction isolation level repeatable read read only');
  await db.query("set local statement_timeout='15s'");
  const versions = (await db.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r => r.version);
  assert.deepEqual(versions, files.map(f => f.slice(0, 14)), 'Migration history must match the checkout exactly');
  const emptyTables = ['auth.users', 'public.users', 'public.user_roles', 'public.admin_permissions',
    'public.documents', 'public.document_versions', 'public.signatures', 'storage.objects',
    'public.document_generation_runs', 'public.notification_jobs', 'public.notification_deliveries',
    'public.billing_customers', 'public.billing_orders', 'public.billing_subscriptions',
    'public.billing_entitlements', 'public.billing_usage_events', 'public.stripe_webhook_events',
    'public.billing_provider_price_mappings', 'public.billing_provider_configurations'];
  for (const table of emptyTables) {
    assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n, 0, `${table} contains non-reference data`);
  }
  const counts = {};
  for (const table of ['jurisdiction_rules', 'template_binding_rules', 'notification_templates', 'billing_catalog_prices']) {
    counts[table] = (await db.query(`select count(*)::int n from public.${table}`)).rows[0].n;
    assert(counts[table] > 0, `${table} reference data missing`);
  }
  assert.equal((await db.query('select count(*)::int n from public.billing_catalog_prices where is_active')).rows[0].n, 0, 'Fresh catalog must not sell plans');
  const mode = (await db.query('select stripe_environment,live_activation_approved from public.billing_runtime_configuration')).rows;
  assert.deepEqual(mode, [{stripe_environment: 'test', live_activation_approved: false}], 'Migration installation must not activate live billing');
  const buckets = (await db.query('select id,public from storage.buckets order by id')).rows;
  for (const id of ['documents', 'signatures', 'notarized-copies']) {
    assert(buckets.some(b => b.id === id && b.public === false), `${id} bucket missing or public`);
  }
  const protectedTables = ['users', 'documents', 'document_versions', 'signatures', 'user_roles',
    'admin_permissions', 'billing_entitlements', 'billing_runtime_configuration'];
  for (const table of protectedTables) {
    const row = (await db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0];
    assert.equal(row.relrowsecurity, true, `${table} RLS disabled`);
  }
  const migrations = await Promise.all(files.map(async file => ({file, sha256: createHash('sha256').update(await readFile(new URL(file, root))).digest('hex')})));
  console.log(JSON.stringify({passed: true, migrationCount: files.length, emptyTablesChecked: emptyTables.length,
    referenceCounts: counts, privateBuckets: buckets.map(b => b.id), protectedTables, migrations,
    scope: 'Fresh local bootstrap only; not hosted production, full role/API/Realtime acceptance, template content approval or live Stripe activation.'}, null, 2));
} finally {
  await db.query('rollback');
  await db.end();
}

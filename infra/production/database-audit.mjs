import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync, writeFileSync, mkdtempSync} from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {Client} = require('../../backend/node_modules/pg');
const aws = (...args) => JSON.parse(execFileSync('aws', [...args, '--region', 'us-east-1', '--output', 'json'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}));
const secret = JSON.parse(aws('secretsmanager', 'get-secret-value', '--secret-id', '/darci/production/recovery-source').SecretString);
assert.equal(secret.SUPABASE_URL, 'https://jdrgluisxhgegdsesman.supabase.co');
const url = new URL(secret.DATABASE_URL);
url.hostname = 'aws-0-us-east-1.pooler.supabase.com'; url.username = 'postgres.jdrgluisxhgegdsesman'; url.port = '5432'; url.search = '';
const db = new Client({connectionString: url.toString(), ssl: {rejectUnauthorized: true, ca: readFileSync('infra/recovery/supabase-ca.crt', 'utf8')}, connectionTimeoutMillis: 15000});
try {
  await db.connect();
  await db.query('begin transaction isolation level repeatable read read only');
  await db.query("set local statement_timeout='15s'");
  const migrations = (await db.query('select version, statements from supabase_migrations.schema_migrations order by version')).rows;
  const files = readdirSync('supabase/migrations').filter(f => /^\d{14}_.*\.sql$/.test(f)).sort();
  assert.deepEqual(migrations.map(m => m.version), files.map(f => f.slice(0, 14)));
  const storedStatementMismatches = [], statementTextUnavailable = [];
  for (const row of migrations) {
    const f = files.find(f => f.startsWith(row.version));
    if (!row.statements?.length) statementTextUnavailable.push(row.version);
    else if (row.statements.join('\n') !== readFileSync('supabase/migrations/' + f, 'utf8')) storedStatementMismatches.push(row.version);
  }
  const buckets = (await db.query('select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id')).rows;
  assert(buckets.every(b => !b.public));
  const rls = (await db.query("select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname")).rows;
  const protectedTables = ['users', 'documents', 'document_versions', 'signatures', 'user_roles', 'admin_permissions', 'billing_entitlements', 'billing_runtime_configuration', 'notification_deliveries'];
  for (const table of protectedTables) assert(rls.some(r => r.relname === table && r.relrowsecurity), `${table} RLS missing`);
  const mode = (await db.query('select stripe_environment,live_activation_approved from public.billing_runtime_configuration')).rows;
  assert.deepEqual(mode, [{stripe_environment: 'live', live_activation_approved: false}]);
  const counts = {};
  for (const t of ['documents', 'signatures', 'notarization_requests', 'document_hash_records', 'billing_subscriptions', 'billing_catalog_prices', 'notification_templates', 'jurisdiction_rules', 'template_binding_rules']) {
    counts[t] = (await db.query(`select count(*)::int n from public.${t}`)).rows[0].n;
  }
  const policies = (await db.query("select schemaname, count(*)::int n from pg_policies where schemaname in ('public','storage','realtime') group by schemaname")).rows;
  const unprotectedGrants = (await db.query("select c.relname, has_table_privilege('anon',c.oid,'SELECT') anon_read, has_table_privilege('authenticated',c.oid,'SELECT') authenticated_read, has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE') anon_write, has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') authenticated_write from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity")).rows;
  const publications = (await db.query('select pubname, schemaname, tablename from pg_publication_tables order by pubname, schemaname, tablename')).rows;
  await db.query('set local role anon');
  const anonymous = [];
  for (const table of protectedTables) {
    await db.query('savepoint probe');
    try {
      const rows = (await db.query(`select count(*)::int n from public.${table}`)).rows[0].n;
      assert.equal(rows, 0, `${table} exposed rows to anon`); anonymous.push({table, result: 'zero_rows'});
    } catch (error) {
      await db.query('rollback to savepoint probe');
      if (error.code !== '42501') throw error;
      anonymous.push({table, result: 'permission_denied'});
    }
  }
  const report = {at: new Date().toISOString(), coreProbesPassed: true, migrationCount: migrations.length,
    rawStatementTextDifferences: storedStatementMismatches,
    statementComparisonNote: 'Raw SQL text only: Supabase CLI stores split statements without original separators. Differences are not proof of schema drift; version inventory is checked separately.',
    statementTextUnavailableCount: statementTextUnavailable.length, unprotectedGrants,
    buckets, protectedTables, publicTableCount: rls.length, tablesWithoutRls: rls.filter(r => !r.relrowsecurity).map(r => r.relname), policies, publications,
    billing: mode, counts, anonymous, scope: 'Hosted read-only schema, grants/RLS and anonymous probes. Not full actor/device acceptance.'};
  const dir = mkdtempSync('.recovery-private/production-database-audit-');
  writeFileSync(dir + '/report.json', JSON.stringify(report, null, 2), {mode: 0o600});
  console.log(JSON.stringify({...report, evidence: dir}, null, 2));
} catch (error) { console.error(JSON.stringify({passed: false, code: error.code || 'assertion', reason: error instanceof assert.AssertionError ? error.message : 'Database audit failed; credentials omitted'})); process.exitCode = 1; }
finally {try {await db.query('rollback');} catch {} await db.end();}

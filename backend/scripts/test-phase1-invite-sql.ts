// Isolated PostgreSQL contract test; never point at Supabase or customer data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Pool } = require('pg');

async function main() {
  const raw = process.env.PHASE1_TEST_DATABASE_URL;
  if (!raw) throw new Error('PHASE1_TEST_DATABASE_URL is required');
  const url = new URL(raw);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^\/darci_phase1_[a-z0-9_]+$/.test(url.pathname)) {
    throw new Error('Only a dedicated darci_phase1_* database on loopback is permitted');
  }
  const pool = new Pool({ connectionString: raw, max: 10 });
  const sql = (s: string, args: unknown[] = []) => pool.query(s, args);
  try {
    const existing = await sql("select to_regclass('public.users') as users");
    assert.equal(existing.rows[0].users, null, 'Database must be empty; no destructive reset is performed');
    await sql(`create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);
      do $$ begin
        if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
        if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
        if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
      end $$;
      create table public.notification_templates(id uuid primary key);
      create table public.document_parties(id uuid primary key);
      create table public.document_output_signers(id uuid primary key);`);
    const root = path.resolve(__dirname, '../../supabase/migrations');
    const initial = fs.readFileSync(path.join(root, '20260224120000_init.sql'), 'utf8');
    const invites = fs.readFileSync(path.join(root, '20260419233000_add_phase3_invites_and_notifications.sql'), 'utf8');
    // Use production table definitions, not a mock of the transaction.
    for (const [source, names] of [[initial, ['users','documents','audit_events']], [invites, ['document_access_invites','invite_recipients','invite_tokens','invite_claims']]] as const) {
      for (const name of names) {
        const statement = source.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`))?.[0];
        assert.ok(statement, name);
        await sql(statement);
      }
    }
    await sql(fs.readFileSync(path.join(root, '20260917120000_atomic_verified_invite_claims.sql'), 'utf8'));
    const owner = '10000000-0000-0000-0000-000000000001';
    const signer = '10000000-0000-0000-0000-000000000002';
    const stranger = '10000000-0000-0000-0000-000000000003';
    for (const [id, email] of [[owner,'owner@example.test'],[signer,'signer@example.test'],[stranger,'wrong@example.test']]) {
      await sql('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id,email]);
      await sql('insert into public.users(id,supabase_user_id,email) values($1,$1,$2)', [id,email]);
    }
    const doc = (await sql("insert into documents(owner_id,idn) values($1,'TESTINVITE01') returning id",[owner])).rows[0].id;
    const obligation = (await sql('insert into document_output_signers values(gen_random_uuid()) returning id')).rows[0].id;
    async function fixture() {
      const invite = (await sql(`insert into document_access_invites(document_id,document_output_signer_id,created_by_user_id,invite_kind,status,expires_at)
        values($1,$2,$3,'document_signing','sent',now()+interval '1 day') returning id`,[doc,obligation,owner])).rows[0].id;
      await sql("insert into invite_recipients(invite_id,delivery_address) values($1,'signer@example.test')",[invite]);
      const token = (await sql("insert into invite_tokens(invite_id,token_hash,expires_at) values($1,gen_random_uuid()::text,now()+interval '1 day') returning token_hash",[invite])).rows[0].token_hash;
      return { invite, token };
    }
    const claim = (user: string|null, token: string|null, invite: string|null = null) => sql('select claim_document_invite($1,$2,$3)',[user,token,invite]);
    const f = await fixture();
    await assert.rejects(claim(null,f.token), /INVITE_IDENTITY_REQUIRED/);
    await assert.rejects(claim(stranger,f.token), /INVITE_IDENTITY_REQUIRED/);
    await sql('update auth.users set email_confirmed_at=null where id=$1',[signer]);
    await assert.rejects(claim(signer,f.token), /INVITE_IDENTITY_REQUIRED/);
    await sql('update auth.users set email_confirmed_at=now() where id=$1',[signer]);
    await Promise.all(Array.from({length:20},()=>claim(signer,f.token)));
    assert.equal((await sql('select count(*)::int n from invite_claims where invite_id=$1',[f.invite])).rows[0].n,1);
    assert.equal((await sql('select use_count from invite_tokens where invite_id=$1',[f.invite])).rows[0].use_count,1);
    assert.equal((await sql('select count(*)::int n from audit_events where entity_id=$1',[f.invite])).rows[0].n,1);
    await sql("update invite_tokens set expires_at=now()-interval '1 day' where invite_id=$1",[f.invite]);
    await assert.rejects(claim(signer,f.token), /INVITE_UNAVAILABLE/);
    await claim(signer,null,f.invite); // durable existing access, not resurrection
    await sql("update document_access_invites set status='revoked' where id=$1",[f.invite]);
    await assert.rejects(claim(signer,null,f.invite), /INVITE_UNAVAILABLE/);
    const expired = await fixture();
    await sql("update document_access_invites set expires_at=now()-interval '1 day' where id=$1",[expired.invite]);
    await assert.rejects(claim(signer,null,expired.invite), /INVITE_UNAVAILABLE/);
    const fail = await fixture();
    await sql(`create function public.reject_test_audit() returns trigger language plpgsql as $$ begin raise exception 'injected audit outage'; end $$;
      create trigger reject_test_audit before insert on audit_events for each row execute function reject_test_audit();`);
    await assert.rejects(claim(signer,fail.token), /injected audit outage/);
    assert.equal((await sql('select use_count from invite_tokens where invite_id=$1',[fail.invite])).rows[0].use_count,0);
    assert.equal((await sql('select count(*)::int n from invite_claims where invite_id=$1',[fail.invite])).rows[0].n,0);
    await sql('drop trigger reject_test_audit on audit_events');
    await claim(signer,fail.token);
    for (const role of ['anon','authenticated']) {
      assert.equal((await sql("select has_function_privilege($1,'public.claim_document_invite(uuid,text,uuid)','EXECUTE') ok",[role])).rows[0].ok,false);
    }
    console.log('PASS: anonymous/wrong/unverified identity, concurrent idempotency, expiry, revocation, durable audit rollback/retry, RPC grants');
    console.log('Scope: production invite tables + claim migration; this is not the full Supabase RLS/storage rehearsal.');
  } finally { await pool.end(); }
}
main().catch(error=>{ console.error(error.message); process.exitCode=1; });

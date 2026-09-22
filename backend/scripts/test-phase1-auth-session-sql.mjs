// Synthetic session/role checks only; every fixture is rolled back.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const { Client } = require('pg');
assert(process.argv.includes('--confirm-isolated'));
const url = new URL(process.env.PHASE1_TEST_DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '54322'); assert.equal(url.pathname, '/postgres');
const db = new Client({ connectionString: url.toString() }); await db.connect();
const user = randomUUID(), other = randomUUID(), session = randomUUID();
const sql = (q, p = []) => db.query(q, p);
const active = async (u = user, s = session) => (await sql('select public.is_auth_session_active($1,$2) active', [u,s])).rows[0].active;
try {
  await sql('begin');
  await sql('insert into auth.users(id) values($1),($2)',[user,other]);
  await sql('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);
  assert.equal(await active(),true);
  assert.equal(await active(other),false); assert.equal(await active(user,randomUUID()),false);
  for (const role of ['anon','authenticated']) {
    await sql('savepoint role_case');
    await sql(`set local role ${role}`);
    await assert.rejects(()=>active(),/permission denied/);
    await sql('rollback to savepoint role_case');
  }
  await sql('set local role service_role'); assert.equal(await active(),true); await sql('reset role');
  await sql("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[session]); assert.equal(await active(),false);
  await sql('update auth.sessions set not_after=null where id=$1',[session]);
  await sql("update auth.users set banned_until=now()+interval '1 hour' where id=$1",[user]); assert.equal(await active(),false);
  await sql('update auth.users set banned_until=null,deleted_at=now() where id=$1',[user]); assert.equal(await active(),false);
  await sql('update auth.users set deleted_at=null where id=$1',[user]); assert.equal(await active(),true);
  await sql('delete from auth.sessions where id=$1',[session]); assert.equal(await active(),false);
  console.log('PASS: actual SQL session ownership, logout deletion, deadline, banned/deleted Auth users; anon/authenticated cannot call the server-only check. All fixtures rolled back.');
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {await sql('rollback');await db.end();}

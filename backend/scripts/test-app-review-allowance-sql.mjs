import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url),{Client}=require('pg');
assert(process.argv.includes('--confirm-isolated'));
const url=new URL(process.env.PHASE1_TEST_DATABASE_URL??'');
assert.equal(url.hostname,'127.0.0.1');assert(['54322','55322'].includes(url.port));
const db=new Client({connectionString:url.toString()});await db.connect();
let checks=0;
try {
  await db.query('begin');
  await db.query(readFileSync(new URL('../../supabase/migrations/20261013215749_app_review_document_allowance.sql',import.meta.url),'utf8'));
  for(const role of ['anon','authenticated']){
    const {rows}=await db.query("select has_function_privilege($1,'public.consume_app_review_document_workflow(uuid,uuid,uuid,text,text,text,uuid)','EXECUTE') ok",[role]);
    assert.equal(rows[0].ok,false);checks++;
  }
  const u=randomUUID(),auth=randomUUID(),a=randomUUID(),e=randomUUID(),other=randomUUID();
  await db.query("insert into public.users(id,supabase_user_id,email,status) values($1,$2,'apple-review@illuminotary.com','active'),($3,$4,'isolated-review-other@example.invalid','active')",[u,auth,other,randomUUID()]);
  await db.query("insert into public.billing_accounts(id,owner_user_id,is_default,metadata) values($1,$2,true,$3)",[a,u,JSON.stringify({source:'app_review',auth_id:auth})]);
  await db.query("insert into public.billing_entitlements(id,billing_account_id,owner_user_id,entitlement_type,status,quantity_total,starts_at,ends_at,metadata) values($1,$2,$3,'document_workflow_capacity','active',25,now()-interval '1 hour',now()+interval '29 days','{\"source\":\"app_review\"}')",[e,a,u]);
  const doc=async owner=>{const id=randomUUID();await db.query("insert into public.documents(id,owner_id,document_type,jurisdiction,status) values($1,$2,'poa','US-CA','draft')",[id,owner]);return id;};
  const call=(id,expected='draft',next='pending_signature')=>db.query('select * from public.consume_app_review_document_workflow($1,$2,$3,$4,$5,$6,$7)',[a,e,id,`document:${id}:first_submission`,expected,next,u]);
  const rejects=async(fn,pattern)=>{
    await db.query('savepoint negative');
    await assert.rejects(fn,pattern);await db.query('rollback to savepoint negative');checks++;
  };
  const foreign=await doc(other),first=await doc(u);
  await db.query('set local role service_role');
  await rejects(()=>call(foreign),/BILLING_DOCUMENT_OWNER_MISMATCH/);
  await rejects(()=>call(first,null),/BILLING_DOCUMENT_TRANSITION_NOT_ALLOWED/);
  await rejects(()=>call(first,'draft','completed'),/BILLING_DOCUMENT_TRANSITION_NOT_ALLOWED/);
  const result=(await call(first)).rows[0];assert.equal(result.quantity_used,1);checks++;
  const replay=(await call(first)).rows[0];assert.equal(replay.was_already_consumed,true);assert.equal(replay.quantity_used,1);checks++;
  for(let i=2;i<=25;i++){
    const id=await doc(u);const r=(await call(id)).rows[0];assert.equal(r.quantity_used,i);checks++;
  }
  await rejects(async()=>call(await doc(u)),/BILLING_WORKFLOW_LIMIT_REACHED/);
  await db.query("update public.billing_entitlements set ends_at=now()-interval '1 minute' where id=$1",[e]);
  await rejects(()=>call(first),/BILLING_PERIOD_NOT_ACTIVE/);
  await db.query("update public.billing_entitlements set ends_at=now()+interval '29 days',metadata='{}' where id=$1",[e]);
  await rejects(()=>call(first),/BILLING_REVIEW_ACCOUNT_NOT_ELIGIBLE/);
  await db.query('reset role');
  const n=(await db.query('select count(*)::int n from public.billing_usage_events where entitlement_id=$1',[e])).rows[0].n;
  assert.equal(n,25);checks++;
  await db.query('rollback');
  console.log(JSON.stringify({passed:true,checks,rolledBack:true,providerCalls:0,scope:'Service-only grant, ownership, deadline, drift/idempotency and 25-document limit'}));
}finally{await db.query('rollback');await db.end();}

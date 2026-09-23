// Local disposable database only; all synthetic records and mutations roll back.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{Client}=require('pg');
assert(process.argv.includes('--confirm-isolated'));
const url=new URL(process.env.PHASE1_TEST_DATABASE_URL??'');
assert.equal(url.hostname,'127.0.0.1');assert(['54322','55322'].includes(url.port));assert.equal(url.pathname,'/postgres');
const db=new Client({connectionString:url.toString()});await db.connect();
const q=(s,p=[])=>db.query(s,p),actors={},doc=randomUUID(),request=randomUUID();let assertions=0;
const check=(actual,expected)=>{assert.equal(actual,expected);assertions++;};
async function context(a,session=a.session){
  await q('reset role');
  await q("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a.auth,role:'authenticated',session_id:session})]);
  await q('set local role authenticated');
}
async function allowed(topic){return(await q('select public.can_receive_private_realtime($1) allowed',[topic])).rows[0].allowed;}
try{
  await q('begin');
  for(const [name,role] of [['owner','member'],['other','member'],['selected','notary'],['wrong','notary'],['admin','admin']]){
    const a={id:randomUUID(),auth:randomUUID(),session:randomUUID()};actors[name]=a;
    await q('insert into auth.users(id) values($1)',[a.auth]);
    await q('insert into auth.sessions(id,user_id) values($1,$2)',[a.session,a.auth]);
    await q("insert into public.users(id,supabase_user_id,email,role,status) values($1,$2,$3,$4,'active')",[a.id,a.auth,`realtime-${a.id}@example.invalid`,role]);
  }
  await q("insert into public.documents(id,owner_id,status,document_type,jurisdiction) values($1,$2,'pending_notary','document','US-CA')",[doc,actors.owner.id]);
  await q("insert into public.notarization_requests(id,document_id,assigned_notary_id,status) values($1,$2,$3,'in_review')",[request,doc,actors.selected.id]);
  for(const [name,expected] of [['owner',true],['selected',true],['other',false],['wrong',false],['admin',true]]){
    await context(actors[name]);check(await allowed('request:'+request),expected);
    check(await allowed('request:'+randomUUID()),false);
    for(const malformed of [null,'', 'request:not-a-uuid', 'request:'+request+':extra','anything:'+request])check(await allowed(malformed),false);
  }
  await context(actors.selected);
  check((await q('select count(*)::int n from public.documents where id=$1',[doc])).rows[0].n,0);
  check(await allowed('notary-queue:'+actors.selected.id),true);
  check(await allowed('notary-queue:'+actors.wrong.id),false);
  await context(actors.owner);check(await allowed('notary-queue:'+actors.owner.id),false);
  await context(actors.owner,actors.other.session);check(await allowed('request:'+request),false);
  await context(actors.owner,'bad-session');check(await allowed('request:'+request),false);
  for(const [name,table,column,value] of [
    ['selected','user_roles','status','revoked'],['admin','user_roles','status','revoked'],
    ['owner','users','status','suspended'],
  ]){
    await q('reset role');await q('savepoint mutation');
    await q(`update public.${table} set ${column}=$1${table==='user_roles'?',is_active_profile=false':''} where ${table==='user_roles'?'user_id':'id'}=$2`,[value,actors[name].id]);
    await context(actors[name]);check(await allowed('request:'+request),false);
    await q('reset role');await q('rollback to savepoint mutation');
  }
  await q("update auth.users set banned_until=now()+interval '1 hour' where id=$1",[actors.owner.auth]);
  await context(actors.owner);check(await allowed('request:'+request),false);
  await q('reset role');await q('update auth.users set banned_until=null where id=$1',[actors.owner.auth]);
  await q('delete from auth.sessions where id=$1',[actors.owner.session]);
  await context(actors.owner);check(await allowed('request:'+request),false);
  await q('reset role');
  check((await q("select has_function_privilege('anon','public.can_receive_private_realtime(text)','EXECUTE') allowed")).rows[0].allowed,false);
  check((await q("select qual like '%can_receive_private_realtime%' and qual like '%broadcast%' correct from pg_policies where schemaname='realtime' and policyname='darci_request_realtime_broadcast_receive'")).rows[0].correct,true);
  console.log(JSON.stringify({passed:true,assertions,scope:'Local SQL actor/topic/liveness/role matrix; direct document RLS stays unchanged; all fixtures rolled back'}));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{await q('rollback');await db.end();}

// Exercise genuine local GoTrue tokens, real PostgREST RPC and the API middleware.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { createClient }=require('@supabase/supabase-js'); const { Client }=require('pg');
const express=require('express');
assert(process.argv.includes('--confirm-isolated'));
const c=JSON.parse(await readFile(process.argv[2],'utf8'));
assert.equal(c.API_URL,'http://127.0.0.1:54321');
assert.equal(new URL(c.DB_URL).hostname,'127.0.0.1'); assert.equal(new URL(c.DB_URL).port,'54322');
Object.assign(process.env,{NODE_ENV:'production',APP_ENV:'staging',SUPABASE_URL:c.API_URL,
  SUPABASE_ANON_KEY:c.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:c.SERVICE_ROLE_KEY,SUPABASE_JWT_SECRET:c.JWT_SECRET,
  SENTRY_ENABLED:'false',SENTRY_DSN:''});
const { requireAuth }=require('../dist/middleware/auth.js');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(c.API_URL,c.SERVICE_ROLE_KEY,options), member=createClient(c.API_URL,c.ANON_KEY,options);
const db=new Client({connectionString:c.DB_URL}); await db.connect();
const app=express(); app.use(requireAuth); app.get('/protected',(_req,res)=>res.json({allowed:true}));
const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
const base=`http://127.0.0.1:${server.address().port}`;
const check=async token=>(await fetch(`${base}/protected`,{headers:{Authorization:`Bearer ${token}`}})).status;
try {
  const email=`phase1-session-${randomUUID()}@example.invalid`, password=`Fixture-${randomUUID()}`;
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true}); assert.equal(created.error,null);
  const id=created.data.user.id;
  await db.query("insert into public.users(id,supabase_user_id,email,status,role) values($1,$1,$2,'active','member') on conflict(supabase_user_id) do nothing",[id,email]);
  const signed=await member.auth.signInWithPassword({email,password}); assert.equal(signed.error,null);
  const token=signed.data.session.access_token;
  assert.equal(await check(c.ANON_KEY),401,'Public key must not authorize a member request');
  assert.equal(await check(token),200,'Genuine local Supabase session must authorize');
  const appUser=(await db.query('select id from public.users where supabase_user_id=$1',[id])).rows[0].id;
  await db.query("insert into public.user_roles(user_id,role,status,is_active_profile) values($1,'member','revoked',false) on conflict(user_id,role) do update set status='revoked',is_active_profile=false",[appUser]);
  assert.equal(await check(token),403,'Revoked role must deny a still-valid session');
  await db.query("update public.user_roles set status='active',is_active_profile=true where user_id=$1 and role='member'",[appUser]);
  assert.equal(await check(token),200);
  assert.equal((await member.auth.signOut({scope:'local'})).error,null);
  assert.equal(await check(token),401,'The exact unexpired token must stop working after real Auth logout');
  console.log('PASS: real local Auth login token accepted; anonymous key rejected; revoked role denied; actual Auth logout invalidates the same unexpired token through the API. Synthetic local fixture retained.');
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {await new Promise(resolve=>server.close(resolve));await db.end();}

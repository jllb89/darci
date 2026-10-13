// Activation/acceptance only after the exact reviewed release passes production.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createClient}=require('../../backend/node_modules/@supabase/supabase-js');
assert(process.argv.includes('--activate-approved-review-account'));process.umask(0o077);
const revision=process.argv.find(a=>a.startsWith('--revision='))?.slice(11);assert(/^[a-f0-9]{40}$/.test(revision??''));
const releases=JSON.parse(execFileSync('gh',['run','list','--workflow','deploy-production.yml','--limit','10','--json','headSha,conclusion,status'],{encoding:'utf8'}));
assert(releases.some(r=>r.headSha===revision&&r.status==='completed'&&r.conclusion==='success'),'The exact production release has not passed yet');
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
const version=stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue;
const env=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',version).SecretString);
assert.equal(env.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
const dir='.recovery-private/apple-review-2026-10-13',config=JSON.parse(readFileSync(dir+'/config.json'));
assert.deepEqual(JSON.parse(env.APP_REVIEW_ACCESS_CONFIG),config);
const code=readFileSync(dir+'/app-store-connect-credentials.txt','utf8').match(/^Review code: (\d{8})$/m)?.[1];assert(code);
const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=r=>{if(r.error)throw new Error('Review fixture verification failed');return r.data;};
const identity=ok(await db.from('users').select('id,status,email').eq('id',config.userId).eq('supabase_user_id',config.authId).single());
assert.equal(identity.email,config.email);assert(['active','suspended'].includes(identity.status));
const roles=ok(await db.from('user_roles').select('role,status').eq('user_id',config.userId));
assert.deepEqual(roles.filter(r=>r.status==='active').map(r=>r.role).sort(),['member','notary']);
if(identity.status==='suspended'){
  const changed=ok(await db.from('users').update({status:'active'}).eq('id',config.userId).eq('status','suspended').select('id').single());
  assert.equal(changed.id,config.userId);
  ok(await db.from('audit_events').insert({entity_type:'user',entity_id:config.userId,action:'auth.app_review_account_activated',
    metadata:{source:'app_review',operator_approved:true,revision,expires_at:config.expiresAt}}));
}
const checks=[];let token;
const request=async(path,method='GET',body,expected=200,profile='member')=>{
  const r=await fetch('https://api.illuminotary.com'+path,{method,
    headers:{'Content-Type':'application/json','X-Darci-Billing-Catalog':'2','X-DARCi-Profile':profile,
      ...(token?{Authorization:`Bearer ${token}`}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  const result=await r.json();checks.push({path,method,status:r.status});
  assert.equal(r.status,expected,`Review acceptance failed on ${path}: ${r.status}`);return result;
};
try{
  const start=await request('/auth/otp/start','POST',{email:config.email});
  assert.equal(start.otpLength,8);assert(start.message.includes('No email is sent'));
  // A wrong credential must never fall back to ordinary OTP/session issuance.
  const bad=code==='00000000'?'11111111':'00000000';
  await request('/auth/otp/verify','POST',{email:config.email,token:bad},401);
  const login=await request('/auth/otp/verify','POST',{email:config.email,token:code});
  assert.equal(login.profileCompletionRequired,false);assert.equal(login.user.email,config.email);
  token=login.accessToken;assert(token);writeFileSync(dir+'/acceptance-session.json',JSON.stringify(login),{mode:0o600});
  const me=await request('/users/me');assert.deepEqual(me.user.availableRoles.sort(),['member','notary']);
  const membership=await request('/billing/member-membership');
  assert.equal(membership.membership.state,'review_access');assert.equal(membership.membership.allowance.total,25);
  assert.equal(membership.eligibility.canCreateWorkflow,true);assert.equal(membership.actions.canCheckout,false);
  await request('/billing/member-membership/checkout','POST',{priceCode:'member_starter_monthly_v2',idempotencyToken:'review-never-charge'},403);
  await request('/admin/users','GET',undefined,403);
  await request('/users/me/active-role','PATCH',{role:'notary'});
  const queue=await request('/notary/requests','GET',undefined,200,'notary');
  assert.deepEqual(queue.requests,[]);assert.equal(queue.realtimeQueueUserId,null);
  await request('/notary/idn/resolve','POST',{idn:'APP_REVIEW_NO_CLIENT_LOOKUP'},403,'notary');
  await request('/users/me/active-role','PATCH',{role:'admin'},403);
  await request('/users/me/active-role','PATCH',{role:'member'});
  // Verify a normal Supabase refresh still preserves the fixture profile.
  token=undefined;
  const refreshed=await request('/auth/refresh','POST',{refreshToken:login.refreshToken});
  token=refreshed.accessToken;assert(token);assert.equal(refreshed.user.phone,'+12025550101');
  // Revoke this acceptance session; Apple's login remains available.
  await request('/auth/logout','POST',{refreshToken:refreshed.refreshToken,scope:'local'});
  writeFileSync(dir+'/acceptance.json',JSON.stringify({at:new Date().toISOString(),revision,passed:true,checks,
    memberAndNotaryRoles:true,notaryWalkthrough:'pending',charges:0,externalMessages:0,clientRowsChanged:0,
    expiresAt:config.expiresAt},null,2),{mode:0o600});
  console.log(JSON.stringify({passed:true,checks:checks.length,expiresAt:config.expiresAt,credentialsFile:dir+'/app-store-connect-credentials.txt',notaryWalkthrough:'pending'}));
}catch(e){
  // Do not leave an unverified shortcut active after an acceptance failure.
  await db.from('users').update({status:'suspended'}).eq('id',config.userId);
  await db.auth.admin.signOut(token??'','global').catch(()=>{});
  writeFileSync(dir+'/acceptance-failed.json',JSON.stringify({at:new Date().toISOString(),revision,checks,
    accountSuspended:true,reason:e instanceof assert.AssertionError?e.message:'Acceptance failed; sensitive details omitted'},null,2),{mode:0o600});
  console.error('Review acceptance failed; dedicated account suspended again. Inspect private evidence.');process.exitCode=1;
}

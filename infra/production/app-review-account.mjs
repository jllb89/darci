// Only the explicitly approved synthetic Apple member/notary. No client writes.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,randomInt,scryptSync} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createClient}=require('../../backend/node_modules/@supabase/supabase-js');
process.umask(0o077);
assert(process.argv.includes('--approved-review-account'));
const dir='.recovery-private/apple-review-2026-10-13';
mkdirSync(dir,{recursive:true,mode:0o700});
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];
assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
const version=stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue;
const env=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',version).SecretString);
assert.equal(env.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=r=>{if(r.error)throw new Error(`Review fixture operation failed: ${r.error.code??r.error.status??'unknown'}`);return r.data;};
const configPath=dir+'/config.json',receiptPath=dir+'/receipt.json';
let config,receipt;
if(existsSync(configPath)){
  config=JSON.parse(readFileSync(configPath)); receipt=JSON.parse(readFileSync(receiptPath));
}else{
  const existing=ok(await db.from('users').select('id').eq('email','apple-review@illuminotary.com').maybeSingle());
  assert(!existing,'A review identity already exists; inspect it rather than taking over an account');
  const code=randomInt(0,100_000_000).toString().padStart(8,'0');
  const salt=randomBytes(16).toString('hex');
  const startsAt=new Date().toISOString(),expiresAt=new Date(Date.now()+30*86400000).toISOString();
  config={enabled:true,email:'apple-review@illuminotary.com',authId:randomUUID(),userId:randomUUID(),expiresAt,salt,
    codeHash:scryptSync(code,Buffer.from(salt,'hex'),32).toString('hex')};
  receipt={startsAt,expiresAt,authId:null,userId:config.userId,billingAccountId:randomUUID(),entitlementId:randomUUID(),stage:'prepared'};
  writeFileSync(configPath,JSON.stringify(config,null,2),{mode:0o600});
  writeFileSync(receiptPath,JSON.stringify(receipt,null,2),{mode:0o600});
  writeFileSync(dir+'/app-store-connect-credentials.txt',`APPLE APP REVIEW — PRIVATE CREDENTIAL\nEmail: ${config.email}\nReview code: ${code}\nExpires: ${expiresAt}\n\nChoose email login, enter the email above, then enter this reusable eight-digit review code. No email/SMS is sent for this dedicated account.\nMember allowance: 25 synthetic test documents; no payment required and no Stripe subscription created.\nMember and notary profiles are granted. The notary walkthrough is not yet configured; its queue is deliberately empty and client requests cannot be accessed.\nUse fictional information only. Do not use this persistent account for deletion in the demonstration; prepare a separate disposable fixture.\nNo admin access. No real commission, seal or completed notarization is represented.\n`,{mode:0o600});
}
const save=stage=>{receipt.stage=stage;writeFileSync(receiptPath,JSON.stringify(receipt,null,2),{mode:0o600});};
if(!receipt.authId){
  const auth=ok(await db.auth.admin.createUser({email:config.email,email_confirm:true,
    app_metadata:{app_review:{version:1,expires_at:config.expiresAt}},
    user_metadata:{first_name:'Apple',last_name:'Review',synthetic:true}})).user;
  receipt.authId=auth.id;config.authId=auth.id;
  writeFileSync(configPath,JSON.stringify(config,null,2),{mode:0o600});save('auth-created');
}
const auth=ok(await db.auth.admin.getUserById(config.authId)).user;
assert.equal(auth.email,config.email);assert.equal(auth.app_metadata.app_review.expires_at,config.expiresAt);
let user=ok(await db.from('users').select('id,status').eq('supabase_user_id',config.authId).maybeSingle());
if(!user){
  user=ok(await db.from('users').insert({id:config.userId,supabase_user_id:config.authId,email:config.email,
    first_name:'Apple',last_name:'Review',role:'member',status:'suspended',phone:'+12025550101',
    email_confirmed_at:receipt.startsAt}).select('id,status').single());
}
assert.equal(user.id,config.userId);save('app-identity-created');
const operator=ok(await db.from('users').select('id,role').eq('email','lopezb.jl@gmail.com').single());
const adminRole=ok(await db.from('user_roles').select('id').eq('user_id',operator.id).eq('role','admin').eq('status','active').single());
assert(adminRole.id,'The approving operator must still hold an active admin grant');
for(const role of ['member','notary']){
  const existing=ok(await db.from('user_roles').select('id,status').eq('user_id',user.id).eq('role',role).maybeSingle());
  if(!existing)ok(await db.from('user_roles').insert({user_id:user.id,role,status:'active',is_active_profile:role==='member',
    granted_by_user_id:operator.id,granted_reason:'operator_approved_app_review_fixture',
    metadata:{source:'app_review',synthetic:true,expires_at:config.expiresAt}}));
}
const notary=ok(await db.from('notary_profiles').select('id').eq('user_id',user.id).maybeSingle());
if(!notary)ok(await db.from('notary_profiles').insert({user_id:user.id,
  review_notes:'Synthetic Apple review profile only. No legal commission; notary walkthrough pending.',
  metadata:{source:'app_review',synthetic:true,expires_at:config.expiresAt}}));
const account=ok(await db.from('billing_accounts').select('id').eq('owner_user_id',user.id).eq('account_key','default').maybeSingle());
if(!account)ok(await db.from('billing_accounts').insert({id:receipt.billingAccountId,owner_user_id:user.id,is_default:true,
  status:'active',display_name:'Apple App Review — no-charge test allowance',billing_email:config.email,
  metadata:{source:'app_review',auth_id:config.authId,expires_at:config.expiresAt}}));
else assert.equal(account.id,receipt.billingAccountId);
const entitlement=ok(await db.from('billing_entitlements').select('id').eq('id',receipt.entitlementId).maybeSingle());
if(!entitlement)ok(await db.from('billing_entitlements').insert({id:receipt.entitlementId,
  billing_account_id:receipt.billingAccountId,owner_user_id:user.id,entitlement_type:'document_workflow_capacity',
  status:'active',quantity_total:25,quantity_used:0,is_unlimited:false,starts_at:receipt.startsAt,ends_at:config.expiresAt,
  activated_at:receipt.startsAt,metadata:{source:'app_review',synthetic:true,operator_approved:true}}));
if(!receipt.audited){
  ok(await db.from('audit_events').insert({actor_id:operator.id,entity_type:'user',entity_id:user.id,
    action:'auth.app_review_account_provisioned',metadata:{source:'app_review',synthetic:true,roles:['member','notary'],
      allowance:25,expires_at:config.expiresAt,notary_walkthrough:'pending',status:'suspended_until_guarded_deployment'}}));
  receipt.audited=true;
}
save('prepared-suspended');
console.log(JSON.stringify({prepared:true,accountSuspended:user.status==='suspended',roles:['member','notary'],allowance:25,
  expiresAt:config.expiresAt,credentialsFile:dir+'/app-store-connect-credentials.txt',clientRecordsChanged:0,charges:0,emailsSent:0}));

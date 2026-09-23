// One approved operator email + SMS only. Never prints OTPs, tokens or provider payloads.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url),{createClient}=require('../../backend/node_modules/@supabase/supabase-js');
assert(process.argv.includes('--send-approved-operator-otp'));
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue).SecretString);
assert.equal(secret.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');assert.equal(secret.STRIPE_LIVE_MODE_ENABLED,'false');
const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(secret.SUPABASE_URL,secret.SUPABASE_SERVICE_ROLE_KEY,options),client=createClient(secret.SUPABASE_URL,secret.SUPABASE_ANON_KEY,options);
const ok=r=>{assert(!r.error,`Provider operation failed (${r.error?.code??r.error?.status??'unknown'})`);return r.data;};
const email='lopezb.jl@gmail.com',phone='+525542850675';
const users=ok(await admin.auth.admin.listUsers({page:1,perPage:1000})).users;assert(users.length<1000,'Review pagination before operator setup');
const found=users.filter(u=>u.email===email||u.phone===phone.slice(1));assert(found.length<=1,'Separate phone/email owners: never reassign');
let user=found[0];
if(user){assert.equal(user.email,email);assert.equal(user.phone,phone.slice(1));assert.equal(user.user_metadata.production_operator_acceptance,true,'Do not change an existing nonfixture account');}
else user=ok(await admin.auth.admin.createUser({email,phone,email_confirm:true,phone_confirm:true,user_metadata:{production_operator_acceptance:true,synthetic:true}})).user;
const appUser=ok(await admin.from('users').select('id').eq('supabase_user_id',user.id).maybeSingle());
if(!appUser)ok(await admin.from('users').insert({supabase_user_id:user.id,email,role:'member',status:'active'}));
const dir=mkdtempSync('.recovery-private/production-operator-auth-'),report={at:new Date().toISOString(),correlation:randomUUID(),fixtureAuthId:user.id,emailRequested:false,smsRequested:false,inboxReceiptConfirmed:false,smsReceiptConfirmed:false,loginVerified:false};
const save=()=>writeFileSync(dir+'/report.json',JSON.stringify(report,null,2),{mode:0o600});save();
try{
  const mail=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:'https://app.illuminotary.com/auth/callback'}});
  report.emailRequested=!mail.error;report.emailError=mail.error?{status:mail.error.status,code:mail.error.code}:null;save();
  const sms=await client.auth.signInWithOtp({phone,options:{shouldCreateUser:false}});
  report.smsRequested=!sms.error;report.smsError=sms.error?{status:sms.error.status,code:sms.error.code}:null;save();
  console.log(JSON.stringify({...report,evidence:dir,phoneSuffix:'0675',otpPrinted:false}));
  if(mail.error||sms.error)process.exitCode=1;
}catch{save();console.error(JSON.stringify({passed:false,evidence:dir,message:'Operator auth attempt stopped; do not resend automatically'}));process.exitCode=1;}

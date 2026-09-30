import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

export const aws = (...args) => {
  try { return JSON.parse(execFileSync('aws', [...args, '--region', 'us-east-1', '--output', 'json'], {encoding:'utf8', stdio:['ignore','pipe','pipe']}) || '{}'); }
  catch(error) {
    const code=String(error.stderr??'').match(/An error occurred \(([^)]+)\)/)?.[1]??'command_failed';
    throw new Error(`AWS ${args[0]} ${args[1]} failed (${code}); provider payload omitted`);
  }
};
export async function pushPreflight() {
  assert.equal(aws('sts','get-caller-identity').Account, '427057633951');
  const stack = aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];
  assert.equal(stack.StackStatus, 'UPDATE_COMPLETE');
  const raw = aws('cloudformation','get-template','--stack-name',stack.StackName).TemplateBody;
  const baseline = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const version = stack.Parameters.find(p => p.ParameterKey === 'SecretVersion').ParameterValue;
  const secret = JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',version).SecretString);
  assert.equal(secret.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
  for (const key of ['APNS_KEY_ID','APNS_TEAM_ID','APNS_PRIVATE_KEY']) assert(secret[key], `Missing ${key}`);
  const require = createRequire(import.meta.url);
  const {createClient} = require('../../backend/node_modules/@supabase/supabase-js');
  const db = createClient(secret.SUPABASE_URL,secret.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const pending = await db.from('notification_jobs').select('id,status,channel',{count:'exact'}).eq('channel','push').in('status',['queued','scheduled','processing','failed','partially_sent']);
  assert(!pending.error, 'Push queue query failed');
  const deliveries = await db.from('notification_deliveries').select('provider,status',{count:'exact'}).eq('channel','push');
  assert(!deliveries.error, 'Push delivery query failed');
  const registrations = await db.from('device_push_tokens').select('environment,permission_status',{count:'exact'}).eq('is_active',true).eq('provider','apns');
  assert(!registrations.error, 'Device registration query failed');
  const users = await db.from('users').select('id').eq('email','lopezb.jl@gmail.com');
  assert(!users.error && users.data.length, 'Operator account not found');
  const devices = await db.from('device_push_tokens').select('id,device_token,last_registered_at')
    .in('user_id',users.data.map(u=>u.id)).eq('is_active',true).eq('environment','production')
    .eq('app_bundle_id','com.illuminote.darci').eq('provider','apns').eq('permission_status','authorized')
    .order('last_registered_at',{ascending:false});
  assert(!devices.error, 'Operator device query failed');
  const grouped = rows => rows.reduce((out,row)=>{const k=Object.values(row).join('/');out[k]=(out[k]??0)+1;return out;},{});
  const report = {at:new Date().toISOString(),pendingPushJobs:pending.count,deliveryCounts:grouped(deliveries.data),deliveryTotal:deliveries.count,
    registrationCounts:grouped(registrations.data),operatorDeviceCount:devices.data.length,
    latestOperatorRegistration:devices.data[0]?.last_registered_at??null,
    flags:Object.fromEntries(['api','worker'].map(s=>[s,baseline.Resources[s+'Task'].Properties.ContainerDefinitions[0].Environment.filter(e=>/APNS|PUSH|OUTBOX_RUNNER/.test(e.Name))]))};
  return {stack,baseline,secret,devices:devices.data,report};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify((await pushPreflight()).report,null,2)); }
  catch (e) { console.error(e instanceof assert.AssertionError ? e.message : 'Production push preflight failed; no changes made'); process.exitCode=1; }
}

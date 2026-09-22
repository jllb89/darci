import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildMonitoringTemplate} from './stack.mjs';

assert(process.argv.includes('--approve-six-dollar-monitoring'), 'Explicit staging monitoring cost approval required');
const aws=args=>JSON.parse(execFileSync('aws',[...args,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})||'{}');
assert.equal(aws(['sts','get-caller-identity']).Account,'427057633951');
const topic='arn:aws:sns:us-east-1:427057633951:darci-recovery-critical';
const attrs=aws(['sns','get-topic-attributes','--topic-arn',topic]).Attributes;
const policy=JSON.parse(attrs.Policy);
assert(policy.Statement.some(s=>s.Principal?.Service==='cloudwatch.amazonaws.com'&&JSON.stringify(s.Condition).includes('alarm:darci-recovery-*')), 'Existing SNS policy must permit only the scoped recovery alarm prefix');
const subs=aws(['sns','list-subscriptions-by-topic','--topic-arn',topic]).Subscriptions;
assert(subs.some(s=>s.Protocol==='email'&&s.Endpoint==='lopezb.jl@gmail.com'&&s.SubscriptionArn!=='PendingConfirmation'));
let previous;
try { previous=aws(['cloudformation','describe-stacks','--stack-name','darci-staging-operational-alerts']).Stacks[0]; }
catch(error) { if(!String(error.stderr).includes('does not exist')) throw error; }
const enabled=process.argv.includes('--enable-watchdog')||previous?.Parameters?.some(p=>p.ParameterKey==='HeartbeatActionsEnabled'&&p.ParameterValue==='true');
if(enabled){
  const stats=aws(['cloudwatch','get-metric-statistics','--namespace','DARCi/Operations/staging','--metric-name','WatchdogHeartbeat','--start-time',new Date(Date.now()-5*60_000).toISOString(),'--end-time',new Date().toISOString(),'--period','60','--statistics','Sum']);
  assert(stats.Datapoints?.filter(p=>p.Sum>0).length>=3,'Need at least three recent genuine deployed watchdog heartbeats before enabling missing-heartbeat actions');
}
const dir=mkdtempSync(join(tmpdir(),'darci-monitoring-'));const file=join(dir,'stack.json');
writeFileSync(file,JSON.stringify(buildMonitoringTemplate(),null,2),{mode:0o600});
aws(['cloudformation','validate-template','--template-body','file://'+file]);
execFileSync('aws',['cloudformation','deploy','--region','us-east-1','--stack-name','darci-staging-operational-alerts','--template-file',file,'--parameter-overrides','CriticalTopicArn='+topic,'HeartbeatActionsEnabled='+enabled,'--tags','CostCenter=darci-monitoring','Environment=staging','--no-fail-on-empty-changeset'],{stdio:'inherit'});
console.log(JSON.stringify({stack:'darci-staging-operational-alerts',customMetrics:8,alarms:8,watchdogActionsEnabled:enabled,source:'infra/monitoring/stack.mjs',note:'Application emitters must be deployed separately; synthetic detector drills are not full application acceptance.'}));

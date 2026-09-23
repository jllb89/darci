import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8'}));
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const t=aws('ecs','describe-services','--cluster','darci-production','--services','darci-production-worker').services[0].taskDefinition;
const r=aws('ecs','run-task','--cluster','darci-production','--task-definition',t,'--launch-type','FARGATE','--count','1','--network-configuration',JSON.stringify({awsvpcConfiguration:{assignPublicIp:'DISABLED',subnets:['subnet-0360e5d7daa53b3ad'],securityGroups:['sg-0b1d6c133a17dd3b2']}}),'--overrides',JSON.stringify({containerOverrides:[{name:'worker',command:['node','-e',readFileSync(new URL('./runtime-smoke.cjs',import.meta.url),'utf8')]}]}),'--tags','key=Environment,value=production','key=Purpose,value=isolated-runtime-smoke');
assert.equal(r.failures.length,0);
console.log(JSON.stringify({tasks:r.tasks.map(t=>t.taskArn)}));

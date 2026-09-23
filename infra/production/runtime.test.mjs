import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRuntime} from './runtime.mjs';
import {readFileSync} from 'node:fs';
test('edge denies by default, restricts approved operator address and uses exact production TLS',()=>{
  const t=buildRuntime({edgeOnly:true});
  assert.equal(t.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode,'403');
  assert.equal(t.Resources.HttpsIngress.Properties.CidrIp.Ref,'OperatorCidr');
  for(const s of ['api','web']) assert(t.Resources[`${s}Route`].Properties.Conditions.some(c=>c.Field==='source-ip'));
  assert.equal(t.Parameters.OperatorCidr.Default,'127.0.0.1/32');
  assert(!Object.values(t.Resources).some(r=>r.Type==='AWS::ECS::Service'));
});
test('all deployed images and secret versions are pinned; runtime cannot access beta or public networks directly',()=>{
  const t=buildRuntime();
  for(const s of ['api','worker','web']) {
    assert(t.Parameters[`${s}Image`].AllowedPattern.includes('@sha256:'));
    const task=t.Resources[`${s}Task`].Properties;
    assert.equal(t.Resources[`${s}Task`].DeletionPolicy,'Retain');
    assert.equal(t.Resources[`${s}Task`].UpdateReplacePolicy,'Retain');
    assert.equal(task.ContainerDefinitions[0].User,'1000');
    assert.equal(task.ContainerDefinitions[0].ReadonlyRootFilesystem,true);
    assert(task.ContainerDefinitions[0].HealthCheck.Command.at(-1).includes("accessSync('/tmp',2)"));
    assert.equal(t.Resources[`${s}Service`].Properties.NetworkConfiguration.AwsvpcConfiguration.AssignPublicIp,'DISABLED');
    assert.deepEqual(t.Resources[`${s}Service`].Properties.DeploymentConfiguration.DeploymentCircuitBreaker,{Enable:true,Rollback:true});
    for(const secret of task.ContainerDefinitions[0].Secrets??[]) assert(secret.ValueFrom['Fn::Sub'].endsWith('::${SecretVersion}'));
  }
  assert(!JSON.stringify(t).includes('/darci/staging/'));
  assert(!t.Resources.TaskRole.Properties.Policies);
});
test('live providers stay closed and readiness checks actual database/Redis/worker dependencies',()=>{
  const t=buildRuntime();
  for(const s of ['api','worker']) {
    const c=t.Resources[`${s}Task`].Properties.ContainerDefinitions[0];
    assert.equal(c.Environment.find(e=>e.Name==='STRIPE_LIVE_MODE_ENABLED').Value,'false');
    assert.equal(c.Environment.find(e=>e.Name==='NOTIFICATION_OUTBOX_RUNNER_ENABLED').Value,'false');
    assert(!c.Secrets.some(e=>/STRIPE|RESEND/.test(e.Name)));
  }
  assert.equal(t.Resources.apiTarget.Properties.HealthCheckPath,'/health/ready');
});
test('non-root ECS scratch mounts retain image ownership and web cache is writable separately',()=>{
  for(const path of ['../../backend/Dockerfile','../../backend/Dockerfile.worker','../../apps/web/Dockerfile']) {
    const text=readFileSync(new URL(path,import.meta.url),'utf8');
    assert(text.includes('VOLUME ["/tmp"'));
    assert(text.includes('chown node:node')); assert(text.includes('chmod 1777 /tmp'));
  }
  const c=buildRuntime().Resources.webTask.Properties.ContainerDefinitions[0];
  assert(c.MountPoints.some(m=>m.ContainerPath==='/app/.next/cache'&&!m.ReadOnly));
});

// Rotate only the approved staging sending credential. No source/image release or emails.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const secretId = '/darci/staging/app';
const services = ['darci-staging-api', 'darci-staging-worker'];
const aws = (...args) => JSON.parse(execFileSync('aws', [...args, '--region', 'us-east-1', '--output', 'json'],
  {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}) || '{}');
const fail = message => { throw new Error(message); };

try {
  if (!process.argv.includes('--apply-approved-rotation')) fail('Explicit rotation flag required');
  if (aws('sts', 'get-caller-identity').Account !== '427057633951') fail('Unexpected AWS account');
  const env = require('../../backend/node_modules/dotenv').parse(readFileSync('.env.staging'));
  const key = env.RESEND_API_KEY?.trim();
  if (!key?.startsWith('re_')) fail('Missing replacement staging sending key');
  const before = aws('secretsmanager', 'get-secret-value', '--secret-id', secretId);
  const values = JSON.parse(before.SecretString);
  if (values.SUPABASE_URL !== 'https://oqferisuloumoojgbjde.supabase.co') fail('Not the expected staging environment');
  const inventory = aws('ecs', 'describe-services', '--cluster', 'darci-staging', '--services', ...services);
  if (inventory.failures?.length || inventory.services.length !== services.length) fail('Missing staging services');
  for (const service of inventory.services) {
    if (service.deployments.length !== 1 || service.deployments[0].rolloutState !== 'COMPLETED') fail('A staging deployment is already active');
    const definition = aws('ecs', 'describe-task-definition', '--task-definition', service.taskDefinition).taskDefinition;
    if (!definition.containerDefinitions.some(c => c.secrets?.some(s => s.name === 'RESEND_API_KEY' && s.valueFrom === `${before.ARN}:RESEND_API_KEY::`))) {
      fail('Unexpected staging credential reference; do not restart with a stale pinned secret');
    }
  }
  if (aws('secretsmanager', 'get-secret-value', '--secret-id', secretId).VersionId !== before.VersionId) fail('Staging secret changed concurrently');
  let version = before.VersionId;
  if (values.RESEND_API_KEY !== key) {
    const merged = {...values, RESEND_API_KEY: key};
    const created = JSON.parse(execFileSync('aws', ['secretsmanager', 'put-secret-value', '--secret-id', secretId,
      '--secret-string', 'file:///dev/stdin', '--region', 'us-east-1', '--output', 'json'],
      {input: JSON.stringify(merged), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']}));
    version = created.VersionId;
    const check = JSON.parse(aws('secretsmanager', 'get-secret-value', '--secret-id', secretId, '--version-id', version).SecretString);
    if (JSON.stringify(check) !== JSON.stringify(merged)) fail('Staging secret readback mismatch');
  }
  console.log(JSON.stringify({environment: 'staging', secretVersion: version, previousSecretVersion: before.VersionId,
    fieldsChanged: values.RESEND_API_KEY === key ? [] : ['RESEND_API_KEY'], productionTouched: false}));
  for (const service of inventory.services) {
    const updated = aws('ecs', 'update-service', '--cluster', 'darci-staging', '--service', service.serviceName, '--force-new-deployment').service;
    if (updated.taskDefinition !== service.taskDefinition) fail('Unexpected image/task-definition change');
    console.log(JSON.stringify({service: service.serviceName, deployment: updated.deployments.find(d => d.status === 'PRIMARY')?.id,
      taskDefinitionUnchanged: true}));
  }
} catch {
  console.error('Staging sending-key rotation stopped. Inspect safe service/secret metadata before retrying; credential diagnostics suppressed.');
  process.exitCode = 1;
}

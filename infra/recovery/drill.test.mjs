import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=name=>readFileSync(new URL('../../backend/scripts/'+name,import.meta.url),'utf8');

test('recovery gateway only proxies fixed internal services',()=>{
  let handler,request;
  const http={createServer:fn=>{handler=fn;return {listen:(port,host)=>{assert.equal(port,8000);assert.equal(host,'0.0.0.0');}};},request:opts=>{request=opts;return {setTimeout(){},on(){}};}};
  vm.runInNewContext(script('recovery-local-gateway.cjs'),{require:name=>{assert.equal(name,'node:http');return http;}});
  let status;const res={writeHead:n=>{status=n;return {end(){}};}};
  handler({url:'https://external.invalid/private',headers:{}},res);assert.equal(status,404);assert.equal(request,undefined);
  handler({url:'/rest/v1/documents?select=id',method:'GET',headers:{host:'external.invalid',apikey:'local-key'},pipe(){}},res);
  assert.equal(request.host,'rest');assert.equal(request.port,3000);assert.equal(request.headers.host,'rest:3000');assert.equal(request.path,'/documents?select=id');assert.equal(request.headers.authorization,'Bearer local-key');
});

test('application recovery is isolated, private, and quarantines every provider runner',()=>{
  const s=script('recovery-application-drill.mjs');
  assert.match(s,/'network', 'create', '--internal'/);
  assert.match(s,/report\.failures\.every\(f => f\.checksumVerified\)/);
  assert.match(s,/options=-csearch_path%3Dauth/);assert.match(s,/GOTRUE_JWT_ISSUER:base\+'\/auth\/v1'/);
  for(const name of ['NOTIFICATION_OUTBOX_RUNNER_ENABLED','STRIPE_WEBHOOK_RUNNER_ENABLED','BILLING_RECONCILIATION_RUNNER_ENABLED','STRIPE_WEBHOOK_RETENTION_RUNNER_ENABLED'])assert(s.includes(name+":'false'"));
  assert.match(s,/DISABLE_REDIS_QUEUES:'true'/);assert.match(s,/mode:0o600/);
  assert(readFileSync(new URL('../../.gitignore',import.meta.url),'utf8').includes('.recovery-private/'));
  assert.doesNotMatch(s,/sk_live_|get-secret-value|sns.*publish|\['127\.0\.0\.1:/);
});

test('resuming a restore rehashes existing bytes against the pinned manifest',()=>{
  const s=script('recovery-snapshot.mjs');
  assert.match(s,/Only read-only restore checks can resume/);assert.match(s,/Resume only a private temporary recovery directory/);
  assert.match(s,/isSymbolicLink/);assert.match(s,/digest\.digest\('hex'\)===item\.sha256/);
  assert.match(s,/--version-id', flags\.version/);assert.match(s,/assert\.equal\(failures\.length, 0/);
  assert.doesNotMatch(s,/@aws-sdk\/client-s3/);
});

test('legacy protection requires the exact frozen 44-row plan and rollback evidence',()=>{
  const s=script('protect-legacy-identity.mjs');
  assert.match(s,/assert\.equal\(rows\.length,44/);assert.match(s,/assert\.deepEqual\(plan,frozen/);
  assert.match(s,/rehearsal\.rolledBack && rehearsal\.protectedTablesUnchanged && rehearsal\.decryptionVerified===44/);
  assert.match(s,/begin isolation level serializable/);assert.match(s,/for update/);
  assert.match(s,/assert\.deepEqual\(await fingerprints\(\),before\)/);
  assert.match(s,/assert\.equal\(decryptIdentityValue\(persisted\.encrypted_value/);
  assert.match(s,/identity\.legacy_protected/);assert.match(s,/operator:'approved_cli_backfill'/);
  assert.doesNotMatch(s,/delete from|truncate |disable trigger|storage\.from|upload\(/i);
});

test('functional recovery tests real authentication, exact bytes, denial and naturally expired worker heartbeat',()=>{
  const s=script('recovery-functional-drill.mjs');
  assert.match(s,/auth\/v1\/verify/);assert.match(s,/assert\.equal\(bytes\.sha256,candidate\.hash\)/);
  assert.match(s,/assert\(missing\.status>=400\)/);assert.match(s,/status===503/);
  assert.match(s,/docker\(\['stop','--time','5',runtime\.name\+'-worker'\]\)/);
  assert.match(s,/assert\.deepEqual\(await queueState\(\),queueBefore\)/);
  assert.doesNotMatch(s,/redis.*(del|set)|set-alarm-state/);
});

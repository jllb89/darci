// Build production bundles without writing or printing credentials. No deployment.
import {execFileSync, spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const aws = (...args) => JSON.parse(execFileSync('aws', [...args, '--region', 'us-east-1', '--output', 'json'], {encoding:'utf8',stdio:['ignore','pipe','inherit']}));
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const tag=process.argv[2];
assert(/^phase2-[a-f0-9]{7}-[a-z0-9-]+$/.test(tag??''),'Explicit unique production tag required');
const output=process.argv[3]; assert(output?.startsWith('/private/tmp/')||output?.startsWith('/tmp/'));
const secret=process.argv.includes('--public-config') ? {SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL,SUPABASE_ANON_KEY:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}
  : JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app').SecretString);
assert.equal(secret.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
const registry='427057633951.dkr.ecr.us-east-1.amazonaws.com';
const token=execFileSync('aws',['ecr','get-login-password','--region','us-east-1'],{encoding:'utf8'});
const login=spawnSync('docker',['login','--username','AWS','--password-stdin',registry],{input:token,stdio:['pipe','inherit','inherit']});
assert.equal(login.status,0);
const publicEnv={NEXT_PUBLIC_API_BASE_URL:'https://api.illuminotary.com',NEXT_PUBLIC_SUPABASE_URL:secret.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:secret.SUPABASE_ANON_KEY,NEXT_PUBLIC_SENTRY_ENVIRONMENT:'production',
  NEXT_PUBLIC_GOOGLE_MAPS_AUTOCOMPLETE_ENABLED:'false'};
const results={tag,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),images:{}};
const runtimeDiff=execFileSync('git',['diff','HEAD','--','backend','apps/web','packages','api','.dockerignore','docs'],{encoding:'utf8'});
results.runtimeTrackedDiffSha256=createHash('sha256').update(runtimeDiff).digest('hex');
results.runtimeTrackedChanges=runtimeDiff.length>0;
if(process.argv.includes('--public-config')) assert.equal(results.runtimeTrackedChanges,false,'Automated releases require clean tracked runtime source');
for(const service of ['api','worker','web']) {
  const dockerfile=service==='web'?'apps/web/Dockerfile':service==='worker'?'backend/Dockerfile.worker':'backend/Dockerfile';
  const uri=`${registry}/darci-production-${service}:${tag}`;
  const args=['buildx','build','--platform','linux/arm64','--provenance=false','--push','--tag',uri,'--file',dockerfile,
    '--label',`org.opencontainers.image.revision=${results.revision}`,'--label',`io.darci.runtime-diff-sha256=${results.runtimeTrackedDiffSha256}`];
  if(service==='web') for(const name of Object.keys(publicEnv)) args.push('--build-arg',name);
  args.push('.');
  console.log(`Building ${service} for production`);
  assert.equal(spawnSync('docker',args,{env:{...process.env,...publicEnv},stdio:'inherit'}).status,0,`${service} build failed`);
  const data=aws('ecr','describe-images','--repository-name',`darci-production-${service}`,'--image-ids',`imageTag=${tag}`);
  results.images[service]=`${registry}/darci-production-${service}@${data.imageDetails[0].imageDigest}`;
  writeFileSync(output,JSON.stringify(results,null,2),{mode:0o600});
}
console.log(JSON.stringify(results,null,2));

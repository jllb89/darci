// Tests the approved shared server key from production's real private egress.
// Does not update a service, browser bundle, Google restrictions or staging.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
const require=createRequire(import.meta.url);
assert(process.argv.includes('--test-approved-shared-key'));
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const dotenv=require('../../backend/node_modules/dotenv');
const local=dotenv.parse(readFileSync('.env.production')),stage=dotenv.parse(readFileSync('.env.staging'));
assert(local.GOOGLE_MAPS_SERVER_API_KEY);assert.equal(local.GOOGLE_MAPS_SERVER_API_KEY,stage.GOOGLE_MAPS_SERVER_API_KEY);
assert.notEqual(local.GOOGLE_MAPS_SERVER_API_KEY,local.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
const current=aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app');const values=JSON.parse(current.SecretString);
assert.equal(values.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');assert.equal(values.STRIPE_LIVE_MODE_ENABLED,'false');
let version=current.VersionId;
if(values.GOOGLE_MAPS_SERVER_API_KEY!==local.GOOGLE_MAPS_SERVER_API_KEY){
  assert(!values.GOOGLE_MAPS_SERVER_API_KEY,'Do not replace a different production server key');
  const r=JSON.parse(execFileSync('aws',['secretsmanager','put-secret-value','--secret-id','/darci/production/app','--secret-string','file:///dev/stdin','--region','us-east-1','--output','json'],
    {input:JSON.stringify({...values,GOOGLE_MAPS_SERVER_API_KEY:local.GOOGLE_MAPS_SERVER_API_KEY}),encoding:'utf8',stdio:['pipe','pipe','pipe']}));version=r.VersionId;
}
const service=aws('ecs','describe-services','--cluster','darci-production','--services','darci-production-api').services[0];
assert.equal(service.deployments.length,1);assert.equal(service.deployments[0].rolloutState,'COMPLETED');
const base=aws('ecs','describe-task-definition','--task-definition',service.taskDefinition).taskDefinition;
const c=structuredClone(base.containerDefinitions[0]);
c.environment=[{name:'NODE_ENV',value:'production'}];
c.secrets=[{name:'GOOGLE_MAPS_SERVER_API_KEY',valueFrom:`${current.ARN}:GOOGLE_MAPS_SERVER_API_KEY::${version}`}];
delete c.healthCheck;delete c.portMappings;c.command=['node','-e',String.raw`
(async()=>{
 const key=process.env.GOOGLE_MAPS_SERVER_API_KEY;const checks=[];
 async function query(path,params){const u=new URL('https://maps.googleapis.com/maps/api/'+path);for(const[k,v]of Object.entries({...params,key}))u.searchParams.set(k,v);const r=await fetch(u,{signal:AbortSignal.timeout(15000)});const p=await r.json();checks.push({path,http:r.status,status:p.status});return p;}
 const geo=await query('geocode/json',{address:'1 Dr Carlton B Goodlett Place, San Francisco, CA',components:'country:US'});
 const auto=await query('place/autocomplete/json',{input:'1 Dr Carlton B Goodlett Pl San Francisco',types:'address',components:'country:us'});
 if(auto.predictions?.[0]?.place_id)await query('place/details/json',{place_id:auto.predictions[0].place_id,fields:'address_component,formatted_address,place_id'});
 if(geo.results?.[0]?.place_id)await query('geocode/json',{place_id:geo.results[0].place_id});
 if(geo.results?.[0]?.geometry?.location){const p=geo.results[0].geometry.location;await query('geocode/json',{latlng:p.lat+','+p.lng});}
 const geocodeChecks=checks.filter(c=>c.path==='geocode/json');
 const supportedGeocodeFallbackPassed=geocodeChecks.length===3&&geocodeChecks.every(c=>c.http===200&&c.status==='OK');
 const legacyPlacesPassed=checks.filter(c=>c.path.startsWith('place/')).length===2&&checks.filter(c=>c.path.startsWith('place/')).every(c=>c.http===200&&c.status==='OK');
 console.log(JSON.stringify({kind:'production-maps-server-preflight',supportedGeocodeFallbackPassed,legacyPlacesPassed,checks,clientDataUsed:false,browserRestrictionsVerified:false}));process.exitCode=supportedGeocodeFallbackPassed?0:1;
})().catch(()=>{console.error('Production Maps probe failed; key and provider payload omitted');process.exitCode=1;});`];
const definition={family:'darci-production-maps-preflight',executionRoleArn:base.executionRoleArn,taskRoleArn:base.taskRoleArn,
  networkMode:base.networkMode,containerDefinitions:[c],volumes:base.volumes,requiresCompatibilities:base.requiresCompatibilities,
  cpu:base.cpu,memory:base.memory,runtimePlatform:base.runtimePlatform,tags:[{key:'Environment',value:'production'},{key:'Purpose',value:'approved-shared-maps-preflight'}]};
const registered=aws('ecs','register-task-definition','--cli-input-json',JSON.stringify(definition)).taskDefinition;
const r=aws('ecs','run-task','--cli-input-json',JSON.stringify({cluster:'darci-production',taskDefinition:registered.taskDefinitionArn,launchType:'FARGATE',count:1,
  networkConfiguration:service.networkConfiguration,startedBy:'approved-maps-preflight',tags:definition.tags}));assert.equal(r.failures.length,0);
const dir=mkdtempSync('.recovery-private/production-maps-preflight-');const report={at:new Date().toISOString(),task:r.tasks[0].taskArn,taskDefinition:registered.taskDefinitionArn,secretVersion:version,serviceUnchanged:service.taskDefinition};
writeFileSync(dir+'/task.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({...report,evidence:dir}));

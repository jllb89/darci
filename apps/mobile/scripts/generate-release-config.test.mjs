import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {renderReleaseConfig,environments} from './generate-release-config.mjs';
const fixture=(name,role='anon')=>({SUPABASE_URL:`https://${environments[name].project}.supabase.co`,SUPABASE_ANON_KEY:'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role,ref:environments[name].project})).toString('base64url')+'.fixture'});
test('production config emits only the intended public fields and keeps telemetry disabled',()=>{
 const result=renderReleaseConfig({...fixture('production'),SUPABASE_SERVICE_ROLE_KEY:'DO_NOT_EMBED',STRIPE_SECRET_KEY:'DO_NOT_EMBED',SENTRY_DSN:'https://secret@telemetry.test/1'},'production');
 assert(result.includes('DARCI_API_BASE_URL = https:/$()/api.illuminotary.com'));
 assert(result.includes('DARCI_SENTRY_DSN = \n'));assert(!result.includes('DO_NOT_EMBED'));assert(!result.includes('staging'));
});
test('wrong project, privileged/mismatched key and multiline values fail closed',()=>{
 assert.throws(()=>renderReleaseConfig(fixture('staging'),'production'));
 assert.throws(()=>renderReleaseConfig(fixture('production','service_role'),'production'));
 assert.throws(()=>renderReleaseConfig({...fixture('production'),SUPABASE_ANON_KEY:fixture('staging').SUPABASE_ANON_KEY},'production'));
 assert.throws(()=>renderReleaseConfig({...fixture('production'),SUPABASE_ANON_KEY:'sb_secret_not_public_value'},'production'));
 assert.throws(()=>renderReleaseConfig({...fixture('production'),SUPABASE_ANON_KEY:'sb_publishable_fake\nDARCI_ENVIRONMENT = staging'},'production'));
});
test('staging keeps a separate output and never acquires production endpoints',()=>{
 assert.notEqual(environments.production.file,environments.staging.file);
 assert(renderReleaseConfig(fixture('staging'),'staging').includes('api.staging.darciregistry.dev'));
});
test('Xcode production preflight rejects mixed or missing settings',()=>{
 const env={...process.env,CONFIGURATION:'Production',DARCI_ENVIRONMENT:'production',DARCI_API_BASE_URL:environments.production.api,DARCI_WEB_BASE_URL:environments.production.web,DARCI_SUPABASE_URL:fixture('production').SUPABASE_URL,DARCI_SUPABASE_ANON_KEY:fixture('production').SUPABASE_ANON_KEY,DARCI_ASSOCIATED_DOMAIN:'app.illuminotary.com',DARCI_SENTRY_DSN:'',APS_ENVIRONMENT:'production'};
 const run=patch=>spawnSync('sh',[fileURLToPath(new URL('./validate-release-environment.sh',import.meta.url))],{env:{...env,...patch}}).status;
 assert.equal(run({}),0);
 for(const patch of [{DARCI_API_BASE_URL:environments.staging.api},{DARCI_SUPABASE_ANON_KEY:''},{DARCI_WEB_BASE_URL:environments.staging.web},{DARCI_SENTRY_DSN:'enabled'}]) assert.notEqual(run(patch),0);
});

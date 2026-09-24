import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
export const environments={
  staging:{api:'https://api.staging.darciregistry.dev',web:'https://app.staging.darciregistry.dev',project:'oqferisuloumoojgbjde',file:'Release.local.xcconfig'},
  production:{api:'https://api.illuminotary.com',web:'https://app.illuminotary.com',project:'jdrgluisxhgegdsesman',file:'Production.local.xcconfig'},
};
export function renderReleaseConfig(env,name){
  const target=environments[name];assert(target,'Choose staging or production explicitly');
  const url=env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;
  const key=env.NEXT_PUBLIC_SUPABASE_ANON_KEY||env.SUPABASE_ANON_KEY;
  assert.equal(url,`https://${target.project}.supabase.co`,'Wrong Supabase project for the selected environment');
  if(env.NEXT_PUBLIC_SUPABASE_URL&&env.SUPABASE_URL) assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_URL,'Conflicting Supabase URLs');
  if(env.NEXT_PUBLIC_SUPABASE_ANON_KEY&&env.SUPABASE_ANON_KEY) assert(env.NEXT_PUBLIC_SUPABASE_ANON_KEY===env.SUPABASE_ANON_KEY,'Conflicting public keys');
  assert(typeof key==='string'&&key.length>20&&!/[\r\n]/.test(key),'Missing/invalid public Supabase key');
  if(key.startsWith('eyJ')){
    let claims;try{claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString())}catch{throw Error('Invalid public-key claims')}
    assert(claims.role==='anon','Only the public anon key belongs in the app');
    assert.equal(claims.ref,target.project,'Public key belongs to a different Supabase project');
  }else assert(key.startsWith('sb_publishable_'),'Never embed a privileged key');
  const values={DARCI_ENVIRONMENT:name,DARCI_API_BASE_URL:target.api,DARCI_WEB_BASE_URL:target.web,DARCI_ASSOCIATED_DOMAIN:new URL(target.web).host,
    DARCI_SUPABASE_URL:url,DARCI_SUPABASE_ANON_KEY:key,DARCI_SENTRY_DSN:name==='production'?'':(env.SENTRY_DSN||''),DARCI_SENTRY_ENVIRONMENT:name};
  return '// Generated public mobile configuration. Do not commit.\n'+Object.entries(values).map(([k,v])=>{
    assert(!/[\r\n]/.test(v),'Multiline config values are forbidden');
    return `${k} = ${v.replaceAll('//','/$()/')}`;
  }).join('\n')+'\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  let name='staging',envPath;
  const args=process.argv.slice(2);
  if(args[0]==='--environment'){name=args[1];envPath=args[2];assert(args.length<=3);}
  else {assert(args.length<=1);envPath=args[0];assert(!envPath?.includes('.env.production'),'Use --environment production for production');}
  assert(environments[name],'Choose staging or production');
  const require=createRequire(import.meta.url),dotenv=require('../../../backend/node_modules/dotenv');
  const values=dotenv.parse(readFileSync(envPath?resolve(envPath):resolve(root,`.env.${name}`)));
  const content=renderReleaseConfig(values,name),output=resolve(root,'apps/mobile/Config',environments[name].file),temp=`${output}.${process.pid}.tmp`;
  try{writeFileSync(temp,content,{flag:'wx',mode:0o600});renameSync(temp,output)}finally{rmSync(temp,{force:true})}
  console.log(`Generated ${name} public mobile configuration: ${output}`);
}

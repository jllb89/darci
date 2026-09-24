import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const archive=resolve(process.argv[2]??''),app=join(archive,'Products/Applications/DARCiMobile.app');
assert(archive.endsWith('.xcarchive')&&existsSync(app),'Pass the exact production .xcarchive');
const run=(c,a,input)=>execFileSync(c,a,{encoding:'utf8',input,stdio:['pipe','pipe','pipe']});
const plist=(input)=>JSON.parse(run('plutil',['-convert','json','-o','-','-'],input));
const info=plist(readFileSync(join(app,'Info.plist')));
assert.equal(info.DARCI_ENVIRONMENT,'production');
assert.equal(info.DARCI_API_BASE_URL,'https://api.illuminotary.com');
assert.equal(info.DARCI_WEB_BASE_URL,'https://app.illuminotary.com');
assert.equal(info.DARCI_SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
assert.equal(info.DARCI_APNS_ENVIRONMENT,'production');assert.equal(info.DARCI_SENTRY_DSN,'');
const key=info.DARCI_SUPABASE_ANON_KEY;assert(typeof key==='string'&&key.length>20);
if(key.startsWith('eyJ')){const c=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));assert(c.role==='anon'&&c.ref==='jdrgluisxhgegdsesman','Wrong or privileged public key')}else assert(key.startsWith('sb_publishable_'));
run('codesign',['--verify','--deep','--strict',app]);
const entitlements=plist(run('codesign',['-d','--entitlements',':-',app]));
assert.equal(entitlements['application-identifier'],'38K3YA2857.com.illuminote.darci');
assert.equal(entitlements['aps-environment'],'production');assert.equal(entitlements['get-task-allow'],false);
assert.deepEqual(entitlements['com.apple.developer.associated-domains'],['applinks:app.illuminotary.com']);
// Provisioning plists include dates/data that plutil cannot encode as JSON.
const profile=JSON.parse(run('/usr/bin/python3',['-c','import sys,plistlib,json; print(json.dumps(plistlib.loads(sys.stdin.buffer.read()),default=str))'],run('security',['cms','-D','-i',join(app,'embedded.mobileprovision')])));
assert(Date.parse(profile.ExpirationDate)>Date.now(),'Provisioning profile expired');
assert.equal(profile.Entitlements['application-identifier'],'38K3YA2857.com.illuminote.darci');
const manifest=plist(readFileSync(join(app,'PrivacyInfo.xcprivacy')));
assert.equal(manifest.NSPrivacyTracking,false);
assert(manifest.NSPrivacyAccessedAPITypes.some(t=>t.NSPrivacyAccessedAPIType==='NSPrivacyAccessedAPICategoryUserDefaults'&&t.NSPrivacyAccessedAPITypeReasons.includes('CA92.1')));
const binary=join(app,info.CFBundleExecutable);
const uuids=p=>[...run('xcrun',['dwarfdump','--uuid',p]).matchAll(/UUID: ([A-F0-9-]+)/g)].map(m=>m[1]).sort();
assert.deepEqual(uuids(binary),uuids(join(archive,'dSYMs/DARCiMobile.app.dSYM')));
assert(uuids(binary).length>0);
const frameworks=existsSync(join(app,'Frameworks'))?readdirSync(join(app,'Frameworks')).filter(p=>p.endsWith('.framework')):[];
for(const framework of frameworks){
 const f=join(app,'Frameworks',framework),p=plist(readFileSync(join(f,'Info.plist')));
 assert.deepEqual(uuids(join(f,p.CFBundleExecutable)),uuids(join(archive,'dSYMs',framework+'.dSYM')),`Missing/mismatched ${framework} symbols`);
}
const report={at:new Date().toISOString(),archive,passed:true,bundleId:info.CFBundleIdentifier,version:info.CFBundleShortVersionString,build:info.CFBundleVersion,
 sdk:info.DTSDKName,api:info.DARCI_API_BASE_URL,web:info.DARCI_WEB_BASE_URL,supabase:info.DARCI_SUPABASE_URL,apns:'production',sentry:'disabled',
 profileName:profile.Name,profileExpires:profile.ExpirationDate,appUuids:uuids(binary),embeddedFrameworks:frameworks,
 executableSha256:createHash('sha256').update(readFileSync(binary)).digest('hex'),distributionSignatureValid:true,uploaded:false};
writeFileSync(join(archive,'production-verification.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report,null,2));

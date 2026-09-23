// Mechanical credential import: never print private-key material or other env values.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {basename,resolve} from 'node:path';
import {createPrivateKey,createPublicKey,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),dotenv=require('../../backend/node_modules/dotenv');
try {
  process.umask(0o077);
  const argument=name=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
  const keyId=argument('--key-id'),source=argument('--key-file');
  assert(/^[A-Z0-9]{10}$/.test(keyId??''),'A Key ID is required');
  assert(source&&basename(source)===`AuthKey_${keyId}.p8`,'Filename must match the supplied Key ID');
  assert.equal(resolve('.env.production'),'/Users/jorge/Desktop/darci/.env.production');
  execFileSync('git',['check-ignore','.env.production'],{stdio:'pipe'});
  assert.equal(execFileSync('git',['ls-files','.env.production'],{encoding:'utf8'}).trim(),'');
  const original=readFileSync('.env.production','utf8'),before=dotenv.parse(original);
  assert.equal(before.APNS_KEY_ID,keyId,'Save the matching public Key ID first');
  assert(/^[A-Z0-9]{10}$/.test(before.APNS_TEAM_ID??''),'Save the Apple Team ID first');
  assert.equal(before.APNS_BUNDLE_ID,'com.illuminote.darci');
  assert.equal(before.APNS_ENVIRONMENT,'production');
  const pem=readFileSync(source,'utf8').trim();
  assert(pem.startsWith('-----BEGIN PRIVATE KEY-----')&&pem.endsWith('-----END PRIVATE KEY-----'),'Expected PKCS#8 PEM');
  const key=createPrivateKey(pem);
  assert.equal(key.asymmetricKeyType,'ec');
  assert.equal(key.asymmetricKeyDetails?.namedCurve,'prime256v1');
  const fingerprint=createHash('sha256').update(createPublicKey(key).export({format:'der',type:'spki'})).digest('hex').slice(0,16);
  if(before.APNS_PRIVATE_KEY?.trim()) {
    assert.equal(before.APNS_PRIVATE_KEY.replace(/\\n/g,'\n').trim(),pem,'Refusing to replace a different private key');
    chmodSync('.env.production',0o600);
    console.log(JSON.stringify({imported:false,alreadyPresent:true,keyId,teamId:before.APNS_TEAM_ID,publicKeyFingerprint:fingerprint}));
  } else {
    const matches=original.match(/^APNS_PRIVATE_KEY=.*$/gm)??[];assert(matches.length<=1,'Duplicate env entry');
    const line=`APNS_PRIVATE_KEY=${JSON.stringify(pem)}`;
    const result=matches.length?original.replace(/^APNS_PRIVATE_KEY=.*$/m,()=>line):original+'\n'+line+'\n';
    const after=dotenv.parse(result);assert.equal(after.APNS_PRIVATE_KEY,pem);
    for(const [k,v] of Object.entries(before))if(k!=='APNS_PRIVATE_KEY')assert.equal(after[k],v,`Unrelated setting ${k} changed`);
    writeFileSync('.env.production',result,{mode:0o600});chmodSync('.env.production',0o600);
    console.log(JSON.stringify({imported:true,keyId,teamId:after.APNS_TEAM_ID,publicKeyFingerprint:fingerprint,
      validP256Key:true,envGitIgnored:true,envPermissions:'0600',deployed:false,appleAuthorizationVerified:false}));
  }
} catch {
  console.error('APNs import stopped: check the file, matching IDs and production env entries. No private-key diagnostics emitted.');
  process.exitCode=1;
}

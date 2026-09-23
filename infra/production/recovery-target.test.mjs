import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recoveryTarget} from '../../backend/scripts/recovery-target.mjs';
import {readFileSync} from 'node:fs';
const production={complete:true,sourceProject:'jdrgluisxhgegdsesman'};
const staging={complete:true,sourceProject:'oqferisuloumoojgbjde'};
const images=['api','worker'].map(role=>`--${role}-image=427057633951.dkr.ecr.us-east-1.amazonaws.com/darci-production-${role}@sha256:${'a'.repeat(64)}`);
test('production cannot accidentally restore beta or mutable/local application code',()=>{
  assert.throws(()=>recoveryTarget(['--environment=production',...images],staging));
  assert.throws(()=>recoveryTarget([],production));
  assert.throws(()=>recoveryTarget(['--environment=production'],production));
  assert.throws(()=>recoveryTarget(['--environment=production',images[0], '--worker-image=darci-api:phase1-19'],production));
  assert.throws(()=>recoveryTarget(['--environment=production',...images],{...production,complete:false}));
});
test('explicit production source uses separate digest-pinned API/worker runtimes',()=>{
  const result=recoveryTarget(['--environment=production',...images],production);
  assert(result.production);
  assert(result.apiImage.includes('production-api@sha256:'));
  assert(result.workerImage.includes('production-worker@sha256:'));
});
test('existing staging restore remains explicitly isolated from production',()=>{
  assert.equal(recoveryTarget([],staging).environment,'staging');
  assert.throws(()=>recoveryTarget(['--environment=other'],staging));
});
test('production restore matches billing namespace without enabling provider runners or mounting local code',()=>{
  const source=readFileSync(new URL('../../backend/scripts/recovery-application-drill.mjs',import.meta.url),'utf8');
  assert(source.includes("APP_ENV:target.production?'production':'recovery'"));
  assert(source.includes("STRIPE_PROVIDER_ENVIRONMENT:target.production?'live':'test'"));
  assert(source.includes("STRIPE_LIVE_MODE_ENABLED:'false',RECOVERY_QUARANTINE:'true'"));
  assert(source.includes('codeMounts=target.production?[]:'));
  assert(source.includes("!target.production && /^20260917"));
});
test('production fixtures remain unsigned drafts and require fresh baseline plus explicit approval',()=>{
  const source=readFileSync(new URL('../../backend/scripts/production-recovery-fixture.mjs',import.meta.url),'utf8');
  assert(source.includes('--approve-production-fixtures'));
  assert(source.includes("assert.equal(r.count,0"));
  assert(source.includes("status:'draft'"));
  assert(source.includes('is_final:false'));
  assert(source.includes('upsert:false'));
  assert(!/\.from\('(signatures|document_hash_records|notarization_requests)'\)\.insert/.test(source));
});

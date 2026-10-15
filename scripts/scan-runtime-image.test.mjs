import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scanRuntimeImage, validateImageReport, scanPolicy} from './scan-runtime-image.mjs';
const imageId = 'sha256:' + 'a'.repeat(64);
const imageRef = '427057633951.dkr.ecr.us-east-1.amazonaws.com/darci-production-api@sha256:' + 'b'.repeat(64);
const report = () => ({SchemaVersion: 2, ArtifactType: 'container_image', Metadata: {ImageID: imageId}, Results: [{Vulnerabilities: []}]});
const options = {imageRef, reportPath: '/tmp/scan.json', archivePath: '/tmp/image.tar'};
test('scans the exact pulled immutable image with no suppressions and binds the report', () => {
  const calls = [];
  const result = scanRuntimeImage({...options, read: report, run: (tool, args) => {
    calls.push([tool, ...args]); return {status: 0, stdout: imageId};
  }});
  assert.equal(result.imageRef, imageRef); assert.equal(result.passed, true);
  assert.deepEqual(calls[2], ['docker', 'save', imageId, '-o', '/tmp/image.tar']);
  assert.deepEqual(calls[3], ['trivy', 'image', '--input', '/tmp/image.tar', ...scanPolicy, '--format', 'json', '--output', '/tmp/scan.json']);
});
test('rejects tags, untrusted repositories and missing image IDs before scanning', () => {
  for (const ref of [imageRef.replace(/@.*/, ':latest'), imageRef.replace('darci-production-api', 'other')]) {
    assert.throws(() => scanRuntimeImage({...options, imageRef: ref, run: () => {throw Error('must not execute');}}));
  }
  assert.throws(() => scanRuntimeImage({...options, run: () => ({status: 0, stdout: ''})}));
});
test('scanner/pull/save failures never produce a passing receipt', () => {
  for (const failureAt of [1, 2, 3, 4]) {
    let calls = 0;
    assert.throws(() => scanRuntimeImage({...options, read: report, run: () => ({status: ++calls === failureAt ? 1 : 0, stdout: imageId})}));
    assert.equal(calls, failureAt);
  }
});
test('rejects stale, malformed, or vulnerable reports even if scanner exits zero', () => {
  for (const invalid of [{}, {...report(), Metadata: {ImageID: 'sha256:' + 'c'.repeat(64)}}, {...report(), Results: [{Vulnerabilities: [{Severity: 'HIGH'}]}]}]) {
    assert.throws(() => validateImageReport(invalid, imageId));
  }
});

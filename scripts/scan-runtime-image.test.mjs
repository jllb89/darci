import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scanRuntimeImage, validateImageReport, scanPolicy} from './scan-runtime-image.mjs';
import {createHash} from 'node:crypto';
const config = JSON.stringify({os: 'linux', architecture: 'arm64'});
const imageId = 'sha256:' + createHash('sha256').update(config).digest('hex');
const imageRef = '427057633951.dkr.ecr.us-east-1.amazonaws.com/darci-production-api@sha256:' + 'b'.repeat(64);
const report = () => ({SchemaVersion: 2, ArtifactType: 'container_image', Metadata: {ImageID: imageId}, Results: [{Vulnerabilities: []}]});
const options = {imageRef, reportPath: '/tmp/scan.json', archivePath: '/tmp/image.tar'};
const stdout = (tool, args) => tool !== 'tar' ? imageId
  : args.at(-1) === 'manifest.json' ? JSON.stringify([{Config: 'blobs/sha256/' + imageId.slice(7)}]) : config;
test('scans the exact pulled immutable image with no suppressions and binds the report', () => {
  const calls = [];
  const result = scanRuntimeImage({...options, read: report, run: (tool, args) => {
    calls.push([tool, ...args]); return {status: 0, stdout: stdout(tool, args)};
  }});
  assert.equal(result.imageRef, imageRef); assert.equal(result.passed, true);
  assert.deepEqual(calls[2], ['docker', 'save', imageId, '-o', '/tmp/image.tar']);
  assert.deepEqual(calls[5], ['trivy', 'image', '--input', '/tmp/image.tar', ...scanPolicy, '--format', 'json', '--output', '/tmp/scan.json']);
});
test('rejects tags, untrusted repositories and missing image IDs before scanning', () => {
  for (const ref of [imageRef.replace(/@.*/, ':latest'), imageRef.replace('darci-production-api', 'other')]) {
    assert.throws(() => scanRuntimeImage({...options, imageRef: ref, run: () => {throw Error('must not execute');}}));
  }
  assert.throws(() => scanRuntimeImage({...options, run: () => ({status: 0, stdout: ''})}));
});
test('scanner/pull/save failures never produce a passing receipt', () => {
  for (const failureAt of [1, 2, 3, 4, 5, 6]) {
    let calls = 0;
    assert.throws(() => scanRuntimeImage({...options, read: report, run: (tool, args) => ({status: ++calls === failureAt ? 1 : 0, stdout: stdout(tool, args)})}));
    assert.equal(calls, failureAt);
  }
});
test('binds reports to verified archive config across classic and OCI Docker stores', () => {
  for (const classic of [true, false]) {
    const result = scanRuntimeImage({...options, read: report, run: (tool, args) => ({status: 0,
      stdout: tool !== 'tar' ? 'sha256:' + 'd'.repeat(64)
        : args.at(-1) === 'manifest.json' ? JSON.stringify([{Config: classic ? imageId.slice(7) + '.json' : 'blobs/sha256/' + imageId.slice(7)}]) : config,
    })});
    assert.equal(result.imageId, imageId);
    assert.notEqual(result.dockerImageId, imageId);
  }
});
test('rejects multiple images, path traversal and tampered configuration', () => {
  for (const manifest of [[], [{Config: '../config'}], [{Config: 'blobs/sha256/' + 'e'.repeat(64)}], [{Config: 'a'}, {Config: 'b'}]]) {
    assert.throws(() => scanRuntimeImage({...options, read: report, run: (tool, args) => ({status: 0,
      stdout: tool === 'tar' && args.at(-1) === 'manifest.json' ? JSON.stringify(manifest) : stdout(tool, args),
    })}));
  }
});
test('rejects stale, malformed, or vulnerable reports even if scanner exits zero', () => {
  for (const invalid of [{}, {...report(), Metadata: {ImageID: 'sha256:' + 'c'.repeat(64)}}, {...report(), Results: [{Vulnerabilities: [{Severity: 'HIGH'}]}]}]) {
    assert.throws(() => validateImageReport(invalid, imageId));
  }
});

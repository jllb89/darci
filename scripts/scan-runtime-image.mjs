// Identical fail-closed OS + application dependency gate for both environments.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

export const scanPolicy = ['--scanners', 'vuln', '--severity', 'HIGH,CRITICAL', '--ignorefile', '/dev/null', '--exit-code', '1'];
const digest = /^sha256:[a-f0-9]{64}$/;
export function validateImageReport(report, imageId) {
  assert.equal(report.SchemaVersion, 2, 'Unsupported or incomplete scanner report');
  assert.equal(report.ArtifactType, 'container_image');
  assert.equal(report.Metadata?.ImageID, imageId, 'Scan does not match the pulled image');
  assert(Array.isArray(report.Results), 'Missing scanner results');
  const findings = report.Results.flatMap(result => result.Vulnerabilities ?? [])
    .filter(finding => ['HIGH', 'CRITICAL'].includes(finding.Severity));
  assert.equal(findings.length, 0, 'Runtime image has HIGH/CRITICAL vulnerabilities');
}

export function scanRuntimeImage({imageRef, reportPath, archivePath, run = (tool, args, capture = false) =>
  spawnSync(tool, args, {encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit'}),
  read = path => JSON.parse(readFileSync(path, 'utf8'))}) {
  assert.match(imageRef, /^427057633951\.dkr\.ecr\.us-east-1\.amazonaws\.com\/darci-(?:production-)?(?:api|worker|web)@sha256:[a-f0-9]{64}$/);
  const checked = (tool, args, capture) => {
    const result = run(tool, args, capture);
    assert.equal(result.status, 0, `${tool} failed; deployment must remain blocked`);
    return result.stdout?.trim();
  };
  checked('docker', ['pull', imageRef]);
  const dockerImageId = checked('docker', ['image', 'inspect', imageRef, '--format', '{{.Id}}'], true);
  assert.match(dockerImageId, digest);
  checked('docker', ['save', dockerImageId, '-o', archivePath]);
  // Classic Docker reports a config ID; the containerd image store may report
  // an OCI index ID instead. Trivy uses the config digest in either case.
  // Read/hash the exact saved configuration rather than dropping ID validation.
  const manifest = JSON.parse(checked('tar', ['-xOf', archivePath, 'manifest.json'], true));
  assert(Array.isArray(manifest) && manifest.length === 1, 'Exactly one runtime image is required');
  const configPath = manifest[0].Config;
  assert.match(configPath, /^(?:blobs\/sha256\/[a-f0-9]{64}|[a-f0-9]{64}\.json)$/);
  const configResult = run('tar', ['-xOf', archivePath, configPath], true);
  assert.equal(configResult.status, 0, 'Cannot read saved image configuration');
  const imageId = 'sha256:' + createHash('sha256').update(configResult.stdout).digest('hex');
  assert.equal(configPath.replace('blobs/sha256/', '').replace(/\.json$/, ''), imageId.slice(7), 'Archive config checksum mismatch');
  const config = JSON.parse(configResult.stdout);
  assert.equal(config.os, 'linux'); assert.equal(config.architecture, 'arm64');
  const scan = run('trivy', ['image', '--input', archivePath, ...scanPolicy, '--format', 'json', '--output', reportPath]);
  if (scan.status !== 0) {
    // JSON artifacts are useful for machines; show the actionable package/fix
    // list in the job log too, without dumping image config or environment.
    try {
      const report = read(reportPath);
      const findings = report.Results.flatMap(result => result.Vulnerabilities ?? [])
        .filter(finding => ['HIGH', 'CRITICAL'].includes(finding.Severity))
        .map(({VulnerabilityID, PkgName, InstalledVersion, FixedVersion, Severity}) =>
          ({id: VulnerabilityID, package: PkgName, installed: InstalledVersion, fixed: FixedVersion, severity: Severity}));
      console.error(JSON.stringify({imageRef, blockingFindings: findings}));
    } catch { /* Missing/malformed scan output still blocks deployment. */ }
    assert.fail('trivy failed; deployment must remain blocked. See scanner report.');
  }
  validateImageReport(read(reportPath), imageId);
  const receipt = {schemaVersion: 1, imageRef, imageId, dockerImageId, reportPath, passed: true, at: new Date().toISOString()};
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [imageRef, reportPath, archivePath] = process.argv.slice(2);
    assert(reportPath && archivePath, 'Image, report and temporary archive paths are required');
    const receipt = scanRuntimeImage({imageRef, reportPath, archivePath});
    writeFileSync(reportPath + '.receipt.json', JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

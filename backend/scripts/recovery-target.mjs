import assert from 'node:assert/strict';

// Explicit source selection; production must use immutable shipped runtimes,
// not a staging image with the operator's current dist mounted over it.
export function recoveryTarget(args, manifest) {
  const flag = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const environment = flag('environment') ?? 'staging';
  assert(['staging', 'production'].includes(environment), 'Unsupported recovery environment');
  const production = environment === 'production';
  assert.equal(manifest.complete, true);
  assert.equal(manifest.sourceProject, production ? 'jdrgluisxhgegdsesman' : 'oqferisuloumoojgbjde', 'Recovery source/environment mismatch');
  const image = role => {
    if (!production) return 'darci-api:phase1-19';
    const value = flag(`${role}-image`);
    assert(new RegExp(`^427057633951\\.dkr\\.ecr\\.us-east-1\\.amazonaws\\.com/darci-production-${role}@sha256:[a-f0-9]{64}$`).test(value ?? ''), 'Production recovery requires exact production image digests');
    return value;
  };
  return {environment, production, apiImage: image('api'), workerImage: image('worker')};
}

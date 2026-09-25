import assert from 'node:assert/strict';
import {isIP} from 'node:net';

// Keep the operator rules intact; small groups avoid ALB condition-value limits.
export function withTesterAccess(baseline, addresses) {
  assert.equal(baseline.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode, '403');
  assert(Array.isArray(addresses) && addresses.length > 0);
  const ips = [...new Set(addresses)].sort();
  assert(ips.length <= 4, 'This reviewed overlay supports up to four exact IPv4 addresses');
  for (const ip of ips) assert(isIP(ip) === 4, 'Use exact IPv4 addresses, not CIDR ranges');
  const next = structuredClone(baseline);
  for (const [index, service] of ['api', 'web'].entries()) {
    const original = baseline.Resources[`${service}Route`];
    assert(original.Properties.Conditions.some(c => c.Field === 'source-ip'));
    for (let offset = 0; offset < ips.length; offset += 2) {
      const id = `${service}TesterRoute${offset / 2 + 1}`;
      const priority = 30 + index * 2 + offset / 2;
      const rule = structuredClone(original);
      rule.Properties.Priority = priority;
      rule.Properties.Conditions = original.Properties.Conditions.filter(c => c.Field !== 'source-ip');
      rule.Properties.Conditions.push({Field: 'source-ip', SourceIpConfig: {Values: ips.slice(offset, offset + 2).map(ip => `${ip}/32`)}});
      if (baseline.Resources[id]) assert.deepEqual(baseline.Resources[id], rule, 'Existing tester access differs; review before changing');
      assert(!Object.entries(baseline.Resources).some(([key, resource]) => key !== id && resource.Type === rule.Type && Number(resource.Properties.Priority) === priority), 'Priority collision');
      next.Resources[id] = rule;
    }
  }
  return next;
}

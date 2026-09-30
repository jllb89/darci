import assert from 'node:assert/strict';
import {isIP} from 'node:net';

// Add new exact addresses without replacing any previous tester/operator rules.
export function withAdditionalTesterAccess(baseline, addresses) {
  assert.equal(baseline.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode, '403');
  assert(Array.isArray(addresses) && addresses.length > 0 && addresses.length <= 20);
  for (const ip of addresses) assert(isIP(ip) === 4, 'Exact IPv4 addresses required');
  const next = structuredClone(baseline);
  for (const service of ['api', 'web']) {
    const original = baseline.Resources[`${service}Route`];
    assert(original.Properties.Conditions.some(c => c.Field === 'source-ip'));
    const granted = new Set(Object.values(baseline.Resources)
      .filter(r => r.Type === original.Type && JSON.stringify(r.Properties.ListenerArn) === JSON.stringify(original.Properties.ListenerArn)
        && JSON.stringify(r.Properties.Actions) === JSON.stringify(original.Properties.Actions)
        && JSON.stringify(r.Properties.Conditions.filter(c => c.Field !== 'source-ip')) === JSON.stringify(original.Properties.Conditions.filter(c => c.Field !== 'source-ip')))
      .flatMap(r => r.Properties.Conditions.find(c => c.Field === 'source-ip')?.SourceIpConfig.Values ?? []));
    for (const ip of [...new Set(addresses)].sort()) {
      if (granted.has(`${ip}/32`)) continue;
      const id = `${service}AdditionalTester${ip.replaceAll('.', 'x')}`;
      assert(!next.Resources[id], 'Existing resource differs; inspect first');
      const occupied = new Set(Object.values(next.Resources).filter(r => r.Type === original.Type).map(r => Number(r.Properties.Priority)));
      let priority = 100;
      while (occupied.has(priority)) priority++;
      assert(priority < 50000);
      const rule = structuredClone(original);
      rule.Properties.Priority = priority;
      rule.Properties.Conditions = rule.Properties.Conditions.filter(c => c.Field !== 'source-ip');
      rule.Properties.Conditions.push({Field:'source-ip',SourceIpConfig:{Values:[`${ip}/32`]}});
      next.Resources[id] = rule;
    }
  }
  return next;
}

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

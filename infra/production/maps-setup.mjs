import assert from 'node:assert/strict';
export function withProductionServerMaps(baseline) {
  const t=structuredClone(baseline),r=t.Resources;
  assert.equal(r.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode,'403');
  assert(r.apiRoute.Properties.Conditions.some(c=>c.Field==='source-ip'));
  const c=r.apiTask.Properties.ContainerDefinitions[0];
  assert.equal(c.Environment.find(e=>e.Name==='STRIPE_LIVE_MODE_ENABLED')?.Value,'false');
  c.Environment=c.Environment.filter(e=>e.Name!=='GOOGLE_MAPS_GEOCODE_USE_SERVER');
  c.Environment.push({Name:'GOOGLE_MAPS_GEOCODE_USE_SERVER',Value:'true'});
  c.Secrets=c.Secrets.filter(s=>s.Name!=='GOOGLE_MAPS_SERVER_API_KEY');
  c.Secrets.push({Name:'GOOGLE_MAPS_SERVER_API_KEY',ValueFrom:{'Fn::Sub':'arn:aws:secretsmanager:us-east-1:427057633951:secret:/darci/production/app-gwMt7d:GOOGLE_MAPS_SERVER_API_KEY::${SecretVersion}'}});
  return t;
}

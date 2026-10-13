import assert from 'node:assert/strict';
export function withAppReviewConfig(baseline) {
  const template=structuredClone(baseline);
  const api=template.Resources.apiTask.Properties.ContainerDefinitions[0];
  assert.equal(api.Name,'api');
  const reference=api.Secrets.find(s=>s.Name==='SUPABASE_SERVICE_ROLE_KEY');
  assert(reference?.ValueFrom?.['Fn::Sub']);
  const value=reference.ValueFrom['Fn::Sub'];
  assert(value.includes(':SUPABASE_SERVICE_ROLE_KEY::'));
  api.Secrets=api.Secrets.filter(s=>s.Name!=='APP_REVIEW_ACCESS_CONFIG');
  api.Secrets.push({Name:'APP_REVIEW_ACCESS_CONFIG',ValueFrom:{'Fn::Sub':value.replace(':SUPABASE_SERVICE_ROLE_KEY::',':APP_REVIEW_ACCESS_CONFIG::')}});
  return template;
}

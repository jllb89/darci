import assert from 'node:assert/strict';
export function withAssociationRoutes(baseline){
  assert.equal(baseline.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode,'403');
  for(const s of ['api','web']) assert(baseline.Resources[`${s}Route`].Properties.Conditions.some(c=>c.Field==='source-ip'));
  assert(!baseline.Resources.AppAssociationRoute,'Association route already configured; inspect instead of recreating');
  assert(!Object.values(baseline.Resources).some(r=>r.Type==='AWS::ElasticLoadBalancingV2::ListenerRule'&&Number(r.Properties.Priority)===8),'Rule priority already used');
  const t=structuredClone(baseline);
  t.Resources.AppAssociationRoute={Type:'AWS::ElasticLoadBalancingV2::ListenerRule',DependsOn:'webService',Properties:{
    ListenerArn:{Ref:'Https'},Priority:8,
    Conditions:[
      {Field:'host-header',HostHeaderConfig:{Values:['app.illuminotary.com']}},
      {Field:'path-pattern',PathPatternConfig:{Values:['/.well-known/apple-app-site-association','/apple-app-site-association']}},
      {Field:'http-request-method',HttpRequestMethodConfig:{Values:['GET']}},
    ],Actions:[{Type:'forward',TargetGroupArn:{Ref:'webTarget'}}],
  }};
  return t;
}

import assert from 'node:assert/strict';

// Public-link approval covers verification only. Keep account/app routes private.
export function withPublicVerificationRoutes(baseline) {
  assert.equal(baseline.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode,'403');
  for(const s of ['api','web']) assert(baseline.Resources[s+'Route'].Properties.Conditions.some(c=>c.Field==='source-ip'));
  const next=structuredClone(baseline);
  const rules=[
    ['PublicVerificationWeb',210,'web','app.illuminotary.com',['/verify/*']],
    ['PublicVerificationApi',211,'api','api.illuminotary.com',['/verify/*']],
    ['PublicVerificationAssets',212,'web','app.illuminotary.com',['/_next/static/*','/icons/navbar/darci_black.svg']],
  ];
  for(const [name,priority,service,host,paths] of rules) {
    assert(!next.Resources[name],'Already configured; inspect instead of replacing');
    assert(!Object.values(next.Resources).some(r=>r.Type==='AWS::ElasticLoadBalancingV2::ListenerRule'&&Number(r.Properties.Priority)===priority),'Priority collision');
    next.Resources[name]={Type:'AWS::ElasticLoadBalancingV2::ListenerRule',DependsOn:service+'Service',Properties:{
      ListenerArn:{Ref:'Https'},Priority:priority,Conditions:[
        {Field:'host-header',HostHeaderConfig:{Values:[host]}},
        {Field:'path-pattern',PathPatternConfig:{Values:paths}},
        {Field:'http-request-method',HttpRequestMethodConfig:{Values:['GET','HEAD']}},
      ],Actions:[{Type:'forward',TargetGroupArn:{Ref:service+'Target'}}]}};
  }
  return next;
}

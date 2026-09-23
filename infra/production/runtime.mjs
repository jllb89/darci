import {pathToFileURL} from 'node:url';
const ref=name=>({Ref:name});
const get=(name,attr)=>({'Fn::GetAtt':[name,attr]});
const sub=value=>({'Fn::Sub':value});
export function buildRuntime({edgeOnly=false}={}) {
  const Parameters={
    OperatorCidr:{Type:'String',Default:'127.0.0.1/32',AllowedPattern:'(?:[0-9]{1,3}\\.){3}[0-9]{1,3}/32',Description:'Private candidate only; one approved operator IPv4, never a public CIDR.'},
  };
  const Resources={
    HttpsIngress:{Type:'AWS::EC2::SecurityGroupIngress',Properties:{GroupId:'sg-0900a4d6e17de09fa',IpProtocol:'tcp',FromPort:443,ToPort:443,CidrIp:ref('OperatorCidr')}},
    HttpIngress:{Type:'AWS::EC2::SecurityGroupIngress',Properties:{GroupId:'sg-0900a4d6e17de09fa',IpProtocol:'tcp',FromPort:80,ToPort:80,CidrIp:ref('OperatorCidr')}},
    LoadBalancer:{Type:'AWS::ElasticLoadBalancingV2::LoadBalancer',Properties:{Name:'darci-production',Type:'application',Scheme:'internet-facing',IpAddressType:'ipv4',
      SecurityGroups:['sg-0900a4d6e17de09fa'],Subnets:['subnet-04a9b1148b69f32fc','subnet-08c12d96d096a1116'],
      LoadBalancerAttributes:[{Key:'routing.http.drop_invalid_header_fields.enabled',Value:'true'},{Key:'routing.http.desync_mitigation_mode',Value:'strictest'}],Tags:[{Key:'Environment',Value:'production'}]}},
    Https:{Type:'AWS::ElasticLoadBalancingV2::Listener',Properties:{LoadBalancerArn:ref('LoadBalancer'),Port:443,Protocol:'HTTPS',SslPolicy:'ELBSecurityPolicy-TLS13-1-2-2021-06',
      Certificates:[{CertificateArn:'arn:aws:acm:us-east-1:427057633951:certificate/c700d210-3e78-4a4f-931e-4bb3e5697d45'}],
      DefaultActions:[{Type:'fixed-response',FixedResponseConfig:{StatusCode:'403',ContentType:'text/plain',MessageBody:'Private production candidate. Access is restricted.'}}]}},
    Http:{Type:'AWS::ElasticLoadBalancingV2::Listener',Properties:{LoadBalancerArn:ref('LoadBalancer'),Port:80,Protocol:'HTTP',
      DefaultActions:[{Type:'redirect',RedirectConfig:{Protocol:'HTTPS',Port:'443',StatusCode:'HTTP_301'}}]}},
  };
  for(const [service,port,path] of [['api',4000,'/health/ready'],['web',3000,'/']]) {
    Resources[`${service}Target`] = {Type:'AWS::ElasticLoadBalancingV2::TargetGroup',Properties:{Name:`darci-production-${service}`,VpcId:'vpc-00c8644fb0efe2db8',TargetType:'ip',Protocol:'HTTP',Port:port,
      HealthCheckPath:path,HealthCheckIntervalSeconds:30,HealthCheckTimeoutSeconds:10,HealthyThresholdCount:2,UnhealthyThresholdCount:3,Matcher:{HttpCode:service==='web'?'200-399':'200'},
      TargetGroupAttributes:[{Key:'deregistration_delay.timeout_seconds',Value:'30'}]}};
    Resources[`${service}Route`] = {Type:'AWS::ElasticLoadBalancingV2::ListenerRule',Properties:{ListenerArn:ref('Https'),Priority:service==='api'?10:20,
      Conditions:[{Field:'host-header',HostHeaderConfig:{Values:[`${service==='web'?'app':'api'}.illuminotary.com`]}},{Field:'source-ip',SourceIpConfig:{Values:[ref('OperatorCidr')]}}],
      Actions:[{Type:'forward',TargetGroupArn:ref(`${service}Target`)}]}};
  }
  if(!edgeOnly) {
    Parameters.SecretVersion={Type:'String',AllowedPattern:'[a-f0-9-]{36}'};
    const trust={Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'ecs-tasks.amazonaws.com'},Action:'sts:AssumeRole',Condition:{StringEquals:{'aws:SourceAccount':'427057633951'},ArnLike:{'aws:SourceArn':'arn:aws:ecs:us-east-1:427057633951:*'}}}]};
    Resources.ExecutionRole={Type:'AWS::IAM::Role',Properties:{RoleName:'darci-production-task-execution',AssumeRolePolicyDocument:trust,Policies:[{PolicyName:'production-images-logs-secret',PolicyDocument:{Version:'2012-10-17',Statement:[
      {Effect:'Allow',Action:['ecr:GetAuthorizationToken'],Resource:'*'},
      {Effect:'Allow',Action:['ecr:BatchCheckLayerAvailability','ecr:GetDownloadUrlForLayer','ecr:BatchGetImage'],Resource:['api','worker','web'].map(s=>`arn:aws:ecr:us-east-1:427057633951:repository/darci-production-${s}`)},
      {Effect:'Allow',Action:['logs:CreateLogStream','logs:PutLogEvents'],Resource:['api','worker','web'].map(s=>`arn:aws:logs:us-east-1:427057633951:log-group:/ecs/darci-production-${s}:*`)},
      {Effect:'Allow',Action:['secretsmanager:GetSecretValue'],Resource:'arn:aws:secretsmanager:us-east-1:427057633951:secret:/darci/production/app-gwMt7d'},
    ]}}]}};
    Resources.TaskRole={Type:'AWS::IAM::Role',Properties:{RoleName:'darci-production-app-task',AssumeRolePolicyDocument:trust}};
    // Provider runners are closed. These are private-candidate settings, not a paid launch.
    const common={APP_ENV:'production',NODE_ENV:'production',LEDGER_ANCHOR_MODE:'hash_only',STRIPE_PROVIDER_ENVIRONMENT:'live',STRIPE_LIVE_MODE_ENABLED:'false',
      IOS_MEMBER_CHECKOUT_ENABLED:'false',STRIPE_WEBHOOK_RUNNER_ENABLED:'false',BILLING_RECONCILIATION_RUNNER_ENABLED:'false',STRIPE_WEBHOOK_RETENTION_RUNNER_ENABLED:'false',
      NOTIFICATION_OUTBOX_RUNNER_ENABLED:'false',OTEL_SDK_DISABLED:'true',SENTRY_ENABLED:'false',BULLMQ_KEY_PREFIX:'{darci-production}:bull',
      WEB_APP_URL:'https://app.illuminotary.com',AUTH_ALLOWED_ORIGINS:'https://app.illuminotary.com,https://api.illuminotary.com',CORS_ALLOWED_ORIGINS:'https://app.illuminotary.com',
      TRUST_PROXY_CIDRS:'10.60.0.0/24,10.60.1.0/24'};
    for(const service of ['api','worker','web']) {
      Parameters[`${service}Image`]={Type:'String',AllowedPattern:`427057633951\\.dkr\\.ecr\\.us-east-1\\.amazonaws\\.com/darci-production-${service}@sha256:[a-f0-9]{64}`};
      const health=service==='worker'?"require('./dist/services/operationalHealthService').checkOperationalReadiness().then(r=>process.exit(r.ready?0:1)).catch(()=>process.exit(1))":
        `fetch('http://127.0.0.1:${service==='api'?4000:3000}/${service==='api'?'health/ready':''}',{signal:AbortSignal.timeout(10000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`;
      const container={Name:service,Image:ref(`${service}Image`),Essential:true,User:'1000',ReadonlyRootFilesystem:true,
        Environment:Object.entries(service==='web'?{NODE_ENV:'production',HOSTNAME:'0.0.0.0',PORT:'3000'}:{...common,SERVICE_NAME:service,PORT:'4000'}).map(([Name,Value])=>({Name,Value})),
        LogConfiguration:{LogDriver:'awslogs',Options:{'awslogs-group':`/ecs/darci-production-${service}`,'awslogs-region':'us-east-1','awslogs-stream-prefix':service}},
        HealthCheck:{Command:['CMD','node','-e',`require('node:fs').accessSync('/tmp',2);${service==='web'?"require('node:fs').accessSync('/app/.next/cache',2);":''}${health}`],Interval:30,Timeout:15,Retries:3,StartPeriod:120},
        MountPoints:[{SourceVolume:'tmp',ContainerPath:'/tmp',ReadOnly:false}],LinuxParameters:{InitProcessEnabled:true},StopTimeout:60};
      if(service!=='worker') container.PortMappings=[{ContainerPort:service==='api'?4000:3000,Protocol:'tcp'}];
      if(service==='web') container.MountPoints.push({SourceVolume:'next-cache',ContainerPath:'/app/.next/cache',ReadOnly:false});
      if(service!=='web') container.Secrets=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','REDIS_URL','IDENTITY_FIELD_ENCRYPTION_KEY','IDENTITY_FIELD_ENCRYPTION_KEY_ID','ABUSE_RATE_KEY_SECRET'].map(Name=>({Name,ValueFrom:sub(`arn:aws:secretsmanager:us-east-1:427057633951:secret:/darci/production/app-gwMt7d:${Name}::`+'${SecretVersion}')}));
      Resources[`${service}Task`]={Type:'AWS::ECS::TaskDefinition',DeletionPolicy:'Retain',UpdateReplacePolicy:'Retain',Properties:{Family:`darci-production-${service}`,Cpu:'256',Memory:'512',NetworkMode:'awsvpc',RequiresCompatibilities:['FARGATE'],
        RuntimePlatform:{CpuArchitecture:'ARM64',OperatingSystemFamily:'LINUX'},ExecutionRoleArn:get('ExecutionRole','Arn'),TaskRoleArn:get('TaskRole','Arn'),Volumes:service==='web'?[{Name:'tmp'},{Name:'next-cache'}]:[{Name:'tmp'}],ContainerDefinitions:[container]}};
      Resources[`${service}Service`]={Type:'AWS::ECS::Service',DependsOn:service==='worker'?['Https']:[`${service}Route`],Properties:{ServiceName:`darci-production-${service}`,Cluster:'darci-production',
        TaskDefinition:ref(`${service}Task`),DesiredCount:service==='worker'?1:2,LaunchType:'FARGATE',PlatformVersion:'1.4.0',EnableECSManagedTags:true,PropagateTags:'SERVICE',
        DeploymentConfiguration:{MinimumHealthyPercent:100,MaximumPercent:200,DeploymentCircuitBreaker:{Enable:true,Rollback:true}},
        NetworkConfiguration:{AwsvpcConfiguration:{AssignPublicIp:'DISABLED',SecurityGroups:['sg-0b1d6c133a17dd3b2'],Subnets:['subnet-0360e5d7daa53b3ad','subnet-0275cac9c927e707e']}},
        Tags:[{Key:'Environment',Value:'production'},{Key:'Project',Value:'darci'}],
        ...(service==='worker'?{}:{HealthCheckGracePeriodSeconds:180,LoadBalancers:[{ContainerName:service,ContainerPort:service==='api'?4000:3000,TargetGroupArn:ref(`${service}Target`)}]})}};
    }
  }
  return {AWSTemplateFormatVersion:'2010-09-09',Description:'Private production candidate. No signup, provider activation or general public access.',Parameters,Resources,
    Outputs:{LoadBalancerDns:{Value:get('LoadBalancer','DNSName')},LoadBalancerArn:{Value:ref('LoadBalancer')}}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(buildRuntime({edgeOnly:process.argv.includes('--edge-only')}),null,2));

import {pathToFileURL} from 'node:url';
export function buildReleaseRoles() {
  const statement=(Action,Resource,extra={})=>({Effect:'Allow',Action,Resource,...extra});
  const prodServices=['api','worker','web'].map(s=>`arn:aws:ecs:us-east-1:427057633951:service/darci-production/darci-production-${s}`);
  const prodTasks=['api','worker','web'].map(s=>`arn:aws:ecs:us-east-1:427057633951:task-definition/darci-production-${s}:*`);
  const ecsRoles=['darci-production-task-execution','darci-production-app-task'].map(n=>`arn:aws:iam::427057633951:role/${n}`);
  const updaterRole='arn:aws:iam::427057633951:role/darci-production-cfn-release';
  const Resources={
    StackReleaseRole:{Type:'AWS::IAM::Role',Properties:{RoleName:'darci-production-cfn-release',AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{
      Effect:'Allow',Principal:{Service:'cloudformation.amazonaws.com'},Action:'sts:AssumeRole',Condition:{StringEquals:{'aws:SourceAccount':'427057633951'}}}]},
      Policies:[{PolicyName:'existing-production-services-only',PolicyDocument:{Version:'2012-10-17',Statement:[
        statement(['ecs:RegisterTaskDefinition'],'*'),
        statement(['ecs:DescribeTaskDefinition','ecs:TagResource','ecs:UntagResource'],prodTasks),
        statement(['ecs:UpdateService','ecs:DescribeServices','ecs:TagResource','ecs:UntagResource'],prodServices),
        statement(['iam:PassRole'],ecsRoles,{Condition:{StringEquals:{'iam:PassedToService':'ecs-tasks.amazonaws.com'}}}),
        statement(['iam:GetRole'],ecsRoles),
        // CloudFormation reads the existing ALB DNSName output even on image-only updates.
        statement(['elasticloadbalancing:DescribeLoadBalancers'],'*'),
      ]}}]}},
    GithubRole:{Type:'AWS::IAM::Role',Properties:{RoleName:'darci-production-github-release',MaxSessionDuration:3600,
      AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Federated:'arn:aws:iam::427057633951:oidc-provider/token.actions.githubusercontent.com'},
        Action:'sts:AssumeRoleWithWebIdentity',Condition:{StringEquals:{'token.actions.githubusercontent.com:aud':'sts.amazonaws.com','token.actions.githubusercontent.com:sub':'repo:jllb89/darci:environment:production'}}}]},
      Policies:[{PolicyName:'production-images-and-existing-stack',PolicyDocument:{Version:'2012-10-17',Statement:[
        statement(['ecr:GetAuthorizationToken'],'*'),
        statement(['ecr:BatchCheckLayerAvailability','ecr:GetDownloadUrlForLayer','ecr:BatchGetImage','ecr:InitiateLayerUpload','ecr:UploadLayerPart','ecr:CompleteLayerUpload','ecr:PutImage','ecr:DescribeImages','ecr:DescribeImageScanFindings'],['api','worker','web'].map(s=>`arn:aws:ecr:us-east-1:427057633951:repository/darci-production-${s}`)),
        statement(['cloudformation:DescribeStacks','cloudformation:DescribeStackEvents','cloudformation:GetTemplate','cloudformation:UpdateStack'],'arn:aws:cloudformation:us-east-1:427057633951:stack/darci-production-runtime/*'),
        statement(['iam:PassRole'],updaterRole,{Condition:{StringEquals:{'iam:PassedToService':'cloudformation.amazonaws.com'}}}),
        statement(['ecs:DescribeServices'],prodServices),
      ]}}]}},
  };
  return {AWSTemplateFormatVersion:'2010-09-09',Description:'Manual production image release only. No DNS, secrets reads, payment activation, IAM editing or beta service access.',Resources};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(buildReleaseRoles(),null,2));

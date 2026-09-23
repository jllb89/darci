import {pathToFileURL} from 'node:url';
export function buildProductionCache() {
  return {AWSTemplateFormatVersion: '2010-09-09', Description: 'Private production-only authenticated Valkey; no staging queue reuse.',
    Parameters: {
      ProductionPrivateSubnets: {Type: 'List<AWS::EC2::Subnet::Id>'},
      CacheSecurityGroup: {Type: 'AWS::EC2::SecurityGroup::Id'},
      ProductionAppSecretArn: {Type: 'String', AllowedPattern: 'arn:aws:secretsmanager:us-east-1:427057633951:secret:/darci/production/app-[A-Za-z0-9]+'},
    }, Resources: {
      AppUser: {Type: 'AWS::ElastiCache::User', Properties: {Engine: 'valkey', UserId: 'darci-production-app', UserName: 'darci',
        AccessString: 'on ~* &* +@all -flushall -flushdb', NoPasswordRequired: false,
        Passwords: [{'Fn::Sub': '{{resolve:secretsmanager:${ProductionAppSecretArn}:SecretString:REDIS_PASSWORD}}'}]}},
      AppUsers: {Type: 'AWS::ElastiCache::UserGroup', Properties: {Engine: 'valkey', UserGroupId: 'darci-production-app', UserIds: [{Ref: 'AppUser'}]}},
      Cache: {Type: 'AWS::ElastiCache::ServerlessCache', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: {
        Engine: 'valkey', MajorEngineVersion: '8', ServerlessCacheName: 'darci-production',
        SubnetIds: {Ref: 'ProductionPrivateSubnets'}, SecurityGroupIds: [{Ref: 'CacheSecurityGroup'}], UserGroupId: {Ref: 'AppUsers'},
        CacheUsageLimits: {DataStorage: {Maximum: 1, Unit: 'GB'}, ECPUPerSecond: {Maximum: 1000}},
        Tags: [{Key: 'Environment', Value: 'production'}, {Key: 'Project', Value: 'darci'}],
      }},
    }, Outputs: {Address: {Value: {'Fn::GetAtt': ['Cache', 'Endpoint.Address']}}, Port: {Value: {'Fn::GetAtt': ['Cache', 'Endpoint.Port']}}},
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(buildProductionCache(), null, 2));

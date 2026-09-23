import {pathToFileURL} from 'node:url';
import {capacityAlarms} from './capacity-monitoring.mjs';
const ref = name => ({Ref: name});
const get = (name, attr) => ({'Fn::GetAtt': [name, attr]});
const sub = value => ({'Fn::Sub': value});
const visibility = MetricName => ({CloudWatchMetricsEnabled: true, SampledRequestsEnabled: false, MetricName});
export function buildEdgeAudit() {
  const trailArn = 'arn:aws:cloudtrail:us-east-1:427057633951:trail/darci-management-audit';
  return {AWSTemplateFormatVersion: '2010-09-09',
    Description: 'Approved production-only WAF and account-wide management audit. No document data events or public application routing.',
    Parameters: {
      ProductionAlbArn: {Type: 'String', AllowedPattern: 'arn:aws:elasticloadbalancing:us-east-1:427057633951:loadbalancer/app/darci-production/[a-f0-9]+'},
      ApiTargetGroupFullName: {Type: 'String', AllowedPattern: 'targetgroup/darci-production-api/[a-f0-9]+'},
      WebTargetGroupFullName: {Type: 'String', AllowedPattern: 'targetgroup/darci-production-web/[a-f0-9]+'},
    },
    Resources: {
      ...capacityAlarms({apiTarget: ref('ApiTargetGroupFullName'), webTarget: ref('WebTargetGroupFullName')}),
      WebAcl: {Type: 'AWS::WAFv2::WebACL', Properties: {Name: 'darci-production-edge', Scope: 'REGIONAL', DefaultAction: {Allow: {}},
        VisibilityConfig: visibility('darci-production-edge'), Tags: [{Key: 'Environment', Value: 'production'}], Rules: [
          {Name: 'RejectUnsafeMethods', Priority: 0, Action: {Block: {}}, VisibilityConfig: visibility('darci-unsafe-methods'),
            Statement: {OrStatement: {Statements: ['TRACE', 'TRACK', 'CONNECT'].map(SearchString => ({ByteMatchStatement: {
              FieldToMatch: {Method: {}}, PositionalConstraint: 'EXACTLY', SearchString, TextTransformations: [{Priority: 0, Type: 'NONE'}]}}))}}},
          {Name: 'PerSourceRateLimit', Priority: 1, Action: {Block: {CustomResponse: {ResponseCode: 429}}}, VisibilityConfig: visibility('darci-source-rate'),
            Statement: {RateBasedStatement: {AggregateKeyType: 'IP', EvaluationWindowSec: 300, Limit: 2000}}},
          // Observe managed heuristics first; signed callbacks and PDF uploads can contain legitimate patterns.
          {Name: 'CommonRulesObserve', Priority: 2, OverrideAction: {Count: {}}, VisibilityConfig: visibility('darci-common-observe'),
            Statement: {ManagedRuleGroupStatement: {VendorName: 'AWS', Name: 'AWSManagedRulesCommonRuleSet'}}},
        ]}},
      Association: {Type: 'AWS::WAFv2::WebACLAssociation', Properties: {ResourceArn: ref('ProductionAlbArn'), WebACLArn: get('WebAcl', 'Arn')}},
      AuditBucket: {Type: 'AWS::S3::Bucket', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: {
        BucketName: 'darci-management-audit-427057633951-us-east-1', VersioningConfiguration: {Status: 'Enabled'},
        BucketEncryption: {ServerSideEncryptionConfiguration: [{ServerSideEncryptionByDefault: {SSEAlgorithm: 'AES256'}}]},
        PublicAccessBlockConfiguration: {BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true},
        OwnershipControls: {Rules: [{ObjectOwnership: 'BucketOwnerEnforced'}]}, Tags: [{Key: 'Environment', Value: 'production'}],
        // No automatic deletion or legal-retention assumption. Cost/retention reviewed separately.
      }},
      AuditPolicy: {Type: 'AWS::S3::BucketPolicy', Properties: {Bucket: ref('AuditBucket'), PolicyDocument: {Version: '2012-10-17', Statement: [
        {Sid: 'TrailAclCheck', Effect: 'Allow', Principal: {Service: 'cloudtrail.amazonaws.com'}, Action: 's3:GetBucketAcl',
          Resource: get('AuditBucket', 'Arn'), Condition: {StringEquals: {'aws:SourceArn': trailArn}}},
        {Sid: 'TrailWriteOnly', Effect: 'Allow', Principal: {Service: 'cloudtrail.amazonaws.com'}, Action: 's3:PutObject',
          Resource: sub('${AuditBucket.Arn}/AWSLogs/427057633951/*'),
          Condition: {StringEquals: {'aws:SourceArn': trailArn, 's3:x-amz-acl': 'bucket-owner-full-control'}}},
        {Sid: 'RequireTls', Effect: 'Deny', Principal: '*', Action: 's3:*', Resource: [get('AuditBucket', 'Arn'), sub('${AuditBucket.Arn}/*')],
          Condition: {Bool: {'aws:SecureTransport': 'false'}}},
      ]}}},
      Trail: {Type: 'AWS::CloudTrail::Trail', DependsOn: 'AuditPolicy', Properties: {
        TrailName: 'darci-management-audit', IsLogging: true, IsMultiRegionTrail: true, IncludeGlobalServiceEvents: true,
        EnableLogFileValidation: true, S3BucketName: ref('AuditBucket'),
        EventSelectors: [{ReadWriteType: 'All', IncludeManagementEvents: true, ExcludeManagementEventSources: ['kms.amazonaws.com', 'rdsdata.amazonaws.com']}],
        Tags: [{Key: 'Environment', Value: 'production'}],
      }},
    }, Outputs: {WebAclArn: {Value: get('WebAcl', 'Arn')}, AuditBucket: {Value: ref('AuditBucket')}, TrailArn: {Value: get('Trail', 'Arn')}}};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(buildEdgeAudit(), null, 2));

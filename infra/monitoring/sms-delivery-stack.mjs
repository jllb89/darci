import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
export function buildSmsDeliveryTemplate(environment='staging') {
  assert(['staging','production'].includes(environment));
  const account='427057633951', region='us-east-1', name=`darci-${environment}-auth-sms`;
  const topic=`arn:aws:sns:${region}:${account}:${name}-events`;
  const log=`arn:aws:logs:${region}:${account}:log-group:/darci/${environment}/auth-sms-delivery`;
  return {AWSTemplateFormatVersion:'2010-09-09', Description:`${environment} SMS receipts; sanitized logs only; no SMS sender or customer messages.`, Resources:{
    Logs:{Type:'AWS::Logs::LogGroup',DeletionPolicy:'Retain',UpdateReplacePolicy:'Retain',Properties:{LogGroupName:`/darci/${environment}/auth-sms-delivery`,RetentionInDays:30}},
    Topic:{Type:'AWS::SNS::Topic',Properties:{TopicName:name+'-events'}},
    TopicPolicy:{Type:'AWS::SNS::TopicPolicy',Properties:{Topics:[{Ref:'Topic'}],PolicyDocument:{Version:'2012-10-17',Statement:[
      {Sid:'RequireTLS',Effect:'Deny',Principal:'*',Action:'sns:Publish',Resource:topic,Condition:{Bool:{'aws:SecureTransport':'false'}}},
      {Sid:'AllowExactSMSConfiguration',Effect:'Allow',Principal:{Service:'sms-voice.amazonaws.com'},Action:'sns:Publish',Resource:topic,Condition:{StringEquals:{'aws:SourceAccount':account},ArnEquals:{'aws:SourceArn':`arn:aws:sms-voice:${region}:${account}:configuration-set/${name}`}}},
    ]}}},
    Role:{Type:'AWS::IAM::Role',Properties:{AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'lambda.amazonaws.com'},Action:'sts:AssumeRole'}]},Policies:[{PolicyName:'write-sanitized-sms-events',PolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['logs:CreateLogStream','logs:PutLogEvents'],Resource:log+':*'}]}}]}},
    Handler:{Type:'AWS::Lambda::Function',DependsOn:'Logs',Properties:{FunctionName:name+'-receipts',Runtime:'nodejs22.x',Handler:'index.handler',Timeout:15,MemorySize:128,
      Role:{'Fn::GetAtt':['Role','Arn']},LoggingConfig:{LogGroup:{Ref:'Logs'}},Environment:{Variables:{EXPECTED_TOPIC_ARN:{Ref:'Topic'},APP_ENV:environment}},Code:{ZipFile:readFileSync(new URL('./sms-delivery-handler.cjs',import.meta.url),'utf8')}}},
    Permission:{Type:'AWS::Lambda::Permission',Properties:{Action:'lambda:InvokeFunction',FunctionName:{Ref:'Handler'},Principal:'sns.amazonaws.com',SourceAccount:account,SourceArn:{Ref:'Topic'}}},
    Subscription:{Type:'AWS::SNS::Subscription',DependsOn:'Permission',Properties:{TopicArn:{Ref:'Topic'},Protocol:'lambda',Endpoint:{'Fn::GetAtt':['Handler','Arn']}}},
    Configuration:{Type:'AWS::SMSVOICE::ConfigurationSet',DependsOn:['TopicPolicy','Subscription'],Properties:{ConfigurationSetName:name,EventDestinations:[{EventDestinationName:'sanitized-delivery-events',Enabled:true,MatchingEventTypes:['TEXT_ALL'],SnsDestination:{TopicArn:{Ref:'Topic'}}}]}},
    HandlerAlarm:{Type:'AWS::CloudWatch::Alarm',Properties:{AlarmName:`darci-recovery-${environment}-sms-receipt-handler`,Namespace:'AWS/Lambda',MetricName:'Errors',Dimensions:[{Name:'FunctionName',Value:{Ref:'Handler'}}],Statistic:'Sum',Period:300,EvaluationPeriods:1,Threshold:1,ComparisonOperator:'GreaterThanOrEqualToThreshold',TreatMissingData:'notBreaching',AlarmActions:[`arn:aws:sns:${region}:${account}:darci-recovery-critical`]}},
    DeliveryAlarm:{Type:'AWS::CloudWatch::Alarm',Properties:{AlarmName:`darci-recovery-${environment}-sms-receipt-routing`,Namespace:'AWS/SNS',MetricName:'NumberOfNotificationsFailed',Dimensions:[{Name:'TopicName',Value:name+'-events'}],Statistic:'Sum',Period:300,EvaluationPeriods:1,Threshold:1,ComparisonOperator:'GreaterThanOrEqualToThreshold',TreatMissingData:'notBreaching',AlarmActions:[`arn:aws:sns:${region}:${account}:darci-recovery-critical`]}},
  },Outputs:{ConfigurationSetName:{Value:{Ref:'Configuration'}},ReceiptLogGroup:{Value:{Ref:'Logs'}}}};
}

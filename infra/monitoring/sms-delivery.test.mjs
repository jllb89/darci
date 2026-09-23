import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildSmsDeliveryTemplate} from './sms-delivery-stack.mjs';
const {sanitize,handler}=createRequire(import.meta.url)('./sms-delivery-handler.cjs');
const event={eventType:'TEXT_DELIVERED',messageStatus:'DELIVERED',messageId:'test-message-123',isFinal:true,eventTimestamp:1790189166000,context:{hookHash:'a'.repeat(32),phoneHash:'b'.repeat(16)}};
test('receipt strips phone, OTP, body, arbitrary context and provider prose',()=>{
  const result=sanitize({...event,destinationPhoneNumber:'+15555550123',messageBody:'code 12345678',messageStatusDescription:'private',context:{...event.context,otp:'12345678',email:'private@example.com'}});
  assert.equal(result.deviceDelivered,true); assert.equal(result.hookHash,event.context.hookHash);
  assert(!JSON.stringify(result).match(/15555550123|12345678|private|messageBody/));
});
test('carrier acceptance is not device delivery',()=>assert.equal(sanitize({...event,messageStatus:'SUCCESSFUL',eventType:'TEXT_SUCCESSFUL'}).deviceDelivered,false));
test('pending, failure and unknown remain truthful',()=>{
  for(const status of ['PENDING','FAILED','UNKNOWN','TTL_EXPIRED','CARRIER_BLOCKED']) assert.equal(sanitize({...event,messageStatus:status}).deviceDelivered,false);
});
test('malformed events and wrong SNS sources fail closed',async()=>{
  assert.throws(()=>sanitize({...event,messageStatus:'secret-message'}));
  await assert.rejects(handler({Records:[{EventSource:'aws:sns',Sns:{TopicArn:'wrong'}}]}));
});
test('stack scopes publisher and subscriber and does not purchase a sender or expose logs',()=>{
  const r=buildSmsDeliveryTemplate().Resources;
  assert.equal(r.Configuration.Properties.EventDestinations[0].MatchingEventTypes[0],'TEXT_ALL');
  assert.equal(r.Logs.Properties.RetentionInDays,30);
  assert.equal(r.Permission.Properties.SourceAccount,'427057633951');
  assert.equal(r.TopicPolicy.Properties.PolicyDocument.Statement[1].Principal.Service,'sms-voice.amazonaws.com');
  assert(!JSON.stringify(r.Role).includes('sns:Publish')); assert(!JSON.stringify(r).includes('AWS::SMSVOICE::PhoneNumber'));
});

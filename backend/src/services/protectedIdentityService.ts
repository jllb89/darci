import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import type {MeetingCheckinRecord,IdentityVerificationEventRecord} from './meetingService';

export type ProtectedIdentityEnvelope={version:1;keyId:string;iv:string;tag:string;ciphertext:string};
function encryptionKey() {
  const raw=process.env.IDENTITY_FIELD_ENCRYPTION_KEY ?? '';
  const key=Buffer.from(raw, 'base64');
  if(key.length!==32 || key.toString('base64')!==raw)throw new Error('Protected identity storage is unavailable: a canonical base64 256-bit encryption key is required');
  return key;
}
export function isProtectedIdentityConfigured() {
  try { encryptionKey(); return /^[A-Za-z0-9_-]{1,64}$/.test(process.env.IDENTITY_FIELD_ENCRYPTION_KEY_ID ?? 'v1'); }
  catch { return false; }
}
export function encryptIdentityValue(value:string,recordId:string,meetingId:string):ProtectedIdentityEnvelope {
  const keyId=process.env.IDENTITY_FIELD_ENCRYPTION_KEY_ID ?? 'v1';
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
  cipher.setAAD(Buffer.from(`darci.identity.v1:${recordId}:${meetingId}:${keyId}`));
  const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return {version:1,keyId,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
// No HTTP read route exposes this primitive. Recovery tooling must authorize and audit access first.
export function decryptIdentityValue(envelope:ProtectedIdentityEnvelope,recordId:string,meetingId:string) {
  if(envelope.version!==1 || envelope.keyId!==(process.env.IDENTITY_FIELD_ENCRYPTION_KEY_ID ?? 'v1'))throw new Error('Identity encryption key version mismatch');
  const cipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(envelope.iv,'base64'));
  cipher.setAAD(Buffer.from(`darci.identity.v1:${recordId}:${meetingId}:${envelope.keyId}`));
  cipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  return Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext,'base64')),cipher.final()]).toString('utf8');
}
export async function recordProtectedIdentity(input:{meetingId:string;participantId:string;actorId:string|null;documentNumber:string|null;event:Record<string,unknown>;identityMetadata:Record<string,unknown>}) {
  const protectedId=randomUUID();
  const protectedValue=input.documentNumber?encryptIdentityValue(input.documentNumber,protectedId,input.meetingId):null;
  const db=createClient(process.env.SUPABASE_URL ?? '',process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',{auth:{persistSession:false}});
  const {data,error}=await db.rpc('record_protected_identity_verification',{
    p_meeting_id:input.meetingId,p_participant_id:input.participantId,p_actor_id:input.actorId,
    p_protected_id:protectedValue?protectedId:null,p_envelope:protectedValue,
    p_event:input.event,p_identity_metadata:input.identityMetadata,
  });
  if(error || !data)throw new Error('Identity verification could not be securely recorded');
  return data as {checkin:MeetingCheckinRecord;verificationEvent:IdentityVerificationEventRecord};
}

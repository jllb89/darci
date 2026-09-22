import {describe,it,expect} from 'vitest';
import {redactSentryEvent,redactTelemetry} from '../../src/telemetry/redaction';
describe('sensitive telemetry boundary',()=>{
  it('removes nested identity values, credentials and signed URL parameters',()=>{
    const result=JSON.stringify(redactSentryEvent({request:{data:'passport contents',headers:{Authorization:'Bearer secret','x-request-id':'r1'},url:'https://api.example.test/invites/public/claim-secret?token=private'},user:{id:'user-id',email:'person@example.test',ip_address:'127.0.0.1'},extra:{identityDocument:{maskedIdentifier:'AB123456'},pdf:'https://example.test/file.pdf?token=signed-url-secret',key:'sk_live_123456'}}));
    for(const secret of ['passport contents','Bearer secret','claim-secret','signed-url-secret','person@example.test','AB123456','sk_live_123456','127.0.0.1'])expect(result).not.toContain(secret);
    expect(result).toContain('r1');expect(result).toContain('user-id');
  });
  it('keeps document/request correlation while removing location and notes',()=>{
    expect(redactTelemetry({documentId:'doc-1',requestId:'r1',latitude:39,notes:'private',documentNumber:'1234'})).toEqual({documentId:'doc-1',requestId:'r1',latitude:'[redacted]',notes:'[redacted]',documentNumber:'[redacted]'});
  });
});

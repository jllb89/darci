import {describe,it,expect,afterEach,vi} from 'vitest';
import {encryptIdentityValue,decryptIdentityValue,isProtectedIdentityConfigured} from '../../src/services/protectedIdentityService';
afterEach(()=>vi.unstubAllEnvs());
describe('protected identity',()=>{
  it('fails readiness for malformed keys and key versions',()=>{
    vi.stubEnv('IDENTITY_FIELD_ENCRYPTION_KEY',Buffer.alloc(32,7).toString('base64'));
    vi.stubEnv('IDENTITY_FIELD_ENCRYPTION_KEY_ID','v1');
    expect(isProtectedIdentityConfigured()).toBe(true);
    vi.stubEnv('IDENTITY_FIELD_ENCRYPTION_KEY',`${Buffer.alloc(32,7).toString('base64')}!`);
    expect(isProtectedIdentityConfigured()).toBe(false);
    vi.stubEnv('IDENTITY_FIELD_ENCRYPTION_KEY',Buffer.alloc(32,7).toString('base64'));
    vi.stubEnv('IDENTITY_FIELD_ENCRYPTION_KEY_ID','bad/key');
    expect(isProtectedIdentityConfigured()).toBe(false);
  });
  it('never falls back to plaintext when the key is missing',()=>{
    vi.stubEnv('IDENTITY_FIELD_ENCRYPTION_KEY','');
    expect(()=>encryptIdentityValue('passport-private','record-1','meeting-1')).toThrow('256-bit');
  });
  it('encrypts with unique nonces and binds ciphertext to the record and meeting',()=>{
    vi.stubEnv('IDENTITY_FIELD_ENCRYPTION_KEY',Buffer.alloc(32,7).toString('base64'));
    const one=encryptIdentityValue('passport-private','record-1','meeting-1');
    const two=encryptIdentityValue('passport-private','record-1','meeting-1');
    expect(one.iv).not.toBe(two.iv);
    expect(JSON.stringify(one)).not.toContain('passport-private');
    expect(decryptIdentityValue(one,'record-1','meeting-1')).toBe('passport-private');
    expect(()=>decryptIdentityValue(one,'record-2','meeting-1')).toThrow();
    expect(()=>decryptIdentityValue(one,'record-1','meeting-2')).toThrow();
    expect(()=>decryptIdentityValue({...one,tag:Buffer.alloc(16).toString('base64')},'record-1','meeting-1')).toThrow();
  });
});

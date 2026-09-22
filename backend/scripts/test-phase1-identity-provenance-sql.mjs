// Real SQL proof, synthetic records, always rolled back in a disposable database.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const { Client } = require('pg');
assert(process.argv.includes('--confirm-isolated'));
const url = new URL(process.env.PHASE1_TEST_DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '54322'); assert.equal(url.pathname, '/postgres');
const db = new Client({ connectionString: url.toString() }); await db.connect();
const ids = Object.fromEntries(['owner','notary','doc','request','meeting','participant','protected','version','artifact','run'].map(k => [k, randomUUID()]));
const sql = (q, p = []) => db.query(q, p);
async function rejects(action, pattern) {
  await sql('savepoint negative_case');
  try { await assert.rejects(action, pattern); } finally { await sql('rollback to savepoint negative_case'); await sql('release savepoint negative_case'); }
}
try {
  await sql('begin');
  for (const id of [ids.owner, ids.notary]) await sql("insert into public.users(id,supabase_user_id,email,status) values($1,$1,$2,'active')", [id, `${id}@example.invalid`]);
  await sql("insert into public.documents(id,owner_id,idn,status,jurisdiction,document_type) values($1,$2,$3,'pending_notary','US-CA','document')", [ids.doc,ids.owner,ids.doc.replaceAll('-','').slice(0,12).toUpperCase()]);
  await sql("insert into public.notarization_requests(id,document_id,assigned_notary_id,status) values($1,$2,$3,'in_review')", [ids.request,ids.doc,ids.notary]);
  await sql("insert into public.meetings(id,request_id,status) values($1,$2,'in_progress')", [ids.meeting,ids.request]);
  await sql("insert into public.meeting_participants(id,meeting_id,user_id,participant_role) values($1,$2,$3,'member')", [ids.participant,ids.meeting,ids.owner]);
  const key=randomBytes(32), iv=randomBytes(12), plaintext='SYNTHETIC-PASSPORT-1234';
  const aad=Buffer.from(`darci.identity.v1:${ids.protected}:${ids.meeting}:test-v1`);
  const cipher=createCipheriv('aes-256-gcm',key,iv); cipher.setAAD(aad);
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  const envelope={version:1,keyId:'test-v1',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
  const metadata={policyVersion:'identity_document_v1',documentType:'passport',documentLabel:'Passport',documentNumberTail:'1234',issuingJurisdiction:'US',documentExpirationDate:'2030-01-01',evidenceArtifactIds:[]};
  const record=(overrides={})=>{
    const p={actor:ids.notary,envelope,metadata,...overrides};
    return sql('select public.record_protected_identity_verification($1,$2,$3,$4,$5,$6,$7) value', [ids.meeting,ids.participant,p.actor,ids.protected,p.envelope,{verificationMethod:'in_person_document',status:'verified',subjectName:'Synthetic Fixture'},p.metadata]);
  };
  for (const role of ['anon','authenticated']) await rejects(async()=>{ await sql(`set local role ${role}`); await record(); }, /permission denied/);
  await rejects(()=>record({actor:ids.owner}),/IDENTITY_ACTOR_OR_SESSION_NOT_ELIGIBLE/);
  await rejects(()=>record({metadata:{...metadata,maskedIdentifier:plaintext}}),/IDENTITY_PLAINTEXT_METADATA_REJECTED/);
  await rejects(()=>record({metadata:{...metadata,nested:{passportNumber:plaintext}}}),/IDENTITY_PLAINTEXT_METADATA_REJECTED/);
  await rejects(()=>record({envelope:{version:1,keyId:'test-v1'}}),/check constraint/);
  await sql(`create function public.phase1_identity_audit_outage() returns trigger language plpgsql as $$
    begin if new.action='identity.securely_recorded' then raise exception 'IDENTITY_AUDIT_OUTAGE'; end if; return new; end $$;
    create trigger phase1_identity_audit_outage before insert on public.audit_events for each row execute function public.phase1_identity_audit_outage()`);
  await rejects(()=>record(),/IDENTITY_AUDIT_OUTAGE/);
  assert.equal((await sql('select count(*)::int n from private.identity_document_values where id=$1',[ids.protected])).rows[0].n,0);
  assert.equal((await sql('select count(*)::int n from public.meeting_checkins where meeting_id=$1',[ids.meeting])).rows[0].n,0);
  await sql('drop trigger phase1_identity_audit_outage on public.audit_events; drop function public.phase1_identity_audit_outage()');
  const result=(await record()).rows[0].value;
  assert(!JSON.stringify(result).includes(plaintext)); assert(!JSON.stringify(result).includes(envelope.ciphertext));
  const protectedRow=(await sql('select * from private.identity_document_values where id=$1',[ids.protected])).rows[0];
  assert.equal(protectedRow.retention_until,null); assert.equal(protectedRow.retention_policy_version,null);
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(protectedRow.encrypted_value.iv,'base64'));
  decipher.setAAD(aad); decipher.setAuthTag(Buffer.from(protectedRow.encrypted_value.tag,'base64'));
  assert.equal(Buffer.concat([decipher.update(Buffer.from(protectedRow.encrypted_value.ciphertext,'base64')),decipher.final()]).toString(),plaintext);
  for (const role of ['anon','authenticated','service_role']) await rejects(async()=>{await sql(`set local role ${role}`); await sql('select * from private.identity_document_values');},/permission denied/);

  const source='# Synthetic exact source\nMéxico — CA/OH\n'; const hash=createHash('sha256').update(source,'utf8').digest('hex');
  await sql("insert into public.template_artifacts(id,template_key,template_version,template_hash,artifact_storage_path,artifact_mime_type,render_engine) values($1,'phase1_synthetic',$2,$3,'fixture.md','text/markdown','other')",[ids.artifact,ids.artifact,hash]);
  await sql("insert into public.document_generation_runs(id,document_id,intake_revision,output_key,document_key,template_key,template_version,template_hash,template_artifact_id) values($1,$2,1,'fixture','fixture','phase1_synthetic','v1','legacy-label',$3)",[ids.run,ids.doc,ids.artifact]);
  await sql("insert into public.document_versions(id,document_id,version,storage_path,file_name,mime_type,size_bytes,generation_run_id) values($1,$2,1,'fixture.pdf','fixture.pdf','application/pdf',100,$3)",[ids.version,ids.doc,ids.run]);
  const provenance=(sha=hash)=>sql('select public.record_document_render_provenance($1,$2,$3,$4,$5,$6,$7)',[ids.run,ids.version,ids.artifact,source,sha,{jurisdiction:'US-CA',fixture:true},'phase1-synthetic-test']);
  await rejects(()=>provenance('b'.repeat(64)),/check constraint/);
  assert.equal((await sql('select template_hash from public.document_generation_runs where id=$1',[ids.run])).rows[0].template_hash,'legacy-label');
  await provenance();
  assert.equal((await sql('select template_hash from public.document_generation_runs where id=$1',[ids.run])).rows[0].template_hash,`sha256:${hash}`);
  assert.equal((await sql('select template_source from private.document_render_provenance where document_version_id=$1',[ids.version])).rows[0].template_source,source);
  await rejects(()=>sql("update private.document_render_provenance set renderer_revision='tamper' where document_version_id=$1",[ids.version]),/IMMUTABLE_EVIDENCE_CANNOT_BE_OVERWRITTEN/);
  await rejects(()=>sql('delete from private.document_render_provenance where document_version_id=$1',[ids.version]),/IMMUTABLE_EVIDENCE_CANNOT_BE_OVERWRITTEN/);
  console.log('PASS: actual protected-identity SQL role/actor/metadata/envelope boundaries, audit failure rollback, encrypted round-trip with bound AAD, no invented retention; exact UTF-8 provenance digest, bad digest rollback and immutable source. All synthetic changes rolled back.');
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {await sql('rollback');await db.end();}

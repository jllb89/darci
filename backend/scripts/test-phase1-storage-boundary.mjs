// Real Storage API checks against the disposable local Supabase instance only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const { PDFDocument } = require('pdf-lib');
assert(process.argv.includes('--confirm-isolated'), 'Disposable instance confirmation required');
const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
assert.equal(config.API_URL, 'http://127.0.0.1:54321');
const dbUrl = new URL(config.DB_URL);
assert.equal(dbUrl.hostname, '127.0.0.1'); assert.equal(dbUrl.port, '54322');
const db = new Client({ connectionString: config.DB_URL });
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
const anon = createClient(config.API_URL, config.ANON_KEY, options);
const digest = data => createHash('sha256').update(data).digest('hex');
await db.connect();
try {
  const fixture = (await db.query("select d.id, u.supabase_user_id, d.owner_id from public.documents d join public.users u on u.id=d.owner_id where d.idn='SQLPHASE1ABC' and u.email like 'phase1-owner-%@example.invalid'")).rows[0];
  assert(fixture, 'Run the isolated SQL fixture first');
  const token = jwt.sign({ sub: fixture.supabase_user_id, role: 'authenticated', aud: 'authenticated' }, config.JWT_SECRET, { expiresIn: '5m' });
  const member = createClient(config.API_URL, config.ANON_KEY, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
  const pdf = await PDFDocument.create(); pdf.addPage().drawText('DARCi isolated storage regression fixture');
  const bytes = Buffer.from(await pdf.save());
  const objectPath = `${fixture.owner_id}/${fixture.id}/phase1-storage-${randomUUID()}.pdf`;
  const upload = await admin.storage.from('documents').upload(objectPath, bytes, { contentType: 'application/pdf', upsert: false });
  assert.equal(upload.error, null);
  for (const client of [anon, member]) {
    assert((await client.storage.from('documents').download(objectPath)).error, 'Direct JWT/anonymous downloads must not bypass the API');
    assert((await client.storage.from('documents').createSignedUrl(objectPath, 60)).error, 'A member must not mint a final-byte URL directly');
    const list = await client.storage.from('documents').list(`${fixture.owner_id}/${fixture.id}`);
    assert(list.error || !list.data?.some(item => item.name === objectPath.split('/').at(-1)), 'Storage listing must not disclose evidence');
    await client.storage.from('documents').remove([objectPath]);
  }
  const retained = await admin.storage.from('documents').download(objectPath);
  assert.equal(retained.error, null); assert.equal(digest(Buffer.from(await retained.data.arrayBuffer())), digest(bytes));
  const signed = await admin.storage.from('documents').createSignedUrl(objectPath, 60);
  assert.equal(signed.error, null);
  const response = await fetch(signed.data.signedUrl);
  assert.equal(response.status, 200); assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(bytes));
  const uploadPath = `${fixture.owner_id}/${fixture.id}/phase1-signed-upload-${randomUUID()}.pdf`;
  const permission = await admin.storage.from('documents').createSignedUploadUrl(uploadPath, { upsert: false });
  assert.equal(permission.error, null);
  const signedUpload = await anon.storage.from('documents').uploadToSignedUrl(uploadPath, permission.data.token, bytes, { contentType: 'application/pdf' });
  assert.equal(signedUpload.error, null, 'API-authorized signed upload must remain compatible');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const privilege of ['SELECT', 'UPDATE', 'DELETE']) {
      assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok', [role, 'private.identity_document_values', privilege])).rows[0].ok, false);
    }
  }
  console.log('PASS: direct anonymous/member evidence download, signing, listing and deletion denied; service-authorized signed download/upload preserved; exact PDF checksum retained; protected identity direct grants denied.');
  console.log('Scope: real local Storage API and SQL roles; this does not replace the application owner/signer/notary/billing-hold authorization matrix. Fixture objects retained locally.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await db.end(); }

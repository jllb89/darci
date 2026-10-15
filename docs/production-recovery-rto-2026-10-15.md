# Production recovery and RTO verification

## Result

**PASS for the current production volume and isolated application recovery.**
The full exercise took **23 minutes 29 seconds**, including cold image pulls,
functional/queue/access acceptance and the additional recovery-key check. The
objective is four hours. Snapshot age at restore start was **10 hours 34 minutes
56 seconds**, within the 24-hour RPO objective. These are measured observations,
not a customer SLA or proof of full-region reprovisioning.

Jorge requested the expanded restore/RTO closeout on 15 October. It downloaded
the production database, exact-version object backups and recovery key read-only,
then reconstructed an isolated local clone. No production document, signature,
account, subscription, infrastructure setting or message was changed. Restored
customer notification and Stripe queues were never replayed.

## Snapshot and exact artifacts

- Source: production project `jdrgluisxhgegdsesman`, AWS account `427057633951`,
  region `us-east-1`; no staging/beta source substitution.
- Snapshot: `2026-10-15T08-00-30.788Z-ac2b636a-3445-492e-a335-d58dab903933`.
- Manifest S3 version: `IIowV_sFqaYPiv4YKarLaXPKGcuUju1l`, complete.
- Snapshot capture window: **08:00:27.638–08:00:52.313 UTC** on 15 October.
- Total backup material: **115,118,217 bytes**, including **109,825,271 object
  bytes**, a **5,292,859-byte database archive** and the protected recovery-key file.
- All **266/266 objects** matched size/SHA-256. All **254 PDFs** passed native
  parser, syntax and all-page read/render checks; zero readability exceptions.
- Actual database restoration passed: **55 documents, 252 versions, 51 hash
  records, 43 Auth users, 266 Storage objects and 3,011 audit events**.
- All **51 completed hash records** match the recovered PDF bytes.
- The three application records without Auth users are **closed-account
  tombstones**. No active application account lacks its Auth mapping.

The production revision was `5b90a27325026f6c1047b69302ad2c20dee5b910`.
The exact deployed images ran without mounting local application code:

- API digest: `sha256:a77a060c64b91eee7022cae800c5eeb08e696f0ccc380a04a3c0b1e9ceb3ac7a`.
- Worker digest: `sha256:be5563af132806d1b9d291642536ab90df60ec8249bdd1c98393d03ef8e448d7`.

## Isolation and functional evidence

The local database, Auth, PostgREST, Storage, gateway, Redis, API and worker were
on one Docker internal-only network, with **zero published ports**. Local service
credentials were newly generated, not hosted passwords. Stripe, Resend, APNs and
SMS keys were absent. Recovery quarantine and disabled provider runners prevented
historical external effects, independent of each restored queue's contents.

Ten functional groups passed:

1. All active application/Auth mappings survive; closed accounts are identified.
2. Every Storage row/version matches the pinned full manifest.
3. Actual reconstructed Storage serves all 266 objects with exact original bytes.
4. Every completed final hash matches its backed-up PDF.
5. Recovered CA/OH owner logins and owner-only version retrieval work; anonymous
   and unrelated callers fail, and direct member Storage URL minting is denied.
6. Released CA/OH public verification returns exact final PDFs and truthful
   hash-only status, with no external-ledger transaction or anchoring claim.
7. The recovered identity key is usable for synthetic encryption/decryption.
8. Missing-object and corrupt-copy faults are detected only in the clone; exact
   bytes are restored and original version/signature/hash/release rows unchanged.
9. Egress attempts to hosted production, Stripe and Resend fail.
10. Stopping only the restored worker naturally expires its heartbeat and changes
    readiness to 503; restart restores 200 without replaying provider queues.

**Key qualification:** the snapshot contains **zero persisted identity
ciphertexts**. The original functional receipt uses a generic protected-record
check label; its recorded count is zero, not successful decryption of real rows.
An additional explicit check proved a synthetic roundtrip, rejection of incorrect
record context, and equality with the local production-configured key, without
printing keys or plaintext. This does not claim a historical real-record
decryption test or live runtime-secret rotation.

Three selective queue groups passed on **new, clone-only synthetic fixtures**:

- Database-driven reconstruction restores missing deliveries; stable IDs dedupe
  retry and other lifecycle states are not blindly requeued.
- The real renderer processes the selected synthetic job once and preserves its
  exact readable version/bytes on duplicate delivery.
- Abrupt exit after Storage upload, before version creation, cannot falsely
  complete/release the document or automatically rerender interrupted work.

The real API/Auth/Storage access matrix made **32 requests in four groups**:
anonymous/unrelated/unassigned denials; owner/bound-signer/operator access and
signer revocation; held-final/direct-Storage/legacy-code denials; controlled release
of the same synthetic final bytes. Temporary clone-only privileged roles were
revoked and sessions signed out. This is not a legal notarial-act or MFA-device test.

## Wall-clock timing

| Milestone | UTC on 15 October | Mexico City |
| --- | --- | --- |
| Restore starts | 18:35:23.652 | 12:35:23 |
| Application booted | 18:54:32.186 | 12:54:32 |
| Functional, queue and access checks complete | 18:57:06.944 | 12:57:06 |
| Additional key/context verification complete | 18:58:52.332 | 12:58:52 |
| Drill containers stopped and private registry login removed | 18:59:24.428 | 12:59:24 |

Application boot: **19m09**. Full functional/queue/access acceptance: **21m43**.
Conservative accepted RTO including key follow-up: **23m29**. The clock was not
reset after downloads, image pulls, checks or debugging. RPO uses the start of
the snapshot capture window, not its later completion time.

## Cleanup and remaining boundaries

Only the eight named drill containers were stopped. The private ECR login was
cleared; unrelated local containers were not stopped/restarted. Restricted backup
and runtime evidence is retained, not committed or shared with testers. No PDF
or source record was deleted or rewritten.

This closes **representative-volume production backup/application recovery and
the measured 24h/4h RPO/RTO acceptance item**. It does not close a regional AWS/
Supabase rebuild, DNS cutover, historical payment/message reconciliation/replay,
provider outage, secret rotation, client handset matrix or App Review. A later
material increase in data/runtime volume requires another rehearsal.

Private receipts: `.recovery-private/readiness-audit-2026-10-15/production-rto-*`
and `.recovery-private/darci-app-recovery-cfb7ce10/` reports. The system-temporary
backup directory is recorded in the private state receipt. These locations contain
restricted data/credentials; only this sanitized report belongs in Git.

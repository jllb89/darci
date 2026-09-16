/** Read-only staging diagnostic. Generates local test derivatives, never uploads
 * them or alters existing signatures, final versions, hashes or ledger records.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import { stampSignatureOnPdf } from "../src/services/documentGenerationRenderService";
import { appendAcknowledgmentPageToPdf, applyFinalizationWatermarkToPdf } from "../src/services/documentFinalizationService";
import { loadPdfForProcessing } from "../src/services/pdfProcessingService";

async function main() {
  const idns = process.argv.slice(2);
  if (!idns.length || idns.some(idn => !/^[A-Z0-9]{12}$/.test(idn))) throw new Error("Supply one or more 12-character IDNs.");
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  for (const idn of idns) {
    const { data: document, error } = await db.from("documents").select("id,status,jurisdiction").eq("idn", idn).single();
    if (error) throw new Error("Document lookup failed");
    const { data: source, error: sourceError } = await db.from("document_versions").select("storage_path").eq("document_id", document.id).eq("version", 1).single();
    if (sourceError || !source.storage_path) throw new Error("Original upload unavailable");
    const download = await db.storage.from("documents").download(source.storage_path);
    if (download.error) throw new Error("Original upload download failed");
    const bytes = Buffer.from(await download.data.arrayBuffer());
    const sourcePages = (await loadPdfForProcessing(bytes)).getPageCount();
    for (const sign of [false, true]) {
      const current = sign ? await stampSignatureOnPdf({
        pdfBytes: bytes,
        placement: { pageNumber: 1, label: "Test signer", includeDate: false, dateRect: null, signatureRect: { x: 72, y: 170, width: 300, height: 44 } },
        signatureRecord: { id: "test", document_id: document.id, generation_run_id: null, document_output_signer_id: null, signer_id: null,
          signature_type: "member", storage_path: null, capture_method: "type", typed_value: "REGRESSION TEST ONLY", typed_kind: "name",
          mime_type: null, size_bytes: null, status: "captured", metadata: {}, captured_at: "2026-09-16T00:00:00Z", created_at: "2026-09-16T00:00:00Z" },
        uploadedNotarizationAddendum: { appendPage: true },
      }) : bytes;
      const acknowledged = await appendAcknowledgmentPageToPdf({ sourcePdfBytes: current, acknowledgmentContent: `REGRESSION TEST ONLY\nJurisdiction: ${document.jurisdiction}\nNot a replacement for the notarized package.` });
      const final = await applyFinalizationWatermarkToPdf({ sourcePdfBytes: acknowledged, watermarkText: "REGRESSION TEST ONLY" });
      const expected = sourcePages + (sign ? 2 : 1);
      if ((await PDFDocument.load(final)).getPageCount() !== expected) throw new Error("Page preservation failed");
      let appleVerified = false;
      if (process.platform === "darwin") {
        const swift = `import PDFKit; import Foundation; let b = FileHandle.standardInput.readDataToEndOfFile(); guard let d = PDFDocument(data:b), !d.isLocked, d.pageCount == ${expected}, (0..<d.pageCount).allSatisfy({ d.page(at:$0) != nil }) else { exit(1) }; print(d.pageCount)`;
        const result = spawnSync("swift", ["-module-cache-path", "/private/tmp/darci-swift-module-cache", "-e", swift], { input: final, timeout: 60_000 });
        if (result.status !== 0) throw new Error("Apple PDFKit validation failed");
        appleVerified = true;
      }
      console.log(JSON.stringify({ idn, status: document.status, jurisdiction: document.jurisdiction,
        sourceHash: createHash("sha256").update(bytes).digest("hex"), sign, sourcePages, outputPages: expected,
        independentRenderVerified: true, appleVerified, remoteWrites: false }));
    }
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Verification failed"); process.exitCode = 1; });

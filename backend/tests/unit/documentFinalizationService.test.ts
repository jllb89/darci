import { PDFDocument as PdfLibDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

import {
  appendAcknowledgmentPageToPdf,
  applyFinalizationWatermarkToPdf,
  renderWatermarkTextTemplate,
  resolvePublicVerificationStatus,
  type PublicVerificationEvidence,
} from "../../src/services/documentFinalizationService";

const createSamplePdf = async () => {
  const pdf = await PdfLibDocument.create();
  pdf.addPage([612, 792]);
  return Buffer.from(await pdf.save());
};

describe("documentFinalizationService", () => {
  it("appends a real acknowledgment page to the PDF", async () => {
    const sourcePdfBytes = await createSamplePdf();

    const transformedPdfBytes = await appendAcknowledgmentPageToPdf({
      sourcePdfBytes,
      acknowledgmentContent: [
        "DARCi Notarial Acknowledgment",
        "Document ID: doc-1",
        "IDN: AB12CD34EF56",
        "Jurisdiction: US-OH",
      ].join("\n"),
    });

    const sourcePdf = await PdfLibDocument.load(sourcePdfBytes);
    const transformedPdf = await PdfLibDocument.load(transformedPdfBytes);

    expect(transformedPdfBytes.equals(sourcePdfBytes)).toBe(false);
    expect(transformedPdf.getPageCount()).toBe(sourcePdf.getPageCount() + 1);
    expect(transformedPdf.getPage(1).getWidth()).toBe(sourcePdf.getPage(0).getWidth());
    expect(transformedPdf.getPage(1).getHeight()).toBe(sourcePdf.getPage(0).getHeight());
  });

  it("applies a digital-original watermark to the finalized PDF bytes", async () => {
    const sourcePdfBytes = await createSamplePdf();

    const transformedPdfBytes = await applyFinalizationWatermarkToPdf({
      sourcePdfBytes,
      watermarkText: "DIGITAL ORIGINAL AB12CD34EF56",
    });

    const sourcePdf = await PdfLibDocument.load(sourcePdfBytes);
    const transformedPdf = await PdfLibDocument.load(transformedPdfBytes);

    expect(transformedPdfBytes.equals(sourcePdfBytes)).toBe(false);
    expect(transformedPdf.getPageCount()).toBe(sourcePdf.getPageCount());
    expect(transformedPdfBytes.byteLength).toBeGreaterThan(sourcePdfBytes.byteLength);
  });

  it("renders watermark text from the persisted template format", () => {
    expect(
      renderWatermarkTextTemplate("DIGITAL ORIGINAL {{ idn }}", "AB12CD34EF56"),
    ).toBe("DIGITAL ORIGINAL AB12CD34EF56");
  });

  it("returns unverified when a ledger row exists but anchoring failed", () => {
    const evidence: PublicVerificationEvidence = {
      hashRecord: {
        id: "hash-1",
        hash: "abc123",
        status: "completed",
      },
      ledgerEntry: {
        id: "ledger-1",
        hash: "abc123",
        ledger_tx_id: null,
        anchored_at: null,
      },
      ledgerAnchorAttempt: {
        document_hash_record_id: "hash-1",
        ledger_entry_id: "ledger-1",
        status: "failed",
      },
    };

    expect(resolvePublicVerificationStatus(evidence)).toBe("unverified");
  });

  it("returns unverified when the anchor-attempt proof row is missing", () => {
    const evidence: PublicVerificationEvidence = {
      hashRecord: {
        id: "hash-1",
        hash: "abc123",
        status: "completed",
      },
      ledgerEntry: {
        id: "ledger-1",
        hash: "abc123",
        ledger_tx_id: "ledger_AB12CD34EF56",
        anchored_at: "2026-04-21T16:00:00.000Z",
      },
      ledgerAnchorAttempt: null,
    };

    expect(resolvePublicVerificationStatus(evidence)).toBe("unverified");
  });

  it("returns verified only when hash, ledger entry, and anchor attempt agree", () => {
    const evidence: PublicVerificationEvidence = {
      hashRecord: {
        id: "hash-1",
        hash: "abc123",
        status: "completed",
      },
      ledgerEntry: {
        id: "ledger-1",
        hash: "abc123",
        ledger_tx_id: "ledger_AB12CD34EF56",
        anchored_at: "2026-04-21T16:00:00.000Z",
      },
      ledgerAnchorAttempt: {
        document_hash_record_id: "hash-1",
        ledger_entry_id: "ledger-1",
        status: "anchored",
      },
    };

    expect(resolvePublicVerificationStatus(evidence)).toBe("verified");
  });
});
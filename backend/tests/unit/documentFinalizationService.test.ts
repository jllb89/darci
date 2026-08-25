import { PDFDocument as PdfLibDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

import {
  appendAcknowledgmentPageToPdf,
  applyFinalizationWatermarkToPdf,
  normalizeAcknowledgmentFamily,
  resolveAcknowledgmentAppendTargetsForVersions,
  renderAcknowledgmentContent,
  renderWatermarkTextTemplate,
  resolvePublicVerificationStatus,
  type PublicVerificationEvidence,
} from "../../src/services/documentFinalizationService";
import {
  ACKNOWLEDGMENT_SEAL_DIAMETER_POINTS,
  renderAcknowledgmentAppendixPdf,
} from "../../src/services/documentGenerationRenderService";

const createSamplePdf = async () => {
  const pdf = await PdfLibDocument.create();
  pdf.addPage([612, 792]);
  return Buffer.from(await pdf.save());
};

const onePixelPngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const baseRenderInput = {
  document: {
    id: "doc-1",
    idn: "AB12CD34EF56",
    jurisdiction: "US-OH",
  },
  venue: {
    state: "OH",
    county: "Franklin",
    city: "Columbus",
    addressLine1: "123 Session Way",
    locationLabel: "DARCi HQ",
    completedAt: "2026-04-22T15:20:00.000Z",
  },
  notaryProfile: {
    notaryName: "Nora Tary",
    jurisdiction: "US-OH",
    serviceAreaKind: "county",
    serviceAreaName: "Franklin County",
    commissionNumber: "OH-12345",
    commissionExpiresAt: "2028-04-22T23:59:59.999Z",
    signatureDataUrl: "data:image/png;base64,aGVsbG8=",
    sealDataUrl: "data:image/png;base64,aGVsbG8=",
  },
  meetingId: "meeting-1",
  identityMethodSummary: "in_person; passport; US",
} as const;

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

  it("embeds provided notary signature and seal images on the acknowledgment page", async () => {
    const sourcePdfBytes = await createSamplePdf();
    const textOnlyPdfBytes = await appendAcknowledgmentPageToPdf({
      sourcePdfBytes,
      acknowledgmentContent: "DARCi Notarial Acknowledgment\nDocument ID: doc-1",
    });

    const stampedPdfBytes = await appendAcknowledgmentPageToPdf({
      sourcePdfBytes,
      acknowledgmentContent: "DARCi Notarial Acknowledgment\nDocument ID: doc-1",
      signatureImageDataUrl: onePixelPngDataUrl,
      sealImageDataUrl: onePixelPngDataUrl,
    });

    const stampedPdf = await PdfLibDocument.load(stampedPdfBytes);

    expect(stampedPdf.getPageCount()).toBe(2);
    expect(stampedPdfBytes.byteLength).toBeGreaterThan(textOnlyPdfBytes.byteLength);
  });

  it("renders the acknowledgment appendix with generated-document chrome", async () => {
    const appendixPdfBytes = await renderAcknowledgmentAppendixPdf({
      pageSize: [612, 792],
      acknowledgmentContent: "ACKNOWLEDGMENT CERTIFICATE\nDocument ID: doc-1\nState of Ohio",
      signatureImage: null,
      sealImage: null,
    });
    const appendixPdf = await PdfLibDocument.load(appendixPdfBytes);
    const rawPdf = appendixPdfBytes.toString("latin1");

    expect(appendixPdf.getPageCount()).toBe(1);
    expect(rawPdf).toContain("Notarial acknowledgment");
    expect(rawPdf).not.toContain("Generated:");
  });

  it("keeps a full California acknowledgment with signature and seal on one page", async () => {
    const acknowledgment = renderAcknowledgmentContent({
      ...baseRenderInput,
      document: {
        ...baseRenderInput.document,
        jurisdiction: "US-CA",
      } as never,
      config: {
        acknowledgmentTemplateId: "us_ca_acknowledgment_v1",
        acknowledgmentTemplateVersion: "2026.04.21.v1",
        watermarkTextTemplate: "DIGITAL ORIGINAL {{idn}}",
      },
      venue: {
        ...baseRenderInput.venue,
        state: "CA",
        county: "Los Angeles",
        addressLine1: "12345 Acknowledgment Verification Boulevard, Suite 1200",
      },
      notaryProfile: {
        ...baseRenderInput.notaryProfile,
        jurisdiction: "US-CA",
        serviceAreaName: "Los Angeles County",
        commissionNumber: "CA-12345",
      },
      documentFamily: "poa_general",
      acknowledgerNames: [
        "Alexandra Catherine Montgomery-Worthington",
        "Benjamin Theodore Montgomery-Worthington",
      ],
    });

    const appendixPdfBytes = await renderAcknowledgmentAppendixPdf({
      pageSize: [612, 792],
      acknowledgmentContent: acknowledgment.content,
      signatureImage: {
        bytes: Buffer.from(onePixelPngDataUrl.split(",")[1], "base64"),
        format: "png",
      },
      sealImage: {
        bytes: Buffer.from(onePixelPngDataUrl.split(",")[1], "base64"),
        format: "png",
      },
    });
    const appendixPdf = await PdfLibDocument.load(appendixPdfBytes);

    expect(appendixPdf.getPageCount()).toBe(1);
  });

  it("uses a two-inch notarial seal render box", () => {
    expect(ACKNOWLEDGMENT_SEAL_DIAMETER_POINTS).toBe(144);
  });

  it("rejects unsupported notary signature image formats instead of silently skipping them", async () => {
    const sourcePdfBytes = await createSamplePdf();

    await expect(
      appendAcknowledgmentPageToPdf({
        sourcePdfBytes,
        acknowledgmentContent: "DARCi Notarial Acknowledgment\nDocument ID: doc-1",
        signatureImageDataUrl: "data:image/webp;base64,AAAA",
        sealImageDataUrl: onePixelPngDataUrl,
      }),
    ).rejects.toThrow("Notary signature image must be a PNG or JPEG data URL");
  });

  it("renders California acknowledgment content without internal boilerplate", () => {
    const rendered = renderAcknowledgmentContent({
      ...baseRenderInput,
      document: {
        ...baseRenderInput.document,
        jurisdiction: "US-CA",
      } as never,
      config: {
        acknowledgmentTemplateId: "us_ca_acknowledgment_v1",
        acknowledgmentTemplateVersion: "2026.04.21.v1",
        watermarkTextTemplate: "DIGITAL ORIGINAL {{idn}}",
      },
      venue: {
        ...baseRenderInput.venue,
        state: "CA",
        county: "Los Angeles",
      },
      notaryProfile: {
        ...baseRenderInput.notaryProfile,
        jurisdiction: "US-CA",
        serviceAreaName: "Los Angeles County",
        commissionNumber: "CA-12345",
      },
      documentFamily: "trust_certificate",
      acknowledgerNames: ["Taylor Trustee", "Riley Trustee"],
    });

    expect(rendered.rendererKey).toBe("us_ca_acknowledgment_v1");
    expect(rendered.documentFamily).toBe("trust_certificate");
    expect(rendered.content).toContain("State of California");
    expect(rendered.content).toContain("County of Los Angeles");
    expect(rendered.content).toContain("Taylor Trustee, Riley Trustee");
    expect(rendered.content).toContain("I certify under penalty of perjury under the laws of the State of California");
    expect(rendered.content).toContain("Commission number: CA-12345");
    expect(rendered.content).toContain("Commission expires: April 22, 2028");
    expect(rendered.content).not.toContain("2028-04-22T23:59:59.999Z");
    expect(rendered.content).not.toContain("Template:");
    expect(rendered.content).not.toContain("Signer consent required.");
    expect(rendered.content).not.toContain("Venue confirmation required.");
  });

  it("renders Ohio acknowledgment content with venue and commission details", () => {
    const rendered = renderAcknowledgmentContent({
      ...baseRenderInput,
      document: baseRenderInput.document as never,
      config: {
        acknowledgmentTemplateId: "us_oh_acknowledgment_v1",
        acknowledgmentTemplateVersion: "2026.04.21.v1",
        watermarkTextTemplate: "DIGITAL ORIGINAL {{idn}}",
      },
      documentFamily: "poa_general",
      acknowledgerNames: ["Pat Principal"],
    });

    expect(rendered.rendererKey).toBe("us_oh_acknowledgment_v1");
    expect(rendered.documentFamily).toBe("poa_general");
    expect(rendered.content).toContain("ACKNOWLEDGMENT CERTIFICATE");
    expect(rendered.content).toContain("State of Ohio");
    expect(rendered.content).toContain("County of Franklin");
    expect(rendered.content).toContain("The foregoing instrument was acknowledged before me on this April 22, 2026 by Pat Principal.");
    expect(rendered.content).toContain("Commission number: OH-12345");
    expect(rendered.content).toContain("My commission expires: April 22, 2028");
    expect(rendered.content).not.toContain("2028-04-22T23:59:59.999Z");
    expect(rendered.venue.formattedVenue).toContain("Franklin County");
    expect(rendered.content).not.toContain("Template:");
    expect(rendered.content).not.toContain("Signer consent required.");
    expect(rendered.content).not.toContain("Venue confirmation required.");
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

  it("normalizes product-flow and uploaded-document keys for acknowledgment append", () => {
    expect(normalizeAcknowledgmentFamily("rrr")).toBe("trust_rrr");
    expect(normalizeAcknowledgmentFamily("DARCi Trust Certification")).toBe("trust_certificate");
    expect(normalizeAcknowledgmentFamily("uploaded_document")).toBe("poa_general");
    expect(normalizeAcknowledgmentFamily("notarize_document")).toBe("poa_general");
  });

  it("selects every latest generated Trust output for acknowledgment append", () => {
    const document = {
      id: "doc-trust-1",
      output_bundle: [
        { outputKey: "trust_certificate", documentKey: "trust_certificate" },
        { outputKey: "trust_rrr", documentKey: "trust_rrr" },
      ],
      document_type: "trust_bundle",
      product_flow_mode: "trust_bundle",
      selected_families: ["trust"],
    } as never;
    const versions = [
      {
        id: "version-rrr-old",
        document_id: "doc-trust-1",
        version: 1,
        storage_path: "owner/doc/generated/run-rrr-old/trust_rrr.pdf",
        file_name: "trust_rrr.pdf",
        mime_type: "application/pdf",
        size_bytes: 1000,
        is_final: false,
        generation_run_id: "run-rrr-old",
        created_by: "owner-1",
        created_at: "2026-04-22T15:00:00.000Z",
      },
      {
        id: "version-cert",
        document_id: "doc-trust-1",
        version: 2,
        storage_path: "owner/doc/generated/run-cert/trust_certificate.pdf",
        file_name: "trust_certificate.pdf",
        mime_type: "application/pdf",
        size_bytes: 1100,
        is_final: false,
        generation_run_id: "run-cert",
        created_by: "owner-1",
        created_at: "2026-04-22T15:01:00.000Z",
      },
      {
        id: "version-rrr-signed",
        document_id: "doc-trust-1",
        version: 3,
        storage_path: "owner/doc/generated/run-rrr/trust_rrr-signed.pdf",
        file_name: "trust_rrr-signed.pdf",
        mime_type: "application/pdf",
        size_bytes: 1200,
        is_final: false,
        generation_run_id: "run-rrr",
        created_by: "owner-1",
        created_at: "2026-04-22T15:02:00.000Z",
      },
    ];
    const generationRunsById = new Map([
      [
        "run-rrr-old",
        {
          id: "run-rrr-old",
          output_key: "trust_rrr",
          document_key: "trust_rrr",
          template_key: "oh_trust_rrr",
        },
      ],
      [
        "run-cert",
        {
          id: "run-cert",
          output_key: "trust_certificate",
          document_key: "trust_certificate",
          template_key: "oh_trust_certificate",
        },
      ],
      [
        "run-rrr",
        {
          id: "run-rrr",
          output_key: "trust_rrr",
          document_key: "trust_rrr",
          template_key: "oh_trust_rrr",
        },
      ],
    ]) as never;

    const targets = resolveAcknowledgmentAppendTargetsForVersions({
      document,
      versions: versions as never,
      generationRunsById,
    });

    expect(targets.map((target) => target.family)).toEqual([
      "trust_certificate",
      "trust_rrr",
    ]);
    expect(targets.map((target) => target.sourceVersion.id)).toEqual([
      "version-cert",
      "version-rrr-signed",
    ]);
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

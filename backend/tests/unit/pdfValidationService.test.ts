import {
  PDFDocument as PdfLibDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
} from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  PdfReviewValidationError,
  validatePdfForReview,
} from "../../src/services/pdfValidationService";

describe("pdfValidationService", () => {
  it("accepts a readable PDF with usable pages", async () => {
    const document = await PdfLibDocument.create();
    document.addPage([612, 792]);

    await expect(validatePdfForReview(await document.save())).resolves.toEqual({
      pageCount: 1,
      isEncrypted: false,
    });
  });

  it("accepts a structurally readable owner-restricted PDF", async () => {
    const document = await PdfLibDocument.create();
    document.addPage([612, 792]);
    const encryptionDictionary = document.context.obj({
      Filter: PDFName.of("Standard"),
      V: PDFNumber.of(1),
      R: PDFNumber.of(2),
      Length: PDFNumber.of(40),
      O: PDFHexString.of("00000000000000000000000000000000"),
      U: PDFHexString.of("00000000000000000000000000000000"),
      P: PDFNumber.of(-4),
    });
    document.context.trailerInfo.Encrypt = document.context.register(encryptionDictionary);

    await expect(
      validatePdfForReview(await document.save({ useObjectStreams: false })),
    ).resolves.toEqual({
      pageCount: 1,
      isEncrypted: true,
    });
  });

  it("rejects malformed bytes with a PDF header", async () => {
    await expect(
      validatePdfForReview(Buffer.from("%PDF-1.7\nmalformed")),
    ).rejects.toBeInstanceOf(PdfReviewValidationError);
  });

  it("rejects PDFs with unusable page dimensions", async () => {
    const document = await PdfLibDocument.create();
    document.addPage([0, 792]);

    await expect(validatePdfForReview(await document.save())).rejects.toThrow(
      "invalid dimensions",
    );
  });
});
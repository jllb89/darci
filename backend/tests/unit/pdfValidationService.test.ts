import {
  PDFDocument as PdfLibDocument,
} from "pdf-lib";
import { describe, expect, it } from "vitest";
import { protectPdf } from "../helpers/protectedPdf";
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
    await expect(
      validatePdfForReview(await protectPdf(await document.save())),
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
      "could not be safely processed",
    );
  });
  it("rejects a PDF requiring a user password before review", async () => {
    const document = await PdfLibDocument.create();
    document.addPage([612, 792]);
    await expect(validatePdfForReview(await protectPdf(await document.save(), "secret")))
      .rejects.toThrow("requires a password");
  });
});

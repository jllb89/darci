import { PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { loadPdfForProcessing, saveValidatedPdf, validateRenderedPdf } from "../../src/services/pdfProcessingService";
import { protectPdf } from "../helpers/protectedPdf";

describe("PDF processing regression", () => {
  it("rejects the previous encryption-bypass output before it can be released", async () => {
    const original = await PDFDocument.create();
    original.addPage([612, 792]).drawText("Original content must survive");
    const encrypted = await protectPdf(await original.save());
    const unsafe = await PDFDocument.load(encrypted, { ignoreEncryption: true });
    unsafe.addPage();
    await expect(validateRenderedPdf(await unsafe.save(), 2)).rejects.toThrow();
    const normalized = await loadPdfForProcessing(encrypted);
    normalized.addPage();
    const safe = await saveValidatedPdf(normalized);
    expect((await PDFDocument.load(safe)).getPageCount()).toBe(2);
  });
  it("rejects a mismatch in the independently parsed page count", async () => {
    const pdf = await PDFDocument.create(); pdf.addPage();
    await expect(validateRenderedPdf(await pdf.save(), 2)).rejects.toThrow();
  });
  it("rejects malformed page content even if the renderer recovers with exit code zero", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    page.node.set(PDFName.of("Contents"), pdf.context.register(pdf.context.stream("DARCI_INVALID_OPERATOR")));
    await expect(saveValidatedPdf(pdf)).rejects.toThrow();
  });
});

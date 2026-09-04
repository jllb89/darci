import { PDFDocument as PdfLibDocument } from "pdf-lib";

export type PdfReviewValidationResult = {
  pageCount: number;
  isEncrypted: boolean;
};

export class PdfReviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfReviewValidationError";
  }
}

const isEncryptedPdfError = (error: unknown) => {
  return error instanceof Error && (
    error.name === "EncryptedPDFError" ||
    error.message.toLowerCase().includes("encrypted")
  );
};

const assertUsablePages = (document: PdfLibDocument) => {
  const pages = document.getPages();
  if (pages.length === 0) {
    throw new PdfReviewValidationError("PDF must contain at least one page");
  }

  for (const page of pages) {
    const { width, height } = page.getSize();
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new PdfReviewValidationError("PDF contains a page with invalid dimensions");
    }
  }

  return pages.length;
};

export const validatePdfForReview = async (
  content: Uint8Array,
): Promise<PdfReviewValidationResult> => {
  try {
    const document = await PdfLibDocument.load(content);
    return {
      pageCount: assertUsablePages(document),
      isEncrypted: false,
    };
  } catch (error) {
    if (error instanceof PdfReviewValidationError) {
      throw error;
    }
    if (!isEncryptedPdfError(error)) {
      throw new PdfReviewValidationError("PDF structure is unreadable or damaged");
    }
  }

  try {
    const document = await PdfLibDocument.load(content, { ignoreEncryption: true });
    return {
      pageCount: assertUsablePages(document),
      isEncrypted: true,
    };
  } catch (error) {
    if (error instanceof PdfReviewValidationError) {
      throw error;
    }
    throw new PdfReviewValidationError("Protected PDF structure is unreadable or damaged");
  }
};
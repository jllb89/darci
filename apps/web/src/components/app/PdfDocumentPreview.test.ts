import { describe, expect, it } from "vitest";
import {
  PdfPreviewLoadError,
  hasPdfHeader,
  readPdfPreviewBlob,
} from "./PdfDocumentPreview";

describe("PdfDocumentPreview", () => {
  it("finds a PDF header within the first 1024 bytes", () => {
    expect(hasPdfHeader(new TextEncoder().encode("\n\n%PDF-1.7"))).toBe(true);
  });

  it("accepts a valid PDF response and normalizes its MIME type", async () => {
    const response = new Response(
      new Blob([new TextEncoder().encode("%PDF-1.7\n%%EOF")], {
        type: "application/octet-stream",
      }),
    );

    const result = await readPdfPreviewBlob(response);

    expect(result.type).toBe("application/pdf");
    expect(result.size).toBeGreaterThan(0);
  });

  it("rejects a successful response containing non-PDF bytes", async () => {
    const response = new Response("<html>expired link</html>", {
      headers: { "Content-Type": "text/html" },
    });

    await expect(readPdfPreviewBlob(response)).rejects.toEqual(
      new PdfPreviewLoadError("This file is not a readable PDF."),
    );
  });

  it("rejects a failed download response", async () => {
    const response = new Response(null, { status: 404 });

    await expect(readPdfPreviewBlob(response)).rejects.toEqual(
      new PdfPreviewLoadError("The PDF could not be downloaded."),
    );
  });
});
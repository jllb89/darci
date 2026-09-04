import { PDFDocument as PdfLibDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: uploadMock,
      }),
    },
  }),
}));

import { uploadGeneratedDocument } from "../../src/services/storageService";

describe("storageService generated PDF uploads", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    uploadMock.mockResolvedValue({ error: null });
  });

  it("uploads generated PDFs with usable pages", async () => {
    const document = await PdfLibDocument.create();
    document.addPage([612, 792]);
    const content = Buffer.from(await document.save());

    await uploadGeneratedDocument({
      storagePath: "generated/readable.pdf",
      content,
      contentType: "application/pdf",
    });

    expect(uploadMock).toHaveBeenCalledOnce();
  });

  it("rejects malformed generated PDFs before storage upload", async () => {
    await expect(
      uploadGeneratedDocument({
        storagePath: "generated/malformed.pdf",
        content: Buffer.from("%PDF-1.7\nmalformed"),
        contentType: "application/pdf",
      }),
    ).rejects.toMatchObject({
      code: "STORAGE_UPLOAD_GENERATED_PDF_INVALID",
      family: "storage",
    });
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { PDFDocument } from "pdf-lib";
import { captureMessage } from "../utils/sentry";

const execute = promisify(execFile);
type PdfFailure = "password_required" | "unreadable" | "render_failed" | "tools_unavailable";

export class PdfProcessingError extends Error {
  constructor(public readonly reason: PdfFailure) {
    super(reason === "password_required"
      ? "This PDF requires a password. Upload a copy that opens without a password."
      : reason === "tools_unavailable"
        ? "PDF processing is temporarily unavailable. Please try again later."
        : "This PDF could not be safely processed. Upload an unlocked, readable copy.");
    this.name = "PdfProcessingError";
  }
}

async function run(tool: string, args: string[]) {
  try {
    return await execute(tool, args, { timeout: 30_000, maxBuffer: 1024 * 1024, env: { ...process.env, LC_ALL: "C" } });
  } catch (error) {
    const failure = error as { code?: string; stderr?: string };
    // Tool diagnostics can contain PDF contents or local paths.
    const reason: PdfFailure = failure.code === "ENOENT" ? "tools_unavailable"
      : /invalid password/i.test(failure.stderr ?? "") ? "password_required" : "render_failed";
    captureMessage("pdf.processing.failed", {
      level: reason === "password_required" ? "warning" : "error",
      tags: { operation: "pdf_processing", pdf_tool: tool, pdf_failure: reason },
      fingerprint: ["pdf_processing", tool, reason],
    });
    throw new PdfProcessingError(reason);
  }
}

async function withPdfFiles<T>(content: Uint8Array, action: (input: string, directory: string) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), "darci-pdf-"));
  try {
    const input = join(directory, "input.pdf");
    await writeFile(input, content, { mode: 0o600 });
    return await action(input, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function assertPdfPages(pdf: PDFDocument) {
  const pages = pdf.getPages();
  if (!pages.length || pages.some(page => {
    const { width, height } = page.getSize();
    return !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0;
  })) throw new PdfProcessingError("unreadable");
  return pages.length;
}

/** ignoreEncryption does not decrypt streams/strings. Keep the original upload
 * for provenance and actually decrypt password-free PDFs before mutating them.
 */
export async function loadPdfForProcessing(content: Uint8Array): Promise<PDFDocument> {
  try {
    const pdf = await PDFDocument.load(content);
    assertPdfPages(pdf);
    return pdf;
  } catch (error) {
    if (!(error instanceof Error) || !/encrypted/i.test(error.message)) {
      throw error instanceof PdfProcessingError ? error : new PdfProcessingError("unreadable");
    }
  }
  return withPdfFiles(content, async (input, directory) => {
    const output = join(directory, "normalized.pdf");
    await run("qpdf", ["--password=", "--decrypt", "--warning-exit-0", input, output]);
    try {
      const pdf = await PDFDocument.load(await readFile(output));
      assertPdfPages(pdf);
      return pdf;
    } catch {
      throw new PdfProcessingError("unreadable");
    }
  });
}

/** Independently parse and render every page before upload/hash/release. */
export async function validateRenderedPdf(content: Uint8Array, expectedPages: number): Promise<void> {
  await withPdfFiles(content, async (input, directory) => {
    await run("qpdf", ["--check", input]);
    const { stdout } = await run("pdfinfo", [input]);
    const count = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1]);
    if (count !== expectedPages || count < 1 || /^Encrypted:\s+yes/m.test(stdout)) {
      captureMessage("pdf.validation.page_mismatch", {
        level: "error", tags: { operation: "pdf_validation" },
        extra: { expectedPages, actualPages: count },
      });
      throw new PdfProcessingError("render_failed");
    }
    const render = await run("pdftoppm", ["-scale-to", "64", "-png", input, join(directory, "page")]);
    // Poppler can exit successfully after recovering from broken content
    // streams. A recovered blank page must not qualify a package for release.
    if (/(?:Syntax Error|Command Line Error|^Error:)/m.test(render.stderr)) {
      captureMessage("pdf.validation.render_failed", { level: "error", tags: { operation: "pdf_validation" } });
      throw new PdfProcessingError("render_failed");
    }
    const rendered = (await readdir(directory)).filter(name => /^page-\d+\.png$/.test(name));
    if (rendered.length !== count) throw new PdfProcessingError("render_failed");
  });
}

export async function saveValidatedPdf(pdf: PDFDocument): Promise<Buffer> {
  const pageCount = assertPdfPages(pdf);
  const content = Buffer.from(await pdf.save());
  await validateRenderedPdf(content, pageCount);
  return content;
}

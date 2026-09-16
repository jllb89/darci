import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// Real encrypted streams, not a fake /Encrypt dictionary over plaintext.
export async function protectPdf(bytes: Uint8Array, userPassword = "") {
  const directory = await mkdtemp(join(tmpdir(), "darci-pdf-test-"));
  try {
    const source = join(directory, "source.pdf");
    const output = join(directory, "protected.pdf");
    await writeFile(source, bytes);
    await promisify(execFile)("qpdf", ["--object-streams=disable", "--encrypt", userPassword, "test-owner-password", "256", "--", source, output]);
    return await readFile(output);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

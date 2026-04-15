import { readFile } from "fs/promises";
import path from "path";
import PDFDocument from "pdfkit";
import { recordAuditEvent } from "./auditService";
import {
  claimDocumentGenerationRunById,
  createGeneratedDocumentVersion,
  getDocumentById,
  getTemplateArtifactById,
  listDocumentOutputSigners,
  updateDocument,
  updateDocumentGenerationRun,
  type DocumentGenerationRunRecord,
  type DocumentOutputSignerRecord,
  type DocumentRecord,
  type TemplateArtifactRecord,
} from "./documentService";
import { uploadGeneratedDocument } from "./storageService";
import { logDocumentTrace } from "../utils/documentTrace";

const PDF_PAGE_MARGIN = 54;
const PDF_SECTION_GAP = 18;
type PdfDocument = InstanceType<typeof PDFDocument>;

const asTrimmedString = (value: unknown) => {
  return typeof value === "string" ? value.trim() : "";
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const escapeHtml = (value: string) => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

const renderValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "Pending";
  }

  if (typeof value === "string") {
    if (!value.trim()) {
      return "Pending";
    }

    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
};

const getRenderContext = (run: DocumentGenerationRunRecord) => {
  return isRecord(run.render_context_json) ? run.render_context_json : {};
};

const getArtifactMetadata = (artifact: TemplateArtifactRecord) => {
  return isRecord(artifact.artifact_metadata) ? artifact.artifact_metadata : {};
};

const loadTemplateSource = async (artifact: TemplateArtifactRecord) => {
  const metadata = getArtifactMetadata(artifact);
  const localTemplatePath = asTrimmedString(metadata.localTemplatePath);
  if (!localTemplatePath) {
    return null;
  }

  const absolutePath = path.resolve(process.cwd(), localTemplatePath);

  try {
    return await readFile(absolutePath, "utf8");
  } catch {
    return null;
  }
};

const writeSectionTitle = (document: PdfDocument, title: string) => {
  document.moveDown(0.4);
  document.font("Helvetica-Bold").fontSize(14).fillColor("#1f1a17").text(title);
  document.moveDown(0.35);
};

const writeBodyText = (document: PdfDocument, text: string, options?: PDFKit.Mixins.TextOptions) => {
  document.font("Helvetica").fontSize(10.5).fillColor("#2d241e").text(text, options);
};

const ensurePageSpace = (document: PdfDocument, minHeight = 72) => {
  const pageBottom = document.page.height - document.page.margins.bottom;
  if (document.y + minHeight > pageBottom) {
    document.addPage();
  }
};

const writeDivider = (document: PdfDocument) => {
  const y = document.y;
  document
    .save()
    .strokeColor("#d3c7b7")
    .lineWidth(1)
    .moveTo(document.page.margins.left, y)
    .lineTo(document.page.width - document.page.margins.right, y)
    .stroke()
    .restore();
  document.moveDown(0.8);
};

const writeLabelValuePairs = (
  document: PdfDocument,
  entries: Array<{ label: string; value: string }>,
) => {
  for (const entry of entries) {
    ensurePageSpace(document, 32);
    document.font("Helvetica-Bold").fontSize(10.5).fillColor("#1f1a17").text(entry.label);
    writeBodyText(document, entry.value, {
      indent: 14,
    });
    document.moveDown(0.45);
  }
};

const writeBulletList = (
  document: PdfDocument,
  items: string[],
  emptyState: string,
) => {
  if (items.length === 0) {
    writeBodyText(document, emptyState);
    document.moveDown(0.5);
    return;
  }

  for (const item of items) {
    ensurePageSpace(document, 24);
    writeBodyText(document, `• ${item}`, {
      indent: 12,
    });
  }

  document.moveDown(0.5);
};

const buildRenderedPdf = async (input: {
  document: DocumentRecord;
  run: DocumentGenerationRunRecord;
  artifact: TemplateArtifactRecord;
  signers: DocumentOutputSignerRecord[];
}) => {
  const renderContext = getRenderContext(input.run);
  const placeholders = isRecord(renderContext.placeholders)
    ? (renderContext.placeholders as Record<string, unknown>)
    : {};
  const deferredRequirements = renderContext.deferredRequirements;
  const templateSource = await loadTemplateSource(input.artifact);
  const metadata = getArtifactMetadata(input.artifact);
  const templateLabel = asTrimmedString(metadata.templateLabel) || input.run.template_key;

  const pdf = new PDFDocument({
    size: "LETTER",
    margin: PDF_PAGE_MARGIN,
    info: {
      Title: `${templateLabel} - ${input.run.output_key}`,
      Author: "DARCi",
      Subject: "Document generation review artifact",
    },
  });

  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    pdf.on("data", (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    pdf.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    pdf.on("error", reject);
  });

  pdf.font("Helvetica-Bold").fontSize(22).fillColor("#1f1a17").text(templateLabel);
  pdf.moveDown(0.35);
  writeBodyText(
    pdf,
    "Stored generation artifact rendered from the pinned template metadata and the generation run context snapshot.",
  );
  pdf.moveDown(0.8);

  writeLabelValuePairs(pdf, [
    { label: "Document ID", value: input.document.id },
    { label: "Run ID", value: input.run.id },
    { label: "Output", value: input.run.output_key },
    { label: "Document Key", value: input.run.document_key },
    {
      label: "Template",
      value: `${input.run.template_key} ${input.run.template_version}`,
    },
    { label: "Rendered At", value: new Date().toISOString() },
  ]);

  writeDivider(pdf);

  ensurePageSpace(pdf, 120);
  writeSectionTitle(pdf, "Resolved Placeholders");
  const placeholderEntries = Object.entries(placeholders).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  writeLabelValuePairs(
    pdf,
    placeholderEntries.length > 0
      ? placeholderEntries.map(([placeholder, value]) => ({
          label: placeholder,
          value: renderValue(value),
        }))
      : [{ label: "Status", value: "No placeholder data was captured." }],
  );

  pdf.moveDown(PDF_SECTION_GAP / 12);
  ensurePageSpace(pdf, 120);
  writeSectionTitle(pdf, "Signer Obligations");
  writeBulletList(
    pdf,
    input.signers.map((signer) => {
      const signingGroup = signer.signing_group ? ` | Group: ${signer.signing_group}` : "";
      const required = signer.is_required ? "Required" : "Optional";
      return `${signer.party_name} (${signer.party_role}) - ${signer.obligation_type} | ${required}${signingGroup} | Source: ${signer.resolution_source}`;
    }),
    "No signer obligations resolved for this run.",
  );

  ensurePageSpace(pdf, 120);
  writeSectionTitle(pdf, "Deferred Requirements");
  const requirementItems = Array.isArray(deferredRequirements)
    ? deferredRequirements
        .filter((value): value is Record<string, unknown> => isRecord(value))
        .map((requirement) => {
          const code = asTrimmedString(requirement.code) || "requirement";
          const message =
            asTrimmedString(requirement.message) || "Pending downstream resolution.";
          return `${code}: ${message}`;
        })
    : [];
  writeBulletList(pdf, requirementItems, "No deferred requirements recorded.");

  if (templateSource) {
    ensurePageSpace(pdf, 160);
    writeSectionTitle(pdf, "Template Source Reference");
    pdf.font("Courier").fontSize(8.75).fillColor("#2d241e").text(templateSource, {
      width: pdf.page.width - pdf.page.margins.left - pdf.page.margins.right,
      lineGap: 1,
    });
    pdf.moveDown(0.5);
  }

  pdf.end();
  return completed;
};

export const processDocumentGenerationRun = async (input: {
  runId: string;
  rendererJobId: string;
}) => {
  const claimedRun = await claimDocumentGenerationRunById({
    runId: input.runId,
    rendererJobId: input.rendererJobId,
  });

  if (!claimedRun) {
    return null;
  }

  try {
    const document = await getDocumentById(claimedRun.document_id);
    if (!document) {
      throw new Error("Document not found for generation run");
    }

    if (!claimedRun.template_artifact_id) {
      throw new Error("Template artifact is not linked to the generation run");
    }

    const artifact = await getTemplateArtifactById(claimedRun.template_artifact_id);
    if (!artifact) {
      throw new Error("Template artifact could not be resolved");
    }

    const signers = await listDocumentOutputSigners({
      documentId: document.id,
      generationRunId: claimedRun.id,
    });

    logDocumentTrace("generation.render_started", {
      documentId: document.id,
      generationRunId: claimedRun.id,
      rendererJobId: input.rendererJobId,
      outputKey: claimedRun.output_key,
      documentKey: claimedRun.document_key,
      templateKey: claimedRun.template_key,
      templateVersion: claimedRun.template_version,
      signerCount: signers.length,
    });

    const pdf = await buildRenderedPdf({
      document,
      run: claimedRun,
      artifact,
      signers,
    });
    const content = pdf;
    const fileName = `${claimedRun.output_key}-${claimedRun.id.slice(0, 8)}.pdf`;
    const storagePath = `${document.owner_id}/${document.id}/generated/${claimedRun.id}/${fileName}`;

    await uploadGeneratedDocument({
      storagePath,
      content,
      contentType: "application/pdf",
    });

    const version = await createGeneratedDocumentVersion({
      documentId: document.id,
      generationRunId: claimedRun.id,
      storagePath,
      fileName,
      mimeType: "application/pdf",
      sizeBytes: content.byteLength,
      createdBy: document.owner_id,
    });

    const renderedRun = await updateDocumentGenerationRun(claimedRun.id, {
      status: "rendered",
      document_version_id: version.id,
      rendered_at: new Date().toISOString(),
      error_message: null,
      failure_code: null,
      failure_details_json: {},
      cancellation_reason: null,
    });

    if (document.status === "draft") {
      await updateDocument(document.id, {
        status: "pending_review",
      });

      await recordAuditEvent({
        entityType: "document",
        entityId: document.id,
        action: "system.document_ready_for_review",
        metadata: {
          document_id: document.id,
          generation_run_id: renderedRun.id,
          document_version_id: version.id,
          review_source: "generated_output",
        },
      });
    }

    await recordAuditEvent({
      entityType: "generation_run",
      entityId: renderedRun.id,
      action: "system.generation_run_render_completed",
      metadata: {
        document_id: renderedRun.document_id,
        generation_run_id: renderedRun.id,
        renderer_job_id: renderedRun.renderer_job_id,
        document_version_id: version.id,
        storage_path: storagePath,
      },
    });

    logDocumentTrace("generation.render_completed", {
      documentId: renderedRun.document_id,
      generationRunId: renderedRun.id,
      rendererJobId: renderedRun.renderer_job_id,
      outputKey: renderedRun.output_key,
      documentVersionId: version.id,
      fileName,
      storagePath,
      sizeBytes: content.byteLength,
      mimeType: "application/pdf",
    });

    return {
      run: renderedRun,
      version,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation run rendering failed";
    const failedRun = await updateDocumentGenerationRun(claimedRun.id, {
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_code: "renderer_error",
      failure_details_json: {
        rendererJobId: input.rendererJobId,
      },
      error_message: message,
    });

    await recordAuditEvent({
      entityType: "generation_run",
      entityId: failedRun.id,
      action: "system.generation_run_failed",
      metadata: {
        document_id: failedRun.document_id,
        generation_run_id: failedRun.id,
        failure_code: failedRun.failure_code,
        error_message: failedRun.error_message,
      },
    });

    logDocumentTrace("generation.render_failed", {
      documentId: failedRun.document_id,
      generationRunId: failedRun.id,
      rendererJobId: input.rendererJobId,
      outputKey: failedRun.output_key,
      errorMessage: message,
    });

    throw error;
  }
};
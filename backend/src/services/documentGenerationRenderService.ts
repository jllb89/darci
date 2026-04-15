import { readFile } from "fs/promises";
import path from "path";
import { recordAuditEvent } from "./auditService";
import {
  claimDocumentGenerationRunById,
  createGeneratedDocumentVersion,
  getDocumentById,
  getTemplateArtifactById,
  listDocumentOutputSigners,
  updateDocumentGenerationRun,
  type DocumentGenerationRunRecord,
  type DocumentOutputSignerRecord,
  type DocumentRecord,
  type TemplateArtifactRecord,
} from "./documentService";
import { uploadGeneratedDocument } from "./storageService";

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
    return '<span class="missing">Pending</span>';
  }

  if (typeof value === "string") {
    if (!value.trim()) {
      return '<span class="missing">Pending</span>';
    }

    return escapeHtml(value).replaceAll("\n", "<br />");
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return escapeHtml(String(value));
  }

  return escapeHtml(JSON.stringify(value, null, 2)).replaceAll("\n", "<br />");
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

const renderSignerRows = (signers: DocumentOutputSignerRecord[]) => {
  if (signers.length === 0) {
    return '<tr><td colspan="6" class="empty">No signer obligations resolved for this run.</td></tr>';
  }

  return signers
    .map((signer) => {
      return [
        "<tr>",
        `<td>${escapeHtml(signer.party_name)}</td>`,
        `<td>${escapeHtml(signer.party_role)}</td>`,
        `<td>${escapeHtml(signer.obligation_type)}</td>`,
        `<td>${escapeHtml(signer.signing_group ?? "")}</td>`,
        `<td>${signer.is_required ? "Yes" : "No"}</td>`,
        `<td>${escapeHtml(signer.resolution_source)}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");
};

const renderPlaceholderRows = (placeholders: Record<string, unknown>) => {
  const entries = Object.entries(placeholders).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return '<tr><td colspan="2" class="empty">No placeholder data was captured.</td></tr>';
  }

  return entries
    .map(([placeholder, value]) => {
      return [
        "<tr>",
        `<td>${escapeHtml(placeholder)}</td>`,
        `<td>${renderValue(value)}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");
};

const renderDeferredRequirements = (requirements: unknown) => {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    return "<p class=\"empty\">No deferred requirements recorded.</p>";
  }

  const items = requirements
    .filter((value): value is Record<string, unknown> => isRecord(value))
    .map((requirement) => {
      const code = asTrimmedString(requirement.code) || "requirement";
      const message = asTrimmedString(requirement.message) || "Pending downstream resolution.";
      return `<li><strong>${escapeHtml(code)}</strong>: ${escapeHtml(message)}</li>`;
    })
    .join("");

  return items.length > 0 ? `<ul>${items}</ul>` : "<p class=\"empty\">No deferred requirements recorded.</p>";
};

const buildRenderedHtml = async (input: {
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

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    `  <title>${escapeHtml(templateLabel)} - ${escapeHtml(input.run.output_key)}</title>`,
    "  <style>",
    "    :root { color-scheme: light; }",
    "    body { font-family: Georgia, 'Times New Roman', serif; margin: 0; background: #f6f1e8; color: #1f1a17; }",
    "    main { max-width: 1080px; margin: 0 auto; padding: 40px 24px 64px; }",
    "    header { padding: 24px 0 32px; border-bottom: 1px solid #d3c7b7; }",
    "    h1, h2 { font-family: 'Iowan Old Style', 'Palatino Linotype', serif; margin: 0 0 12px; }",
    "    h1 { font-size: 2.2rem; line-height: 1.1; }",
    "    h2 { margin-top: 32px; font-size: 1.35rem; }",
    "    p, li, td, th { font-size: 0.98rem; line-height: 1.5; }",
    "    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 18px; }",
    "    .card { background: rgba(255,255,255,0.65); border: 1px solid #d3c7b7; border-radius: 14px; padding: 14px 16px; }",
    "    table { width: 100%; border-collapse: collapse; background: rgba(255,255,255,0.8); border: 1px solid #d3c7b7; }",
    "    th, td { text-align: left; vertical-align: top; border-bottom: 1px solid #e4d8c6; padding: 10px 12px; }",
    "    th { background: #efe6da; font-weight: 600; }",
    "    pre { white-space: pre-wrap; background: #1f1a17; color: #f8f3eb; padding: 18px; border-radius: 14px; overflow: auto; }",
    "    .missing { color: #8c3d1b; font-style: italic; }",
    "    .empty { color: #6c6258; font-style: italic; }",
    "    details { margin-top: 18px; }",
    "    summary { cursor: pointer; font-weight: 600; }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <header>",
    `      <h1>${escapeHtml(templateLabel)}</h1>`,
    "      <p>Stored generation artifact rendered from the pinned template metadata and the generation run context snapshot.</p>",
    '      <div class="meta">',
    `        <div class="card"><strong>Document ID</strong><br />${escapeHtml(input.document.id)}</div>`,
    `        <div class="card"><strong>Run ID</strong><br />${escapeHtml(input.run.id)}</div>`,
    `        <div class="card"><strong>Output</strong><br />${escapeHtml(input.run.output_key)}</div>`,
    `        <div class="card"><strong>Document Key</strong><br />${escapeHtml(input.run.document_key)}</div>`,
    `        <div class="card"><strong>Template</strong><br />${escapeHtml(input.run.template_key)} ${escapeHtml(input.run.template_version)}</div>`,
    `        <div class="card"><strong>Rendered At</strong><br />${escapeHtml(new Date().toISOString())}</div>`,
    "      </div>",
    "    </header>",
    "    <section>",
    "      <h2>Resolved Placeholders</h2>",
    "      <table>",
    "        <thead><tr><th>Placeholder</th><th>Value</th></tr></thead>",
    `        <tbody>${renderPlaceholderRows(placeholders)}</tbody>`,
    "      </table>",
    "    </section>",
    "    <section>",
    "      <h2>Signer Obligations</h2>",
    "      <table>",
    "        <thead><tr><th>Party</th><th>Role</th><th>Obligation</th><th>Signing Group</th><th>Required</th><th>Resolution Source</th></tr></thead>",
    `        <tbody>${renderSignerRows(input.signers)}</tbody>`,
    "      </table>",
    "    </section>",
    "    <section>",
    "      <h2>Deferred Requirements</h2>",
    `      ${renderDeferredRequirements(deferredRequirements)}`,
    "    </section>",
    templateSource
      ? [
          "    <section>",
          "      <h2>Template Source Reference</h2>",
          "      <details open>",
          "        <summary>View source template snapshot</summary>",
          `        <pre>${escapeHtml(templateSource)}</pre>`,
          "      </details>",
          "    </section>",
        ].join("")
      : "",
    "  </main>",
    "</body>",
    "</html>",
  ].join("\n");
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

    const html = await buildRenderedHtml({
      document,
      run: claimedRun,
      artifact,
      signers,
    });
    const content = Buffer.from(html, "utf8");
    const fileName = `${claimedRun.output_key}-${claimedRun.id.slice(0, 8)}.html`;
    const storagePath = `${document.owner_id}/${document.id}/generated/${claimedRun.id}/${fileName}`;

    await uploadGeneratedDocument({
      storagePath,
      content,
      contentType: "text/html; charset=utf-8",
    });

    const version = await createGeneratedDocumentVersion({
      documentId: document.id,
      generationRunId: claimedRun.id,
      storagePath,
      fileName,
      mimeType: "text/html",
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

    throw error;
  }
};
import { describe, expect, it } from "vitest";
import {
  PDFDocument as PdfLibDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
} from "pdf-lib";

import {
  applyPreviewWatermarkOverlay,
  formatExecutionDateForField,
  formatExecutionDatePartsForLine,
  isNotarialFinePrintLine,
  loadTemplateSource,
  PREVIEW_WATERMARK_TEXT,
  renderLegalTemplateText,
  stampSignatureOnPdf,
  stripRenderControlTokens,
  validateSignaturePlacementLayout,
} from "../../src/services/documentGenerationRenderService";

describe("documentGenerationRenderService", () => {
  it("replaces deferred preview placeholders with member-facing text", () => {
    const rendered = renderLegalTemplateText({
      templateSource: "DARCi No. << DarciNo >>\nVerification: {{QR Code}}\nState: << TrustState >>",
      placeholders: {
        TrustState: "California",
      },
      isPreview: true,
    });
    const visible = stripRenderControlTokens(rendered);

    expect(rendered).toContain("[[DARCI_PENDING]]Assigned after review approval[[/DARCI_PENDING]]");
    expect(visible).toContain("Assigned after review approval");
    expect(visible).toContain("Verification URL will be assigned after review approval.");
    expect(visible).toContain("State: California");
    expect(rendered).not.toContain("<< DarciNo >>");
    expect(rendered).not.toContain("{{QR Code}}");
  });

  it("uses canonical fallbacks for trust aliases and indexed values", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "Trust: << TrustName >>",
        "Trustmakers: << Trustmaker(s) >>",
        "TM1: << TM1 >>",
        "Document: << Document1.Name >> on << Document1.Date >>",
        "Signature authority: << SignatureAuthority >>",
        "Incapacity standard: << TrusteeIncapacityStandard >>",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        trust_name: "Orchid Trust",
        grantors: [{ fullName: "Ava Grantor" }],
        prior_document_items: [{ title: "Original Trust Agreement", date: "2026-03-01" }],
        trustee_signature_authority: "all_trustees",
        trustee_incapacity_standard: "court_determination",
      },
      isPreview: true,
    });
    const visible = stripRenderControlTokens(rendered);

    expect(visible).toContain("Trust: Orchid Trust");
    expect(visible).toContain("Trustmakers: Ava Grantor");
    expect(visible).toContain("TM1: Ava Grantor");
    expect(visible).toContain("Document: Original Trust Agreement on March 1, 2026");
    expect(visible).toContain("Signature authority: All trustees must sign");
    expect(visible).toContain("Incapacity standard: A court determination");
  });

  it("resolves seeded trust pseudo-loop placeholders from canonical parties", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "Trust Name: << Trust.Name >> Created on << Trust.Date >>",
        "Trustmaker(s): {{ for each Trust.Maker, \\<\\< Name \\>\\> }}",
        "Trustee(s): {{ for each Trust.Trustee, \\<\\< Name \\>\\> }}",
        "The Trust is revocable by << Trust.Revoke >>",
        "The Trust uses the tax ID number of: << Trust.Maker.Tax.Name >>",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        trust_name: "Orchid Trust",
        trust_date: "2026-03-01",
        grantors: [{ fullName: "Ava Trustmaker" }, { fullName: "Blake Trustmaker" }],
        trustees: [{ fullName: "Taylor Trustee" }],
        revocation_holders: "Either trustmaker may revoke",
        tax_id_owner: "Ava Trustmaker",
      },
      isPreview: true,
    });
    const visible = stripRenderControlTokens(rendered);

    expect(visible).toContain("Trust Name: Orchid Trust Created on March 1, 2026");
    expect(visible).toContain("Trustmaker(s): Ava Trustmaker, Blake Trustmaker");
    expect(visible).toContain("Trustee(s): Taylor Trustee");
    expect(visible).toContain("The Trust is revocable by Either trustmaker may revoke");
    expect(visible).toContain("The Trust uses the tax ID number of: Ava Trustmaker");
  });

  it("drops prior document bullets when seeded indexed placeholders are empty", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "* << Document1.Name >>, dated << Document1.Date >>",
        "* << Document2.Name >>, dated << Document2.Date >>",
        "* << Document3.Name >>, dated << Document3.Date >>",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        prior_document_items: [{ title: "Original Trust Agreement", date: "2026-03-01" }],
      },
      isPreview: false,
    });
    const visible = stripRenderControlTokens(rendered);
    const lines = visible.split("\n").filter((line) => line.trim().length > 0);

    expect(lines).toHaveLength(1);
    expect(visible).toContain("Original Trust Agreement, dated March 1, 2026");
    expect(visible).not.toMatch(/^\*\s*,\s*dated/m);
  });

  it("renders markdown-escaped trust placeholders from the real template format", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "# **DARCi Registration Amendment** **\\<\\< TrustName \\>\\>** **DARCi No. \\<\\< DarciNo \\>\\>**",
        "I/We, \\<\\< Trustmaker(s) \\>\\>, established the \\<\\< TrustName \\>\\>.",
        "Trust Name: \\<\\< TrustName \\>\\>, DARCI No. \\<\\< DarciNo \\>\\> Created on \\<\\< TrustDate \\>\\>",
        "Trustmaker(s): \\<\\< Trustmaker(s) \\>\\>",
        "The Trust is revocable by \\<\\< RevokePower \\>\\>",
        "The Trust is established under the laws of the state of \\<\\< TrustState \\>\\>.",
        "Current trustee(s) of the Trust: \\<\\< Trustee(s) \\>\\>",
      ].join("\n"),
      placeholders: {
        TrustName: "Orchid Trust",
        DarciNo: null,
        TrustDate: "2026-03-01",
        "Trustmaker(s)": "Ava Grantor",
        RevokePower: "The trustmaker only",
        TrustState: "California",
        "Trustee(s)": "Taylor Trustee",
      },
      isPreview: true,
    });
    const visible = stripRenderControlTokens(rendered);

    expect(visible).toContain("DARCi Registration Amendment Orchid Trust DARCi No. Assigned after review approval");
    expect(visible).toContain("I/We, Ava Grantor, established the Orchid Trust.");
    expect(visible).toContain("Trust Name: Orchid Trust, DARCI No. Assigned after review approval Created on March 1, 2026");
    expect(visible).toContain("The Trust is revocable by The trustmaker only");
    expect(visible).toContain("The Trust is established under the laws of the state of California.");
    expect(rendered).not.toContain("\\<\\<");
  });

  it("loads OH trust source from the template-key fallback when artifact metadata is stale", async () => {
    const source = await loadTemplateSource({
      id: "artifact-oh-rrr",
      template_key: "oh_trust_rrr",
      template_version: "2026.04.14.v1",
      template_hash: "sha256:oh-trustrrr-v1",
      artifact_storage_path: "templates/oh_trust_rrr.template.json",
      artifact_mime_type: "application/json",
      render_engine: "other",
      artifact_metadata: {
        renderer: "context_snapshot",
        templateLabel: "Ohio Trust Registration Amendment",
      },
      is_active: true,
      created_at: "2026-04-14T00:00:00.000Z",
    });

    expect(source).toContain("DARCi Registration Amendment");
    expect(source).toContain("TrustName");
  });

  it("loads OH POA source from the template-key fallback when artifact metadata is stale", async () => {
    const source = await loadTemplateSource({
      id: "artifact-oh-poa",
      template_key: "oh_poa_general",
      template_version: "2026.06.05.v2",
      template_hash: "sha256:oh-poa-v2",
      artifact_storage_path: "templates/oh_poa_general.template.json",
      artifact_mime_type: "application/json",
      render_engine: "other",
      artifact_metadata: {
        renderer: "context_snapshot",
        templateLabel: "Ohio DDPOA",
      },
      is_active: true,
      created_at: "2026-06-05T00:00:00.000Z",
    });

    expect(source).toContain("DDPOA No.");
    expect(source).toContain("IMPORTANT INFORMATION FOR AGENT");
  });

  it("omits the successor agent section from the real Ohio POA template when no successors are designated", async () => {
    const source = await loadTemplateSource({
      id: "artifact-oh-poa",
      template_key: "oh_poa_general",
      template_version: "2026.06.05.v2",
      template_hash: "sha256:oh-poa-v2",
      artifact_storage_path: "templates/oh_poa_general.template.json",
      artifact_mime_type: "application/json",
      render_engine: "other",
      artifact_metadata: {
        renderer: "context_snapshot",
        templateLabel: "Ohio DDPOA",
      },
      is_active: true,
      created_at: "2026-06-05T00:00:00.000Z",
    });
    const rendered = renderLegalTemplateText({
      templateSource: source,
      placeholders: {},
      canonicalAnswers: {
        principal_full_name: "Morgan Principal",
        principal_contact: { phone: "6145550101", email: "morgan@example.com" },
        agent_full_name: "Taylor Agent",
        agent_contact: { phone: "6145550102", email: "taylor@example.com" },
        successor_agent_list: [],
      },
      documentKey: "poa_general",
      isPreview: true,
    });
    const visible = stripRenderControlTokens(rendered);

    expect(visible).not.toContain("Designation of Successor Agent(s)");
    expect(visible).not.toContain("I name as my successor agent");
    expect(visible).toContain("Grant of General Authority");
  });

  it("promotes bold-only legal labels into headings and drops the et cetera trust bullet", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "**Confirmation of Trust Data**",
        "* Et c.…",
        "**Effectiveness**",
      ].join("\n"),
      placeholders: {},
      isPreview: true,
    });

    expect(rendered).toContain("## Confirmation of Trust Data");
    expect(rendered).toContain("## Effectiveness");
    expect(rendered).not.toContain("Et c");
  });

  it("removes orphan POA bracket artifacts and uses blank preview fields", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "I, {{Principal.FullName}}, {{Principal.Phone}}, {{Principal.Email}}, appoint {{Agent\\[0\\].FullName}}, {{Agent\\[0\\].Phone}}, {{Agent\\[0\\].Email}}\\]\\], as my agent.",
        "Executed this {{day.\\[ordinal\\]}} day of {{month}}, {{year}}.",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        principal_full_name: "Morgan",
        principal_contact: { phone: "4155550101", email: "principal.mock@example.com" },
        agent_full_name: "Taylor Reed",
        agent_contact: { phone: "4155550102", email: "agent.mock@example.com" },
      },
      isPreview: true,
    });
    const visible = stripRenderControlTokens(rendered);

    expect(visible).toContain(
      "I, Morgan, 4155550101, principal.mock@example.com, appoint Taylor Reed, 4155550102, agent.mock@example.com, as my agent.",
    );
    expect(visible).toContain("Executed this ____ day of ________________, ________.");
    expect(visible).not.toContain("]]"
    );
    expect(rendered).not.toContain("Pending completion");
  });

  it("omits the Ohio successor agent section when no successors are designated", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "**Designation of Successor Agent(s) (Optional)**",
        "",
        "If my agent is unable or unwilling to act for me, I name as my successor agent:",
        "",
        "{{Agent\\[1\\].FullName}}, ",
        "",
        "{{Agent\\[1\\].Phone}}, ",
        "",
        "{{Agent\\[1\\].Email}}.",
        "",
        "If my successor agent is unable or unwilling to act for me, I name as my second successor agent:",
        "",
        "{{Agent\\[2\\].FullName}}, ",
        "",
        "{{Agent\\[2\\].Phone}}, ",
        "",
        "{{Agent\\[2\\].Email}}.",
        "",
        "**Grant of General Authority**",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        successor_agent_list: [],
      },
      documentKey: "poa_general",
      isPreview: true,
    });
    const visible = stripRenderControlTokens(rendered);

    expect(visible).not.toContain("Designation of Successor Agent(s)");
    expect(visible).not.toContain("I name as my successor agent");
    expect(visible).not.toContain("________________");
    expect(visible).toContain("Grant of General Authority");
  });

  it("renders only the first Ohio successor agent paragraph when one successor is designated", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "**Designation of Successor Agent(s) (Optional)**",
        "",
        "If my agent is unable or unwilling to act for me, I name as my successor agent:",
        "",
        "{{Agent\\[1\\].FullName}}, ",
        "",
        "{{Agent\\[1\\].Phone}}, ",
        "",
        "{{Agent\\[1\\].Email}}.",
        "",
        "If my successor agent is unable or unwilling to act for me, I name as my second successor agent:",
        "",
        "{{Agent\\[2\\].FullName}}, ",
        "",
        "{{Agent\\[2\\].Phone}}, ",
        "",
        "{{Agent\\[2\\].Email}}.",
        "",
        "**Grant of General Authority**",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        successor_agent_list: [
          {
            fullName: "Casey Successor",
            phone: "6145550100",
            email: "casey@example.com",
          },
        ],
      },
      documentKey: "poa_general",
      isPreview: true,
    });
    const visible = stripRenderControlTokens(rendered);

    expect(visible).toContain("Designation of Successor Agent(s)");
    expect(visible).toContain("Casey Successor");
    expect(visible).toContain("6145550100");
    expect(visible).toContain("casey@example.com");
    expect(visible).not.toContain("second successor agent");
    expect(visible).not.toContain("________________");
    expect(visible).toContain("Grant of General Authority");
  });

  it("renders both Ohio successor agent paragraphs when two successors are designated", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "**Designation of Successor Agent(s) (Optional)**",
        "",
        "If my agent is unable or unwilling to act for me, I name as my successor agent:",
        "",
        "{{Agent\\[1\\].FullName}}, ",
        "",
        "{{Agent\\[1\\].Phone}}, ",
        "",
        "{{Agent\\[1\\].Email}}.",
        "",
        "If my successor agent is unable or unwilling to act for me, I name as my second successor agent:",
        "",
        "{{Agent\\[2\\].FullName}}, ",
        "",
        "{{Agent\\[2\\].Phone}}, ",
        "",
        "{{Agent\\[2\\].Email}}.",
        "",
        "**Grant of General Authority**",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        successor_agent_list: [
          {
            fullName: "Casey Successor",
            phone: "6145550100",
            email: "casey@example.com",
          },
          {
            fullName: "Riley Backup",
            phone: "6145550101",
            email: "riley@example.com",
          },
        ],
      },
      documentKey: "poa_general",
      isPreview: true,
    });
    const visible = stripRenderControlTokens(rendered);

    expect(visible).toContain("Casey Successor");
    expect(visible).toContain("Riley Backup");
    expect(visible).toContain("second successor agent");
    expect(visible).not.toContain("________________");
  });

  it("leaves California POA templates without successor sections unchanged", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "**Multiple Agents**",
        "",
        "If I have designated more than one agent, {{all agents must act jointly to exercise these powers *OR* any may exercise these powers separately}}.",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        successor_agent_list: [],
      },
      documentKey: "poa_general",
      isPreview: true,
    });
    const visible = stripRenderControlTokens(rendered);

    expect(visible).toContain("Multiple Agents");
    expect(visible).toContain("If I have designated more than one agent");
    expect(visible).not.toContain("Designation of Successor Agent(s)");
  });

  it("omits the California notarial acknowledgment block from generated preview output", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "Before the acknowledgment block.",
        "{{CA_Notarial_Acknowledgment_Block}}",
        "After the acknowledgment block.",
      ].join("\n"),
      placeholders: {
        CA_Notarial_Acknowledgment_Block:
          "State of California\nCounty of [County pending]\nOn [Day pending] day of [Month pending] [Year pending], before me, [Notary pending].",
      },
      isPreview: true,
    });
    const visible = stripRenderControlTokens(rendered);

    expect(PREVIEW_WATERMARK_TEXT).toBe("Preview document only, not official");
    expect(visible).toContain("Before the acknowledgment block.");
    expect(visible).toContain("After the acknowledgment block.");
    expect(visible).not.toContain("State of California");
    expect(visible).not.toContain("County of");
  });

  it("prepends the POA title before the first notice block", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "Notice: This power of attorney is effective immediately.",
        "The principal designates the agent below.",
      ].join("\n"),
      placeholders: {},
      documentKey: "poa_general",
      isPreview: true,
    });
    const visible = stripRenderControlTokens(rendered);

    expect(visible).toContain("Power of Attorney");
    expect(visible.indexOf("Power of Attorney")).toBeLessThan(
      visible.indexOf("Notice: This power of attorney is effective immediately."),
    );
    expect(rendered.startsWith("# Power of Attorney")).toBe(true);
  });

  it("marks trustee powers using the selected matrix", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "The trustee has the power to manage the Trust property through the following transactions:",
        "| __[X]_real property | __[X]_personal property | __[X]_banking and financial |",
        "| :---- | :---- | :---- |",
        "| __[X]_claims and litigation | __[X]_business operations | __[X]_tax matters |",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        trustee_powers: ["Real property and deeds", "tax_matters"],
      },
      selectionCatalogs: {
        trustee_power_matrix: {
          allowedValues: [
            "real_property",
            "personal_property",
            "banking_and_financial",
            "claims_and_litigation",
            "business_operations",
            "tax_matters",
          ],
          allowedValueLabels: {
            real_property: "Real property and deeds",
            personal_property: "Personal property",
            banking_and_financial: "Banking and financial",
            claims_and_litigation: "Claims and litigation",
            business_operations: "Business operations",
            tax_matters: "Tax matters",
          },
        },
      },
      isPreview: true,
    });

    expect(rendered).toContain("[[DARCI_CHECKED]] Real property and deeds");
    expect(rendered).toContain("[[DARCI_UNCHECKED]] Personal property");
    expect(rendered).toContain("[[DARCI_CHECKED]] Tax matters");
  });

  it("renders only the actual trustmaker and trustee signature slots", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "Trustmaker(s):",
        "|  |  |  |  |  |  |  |",
        "| ----- | :---: | ----- | :---: | ----- | :---: | ----- |",
        "| << TM1 >> |  | Date |  | << TM2 >> |  | Date |",
        "",
        "Trustee(s):",
        "|  |  |  |  |  |  |  |",
        "| ----- | :---: | ----- | :---: | ----- | :---: | ----- |",
        "| << Trustee1 >> |  | Date |  | << Trustee2 >> |  | Date |",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        grantors: [{ fullName: "Ava Grantor" }],
        trustees: [{ fullName: "Taylor Trustee" }, { fullName: "Jordan Trustee" }],
      },
      isPreview: true,
    });

    expect(rendered.match(/\[\[DARCI_SIGNATURE_DATE\]\]/g)).toHaveLength(3);
    expect(rendered).toContain("[[DARCI_SIGNATURE_DATE]] Ava Grantor");
    expect(rendered).toContain("[[DARCI_SIGNATURE_DATE]] Taylor Trustee");
    expect(rendered).toContain("[[DARCI_SIGNATURE_DATE]] Jordan Trustee");
    expect(rendered).not.toContain("TM2");
  });

  it("omits Trust Certificate template-only trustmaker signatures and acknowledgments", () => {
    const caRendered = renderLegalTemplateText({
      templateSource: [
        "Trust Information",
        "Trustmaker(s): << Trustmaker(s) >>",
        "Current trustee(s) of the Trust: << Trustees >>",
        "",
        "## **Signatures**",
        "",
        "Trustmaker(s):",
        "|  |  |  |  |  |  |  |",
        "| ----- | :---: | ----- | :---: | ----- | :---: | ----- |",
        "| << TM1 >> |  | Date |  | << TM2 >> |  | Date |",
        "",
        "Trustee(s):",
        "|  |  |  |  |  |  |  |",
        "| ----- | :---: | ----- | :---: | ----- | :---: | ----- |",
        "| << Trustee1 >> |  | Date |  | << Trustee2 >> |  | Date |",
        "",
        "**Notarial Acknowledgement**",
        "County of << County >>",
        "Before me, << illuminotary >>, personally appeared << Trustees >>.",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        grantors: [{ fullName: "Ava Grantor" }],
        trustees: [{ fullName: "Taylor Trustee" }, { fullName: "Jordan Trustee" }],
      },
      documentKey: "trust_certificate",
      isPreview: true,
    });
    const ohRendered = renderLegalTemplateText({
      templateSource: [
        "Trustee(s):",
        "|  |  |  |  |  |  |  |",
        "| ----- | :---: | ----- | :---: | ----- | :---: | ----- |",
        "| << Trustee1 >> |  | Date |  | << Trustee2 >> |  | Date |",
        "",
        "**ACKNOWLEDGMENT CERTIFICATE**",
        "**County of_______________________**",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        trustees: [{ fullName: "Taylor Trustee" }, { fullName: "Jordan Trustee" }],
      },
      documentKey: "trust_certificate",
      isPreview: true,
    });

  const caVisible = stripRenderControlTokens(caRendered);

  expect(caVisible).toContain("Trustmaker(s): Ava Grantor");
  expect(caVisible).toContain("Current trustee(s) of the Trust: Taylor Trustee, Jordan Trustee");
    expect(caRendered.match(/\[\[DARCI_SIGNATURE_DATE\]\]/g)).toHaveLength(2);
    expect(caRendered).not.toContain("[[DARCI_SIGNATURE_DATE]] Ava Grantor");
    expect(caRendered).toContain("[[DARCI_SIGNATURE_DATE]] Taylor Trustee");
    expect(caRendered).toContain("[[DARCI_SIGNATURE_DATE]] Jordan Trustee");
    expect(caRendered).not.toContain("Notarial Acknowledgement");
    expect(caRendered).not.toContain("County of");
    expect(caRendered).not.toContain("illuminotary");
    expect(ohRendered).not.toContain("ACKNOWLEDGMENT CERTIFICATE");
    expect(ohRendered).not.toContain("County of_______________________");
  });

  it("omits Trust Registration template-side acknowledgments but keeps signature slots", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "## **Signatures**",
        "",
        "Trustmaker(s):",
        "|  |  |  |  |  |  |  |",
        "| ----- | :---: | ----- | :---: | ----- | :---: | ----- |",
        "| << TM1 >> |  | Date |  | << TM2 >> |  | Date |",
        "",
        "Trustee(s):",
        "|  |  |  |  |  |  |  |",
        "| ----- | :---: | ----- | :---: | ----- | :---: | ----- |",
        "| << Trustee1 >> |  | Date |  | << Trustee2 >> |  | Date |",
        "",
        "## **Notarial Acknowledgement**",
        "County of << County >>",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        grantors: [{ fullName: "Ava Grantor" }],
        trustees: [{ fullName: "Taylor Trustee" }],
      },
      documentKey: "trust_rrr",
      isPreview: true,
    });

    expect(rendered).toContain("[[DARCI_SIGNATURE_DATE]] Ava Grantor");
    expect(rendered).toContain("[[DARCI_SIGNATURE_DATE]] Taylor Trustee");
    expect(rendered).not.toContain("Notarial Acknowledgement");
    expect(rendered).not.toContain("County of");
  });

  it("keeps additional POA authorities inside the authority checklist", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "_____ (A) Real property transactions.",
        "",
        "_____ (B) Tangible personal property transactions.",
        "",
        "_____ (C) Stock and bond transactions.",
        "",
        "_____ (N) ALL OF THE POWERS LISTED ABOVE",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        authority_scope_selection: ["real_property", "make_gifts"],
      },
      selectionCatalogs: {
        authority_scope_selection: {
          allowedValues: ["real_property", "make_gifts"],
          allowedValueLabels: {
            real_property: "Real property transactions",
            make_gifts: "Make gifts",
          },
        },
      },
      isPreview: true,
    });

    expect(rendered).toContain("[[DARCI_CHECKED]] (A) Real property transactions");
    expect(rendered).not.toContain("Additional Authority");
    expect(rendered).toContain("[[DARCI_CHECKED]] Make gifts");
  });

  it("maps seeded CA/OH POA authority keys without appending duplicate lines", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "_____ (K) Benefits from Social Security, Medicare, Medicaid, or other governmental programs, or civil or military service",
        "_____ (L) Retirement plan transactions",
        "_____ (M) Tax matters",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        authority_scope_selection: ["government_benefits", "retirement_plans", "taxes"],
      },
      selectionCatalogs: {
        authority_scope_selection: {
          allowedValues: ["government_benefits", "retirement_plans", "taxes"],
          allowedValueLabels: {
            government_benefits: "Benefits from governmental programs or military service",
            retirement_plans: "Retirement plans",
            taxes: "Taxes",
          },
        },
      },
      isPreview: true,
    });

    const checkedLines = rendered
      .split("\n")
      .filter((line) => line.startsWith("[[DARCI_CHECKED]]"));

    expect(checkedLines).toHaveLength(3);
    expect(rendered).toContain("[[DARCI_CHECKED]] (K) Benefits from Social Security");
    expect(rendered).toContain("[[DARCI_CHECKED]] (L) Retirement plan transactions");
    expect(rendered).toContain("[[DARCI_CHECKED]] (M) Tax matters");
    expect(rendered).not.toContain("[[DARCI_CHECKED]] Benefits from governmental programs");
    expect(rendered).not.toContain("[[DARCI_CHECKED]] Retirement plans");
    expect(rendered).not.toContain("[[DARCI_CHECKED]] Taxes");
  });

  it("checks Ohio digital assets inside the POA authority checklist and preserves all-powers matching", () => {
    const rendered = renderLegalTemplateText({
      templateSource: [
        "_____ (M) Tax matters.",
        "_____ (N) Digital assets.",
        "_____ (O) ALL OF THE POWERS LISTED ABOVE",
      ].join("\n"),
      placeholders: {},
      canonicalAnswers: {
        authority_scope_selection: ["access_digital_assets"],
      },
      selectionCatalogs: {
        authority_scope_selection: {
          allowedValues: ["access_digital_assets"],
          allowedValueLabels: {
            access_digital_assets: "Digital assets",
          },
        },
      },
      isPreview: true,
    });

    expect(rendered).toContain("[[DARCI_CHECKED]] (N) Digital assets");
    expect(rendered).toContain("[[DARCI_UNCHECKED]] (O) ALL OF THE POWERS LISTED ABOVE");
    expect(rendered).not.toContain("[[DARCI_CHECKED]] Digital assets");
  });

  it("still treats CA-style N as all powers when the label says all powers", () => {
    const rendered = renderLegalTemplateText({
      templateSource: "_____ (N) ALL OF THE POWERS LISTED ABOVE",
      placeholders: {},
      canonicalAnswers: {
        authority_scope_selection: ["all_powers"],
      },
      selectionCatalogs: {
        authority_scope_selection: {
          allowedValues: ["all_powers"],
          allowedValueLabels: {
            all_powers: "ALL OF THE POWERS LISTED ABOVE",
          },
        },
      },
      isPreview: true,
    });

    expect(rendered).toContain("[[DARCI_CHECKED]] (N) ALL OF THE POWERS LISTED ABOVE");
  });

  it("renders Ohio IMPORTANT INFORMATION FOR AGENT as a smaller section heading", () => {
    const rendered = renderLegalTemplateText({
      templateSource: "**IMPORTANT INFORMATION FOR AGENT**",
      placeholders: {},
      canonicalAnswers: {},
      isPreview: true,
    });

    expect(rendered).toBe("## IMPORTANT INFORMATION FOR AGENT");
  });

  it("preserves the PDF cursor when applying the preview watermark", () => {
    const fakeDocument = {
      x: 54,
      y: 72,
      page: {
        width: 612,
        height: 792,
        margins: {
          left: 54,
          right: 54,
        },
      },
      save() {
        return this;
      },
      rotate() {
        return this;
      },
      font() {
        return this;
      },
      fontSize() {
        return this;
      },
      fillColor() {
        return this;
      },
      opacity() {
        return this;
      },
      text() {
        this.x = -40;
        this.y = 410;
        return this;
      },
      restore() {
        return this;
      },
    } as never;

    applyPreviewWatermarkOverlay(fakeDocument);

    expect(fakeDocument.x).toBe(54);
    expect(fakeDocument.y).toBe(72);
  });

  it("formats execution dates from captured signature timestamps", () => {
    expect(formatExecutionDateForField("2026-04-22T15:05:30.000Z")).toBe("04/22/2026");
    expect(formatExecutionDateForField(null)).toBeNull();
  });

  it("formats execution date parts for POA execution lines", () => {
    expect(formatExecutionDatePartsForLine("2026-06-01T15:30:00.000Z")).toEqual({
      day: "1st",
      month: "June",
      year: "2026",
    });
    expect(formatExecutionDatePartsForLine("2026-06-12T15:30:00.000Z")?.day).toBe("12th");
    expect(formatExecutionDatePartsForLine("not-a-date")).toBeNull();
  });

  it("accepts generated execution-date and signature placements with clear spacing", () => {
    expect(() =>
      validateSignaturePlacementLayout(
        new Map([
          [
            "signer-1",
            {
              pageNumber: 4,
              label: "Morgan Principal",
              includeDate: false,
              signatureRect: { x: 54, y: 184, width: 504, height: 40 },
              dateRect: null,
              executionDatePlacement: {
                pageNumber: 4,
                lineRect: { x: 54, y: 148, width: 504, height: 18 },
              },
            },
          ],
        ]),
      ),
    ).not.toThrow();
  });

  it("rejects generated execution-date placements that split or overlap the signature block", () => {
    expect(() =>
      validateSignaturePlacementLayout(
        new Map([
          [
            "signer-1",
            {
              pageNumber: 4,
              label: "Morgan Principal",
              includeDate: false,
              signatureRect: { x: 54, y: 184, width: 504, height: 40 },
              dateRect: null,
              executionDatePlacement: {
                pageNumber: 3,
                lineRect: { x: 54, y: 148, width: 504, height: 18 },
              },
            },
          ],
        ]),
      ),
    ).toThrow(/overlap or split/);

    expect(() =>
      validateSignaturePlacementLayout(
        new Map([
          [
            "signer-1",
            {
              pageNumber: 4,
              label: "Morgan Principal",
              includeDate: false,
              signatureRect: { x: 54, y: 184, width: 504, height: 40 },
              dateRect: null,
              executionDatePlacement: {
                pageNumber: 4,
                lineRect: { x: 54, y: 180, width: 504, height: 18 },
              },
            },
          ],
        ]),
      ),
    ).toThrow(/overlap or split/);
  });

  it("classifies California acknowledgment body text as fine print", () => {
    expect(
      isNotarialFinePrintLine(
        "On this ____ day of ________________ ________, before me, __________________, a notary public, personally appeared __________________, who proved to me on the basis of satisfactory evidence to be the person(s) whose name(s) is/are subscribed to the within instrument and acknowledged to me that he/she/they executed the same in his/her/their authorized capacity(ies), and that by his/her/their signature(s) on the instrument the person(s), or the entity upon behalf of which the person(s) acted, executed the instrument.",
      ),
    ).toBe(true);
  });

  it("stamps the uploaded-document addendum when the source PDF is protected", async () => {
    const sourcePdf = await PdfLibDocument.create();
    sourcePdf.addPage([612, 792]);
    const encryptionDictionary = sourcePdf.context.obj({
      Filter: PDFName.of("Standard"),
      V: PDFNumber.of(1),
      R: PDFNumber.of(2),
      Length: PDFNumber.of(40),
      O: PDFHexString.of("00000000000000000000000000000000"),
      U: PDFHexString.of("00000000000000000000000000000000"),
      P: PDFNumber.of(-4),
    });
    sourcePdf.context.trailerInfo.Encrypt = sourcePdf.context.register(encryptionDictionary);
    const protectedPdfBytes = Buffer.from(await sourcePdf.save({ useObjectStreams: false }));

    await expect(PdfLibDocument.load(protectedPdfBytes)).rejects.toThrow(/encrypted/i);

    const stampedPdfBytes = await stampSignatureOnPdf({
      pdfBytes: protectedPdfBytes,
      placement: {
        pageNumber: 1,
        label: "Document owner",
        includeDate: true,
        signatureRect: { x: 72, y: 170, width: 300, height: 44 },
        dateRect: { x: 390, y: 170, width: 150, height: 44 },
      },
      signatureRecord: {
        id: "signature-protected-pdf",
        document_id: "document-protected-pdf",
        generation_run_id: "run-protected-pdf",
        document_output_signer_id: "signer-protected-pdf",
        signer_id: "member-protected-pdf",
        signature_type: "member",
        storage_path: null,
        capture_method: "type",
        typed_value: "Morgan Member",
        typed_kind: "name",
        mime_type: null,
        size_bytes: null,
        status: "captured",
        metadata: {},
        captured_at: "2026-08-25T18:00:00.000Z",
        created_at: "2026-08-25T18:00:00.000Z",
      },
      uploadedNotarizationAddendum: { appendPage: true },
    });
    const stampedPdf = await PdfLibDocument.load(stampedPdfBytes, { ignoreEncryption: true });

    expect(stampedPdf.getPageCount()).toBe(2);
    expect(stampedPdfBytes.byteLength).toBeGreaterThan(protectedPdfBytes.byteLength);
  });
});

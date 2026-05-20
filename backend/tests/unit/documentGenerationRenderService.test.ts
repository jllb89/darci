import { describe, expect, it } from "vitest";

import {
  applyPreviewWatermarkOverlay,
  PREVIEW_WATERMARK_TEXT,
  renderLegalTemplateText,
  stripRenderControlTokens,
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
});

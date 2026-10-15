import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TermsPage, { metadata } from "./page";
import { termsMetadata, termsText } from "./terms";

const html = renderToStaticMarkup(<TermsPage />);
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const decode = (text: string) => text.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");

describe("approved DARCi Terms", () => {
  it("publishes the exact approved customer text, not internal review notes", () => {
    const source = readFileSync(new URL("../../../../../docs/terms-provisional-review-2026-10-15.md", import.meta.url), "utf8");
    const approved = source.split("## Proposed customer text\n\n")[1].split("\n## Review notes and sources")[0].trim();
    expect(termsText).toBe(approved);
    const markup = html.split("data-terms-content")[1].split("</article>")[0].replace(/^[^>]*>/, "");
    const visible = decode(markup.replace(/<\/(?:h2|p|th|td|tr)>/g, "\n").replace(/<[^>]*>/g, ""));
    const expected = termsText.replace(/^### /gm, "").replaceAll("**", "")
      .split("\n").filter(line => !/^\|[\s|:-]+\|$/.test(line))
      .map(line => line.startsWith("|") ? line.split("|").slice(1, -1).join(" ") : line).join("\n");
    expect(normalize(visible)).toBe(normalize(expected));
    expect(html).not.toContain("Decisions before publication");
    expect(html).not.toContain("Interface copy for review");
    expect(html).not.toContain("IPEN goes here");
  });

  it("uses semantic headings, accurate prices, accessible links and no heavier-than-medium typography", () => {
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
    expect((html.match(/<h2\b/g) ?? []).length).toBe(17);
    expect(html).toContain('<table aria-label="Membership prices and monthly document allowances"');
    for (const amount of ["$9.99", "$19.99", "$59.99", "$99", "$199", "$599"]) expect(html).toContain(amount);
    for (const link of ["/", "/privacy", "mailto:support@illuminote.io", "mailto:incidentreports@illuminote.io"]) expect(html).toContain(`href="${link}"`);
    expect(metadata.alternates?.canonical).toBe("https://illuminotary.com/terms");
    expect(termsMetadata.effectiveDate).toBe("October 15, 2026");
    expect(html).not.toMatch(/font-(bold|semibold)/);
  });

  it("discloses public PDFs, hash-only limits and actual retention without unfinished promises", () => {
    expect(termsText).toContain("view and save the exposed final PDFs");
    expect(termsText).toContain("not blockchain anchoring");
    expect(termsText).toContain("not automatically purged");
    expect(termsText).toContain("does not remove identity checks");
    expect(termsText).not.toMatch(/DARCI\b|\(POA terms go here\)|\(IPEN goes here\)/);
  });
});

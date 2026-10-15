import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPage, { metadata } from "./page";
import { privacyPolicyMetadata, privacyPolicyText } from "./policy";

const html = renderToStaticMarkup(<PrivacyPage />);
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const decode = (text: string) => text
  .replaceAll("&quot;", '"')
  .replaceAll("&#x27;", "'")
  .replaceAll("&amp;", "&")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");

describe("client-supplied PP15 privacy policy", () => {
  it("renders every clause of the supplied policy with its approved corrections", () => {
    const policyMarkup = html.split("data-policy-content")[1].split("</article>")[0].replace(/^[^>]*>/, "");
    const visibleText = decode(policyMarkup.replace(/<[^>]*>/g, " "));
    const expected = privacyPolicyText
      .replaceAll("[support@illuminote.io](mailto:support@illuminote.io)", "support@illuminote.io")
      .replace(/^- /gm, "");
    expect(normalize(visibleText)).toBe(normalize(expected));
    expect(privacyPolicyText.length).toBeGreaterThan(7700);
  });

  it("preserves the document metadata and exposes semantic headings and real mail links", () => {
    expect(privacyPolicyMetadata).toEqual({ number: "PP15", name: "Privacy Policy", effectiveDate: "11/30/2023", lastUpdated: "10/15/2026", status: "Active" });
    for (const value of Object.values(privacyPolicyMetadata)) expect(html).toContain(value);
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
    expect((html.match(/<h2\b/g) ?? []).length).toBe(8);
    expect((html.match(/<li\b/g) ?? []).length).toBe(4);
    expect(html).toContain('href="mailto:support@illuminote.io"');
    expect(html).toContain('href="mailto:incidentreports@illuminote.io"');
    expect(html).toContain('href="/"');
    expect(metadata.alternates?.canonical).toBe("https://illuminotary.com/privacy");
    expect(html).not.toContain("font-bold");
    expect(html).not.toContain("font-semibold");
  });

  it("includes only the approved logging, public-preview and retention corrections", () => {
    expect(privacyPolicyText).not.toContain("BUT NOT stored");
    expect(privacyPolicyText).toContain("We collect and retain relevant device, IP address, login and workflow activity information for service operation, security, fraud prevention and audit records.");
    expect(privacyPolicyText).toContain("Released final documents and information printed in them may be viewed and saved without signing in through their public verification link or IDN; drafts, held packages and protected identity records are excluded.");
    expect(privacyPolicyText).toContain("Account deletion does not necessarily erase records retained for legal obligations, notarial records, fraud prevention, disputes or legal holds. Contact support about access or deletion requests; no fixed automatic deletion period is promised.");
    expect(html).toContain('href="/terms"');
  });
});

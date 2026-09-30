import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePublicVerification, PublicVerificationSummary } from "./verificationSummary";

describe("public verification privacy", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("allows only verified final previews signed by this environment's storage", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.example.test");
    const document = {id: "final-1", fileName: "Final.pdf", label: "Final document", isFinal: true,
      downloadUrl: "https://storage.example.test/storage/v1/object/sign/documents/final.pdf?token=test"};
    const proof = {idn: "PUBLIC123456", hash: "a".repeat(64), status: "verified", documents: [document]};
    expect(parsePublicVerification(proof)?.documents).toEqual([document]);
    expect(parsePublicVerification({...proof, status: "unverified"})?.documents).toBeUndefined();
    expect(parsePublicVerification({...proof, hash: "invalid"})?.documents).toBeUndefined();
    for (const change of [{isFinal:false}, {downloadUrl:"https://other.example.test/storage/v1/object/sign/final.pdf"},
      {downloadUrl:"https://storage.example.test/storage/v1/object/public/final.pdf"}]) {
      expect(parsePublicVerification({...proof, documents:[{...document,...change}]})?.documents).toBeUndefined();
    }
  });
  it("discards legacy document URLs and renders proof without a PDF surface", () => {
    const payload = parsePublicVerification({ idn: "PUBLIC123456", hash: "a".repeat(64), status: "verified",
      documents: [{ downloadUrl: "https://private.invalid/secret.pdf?token=private", fileName: "private-name.pdf" }] });
    expect(payload).toEqual({ idn: "PUBLIC123456", hash: "a".repeat(64), status: "verified" });
    const html = renderToStaticMarkup(<PublicVerificationSummary payload={payload} idn="PUBLIC123456" isLoading={false} errorMessage={null} />);
    expect(html).toContain("Hash verified");
    expect(html).toContain("a".repeat(64));
    expect(html).not.toMatch(/iframe|embed|private-name|secret\.pdf|downloadUrl|token=/);
  });
  it("does not claim verification or show a hash for unverified or malformed proof", () => {
    for (const payload of [{ idn: "IDN", hash: "a".repeat(64), status: "unverified" as const },
      parsePublicVerification({ idn: "IDN", hash: "not-a-sha256", status: "verified" })]) {
      const html = renderToStaticMarkup(<PublicVerificationSummary payload={payload} idn="IDN" isLoading={false} errorMessage={null} />);
      expect(html).not.toContain("Hash verified");
      expect(html).not.toContain("a".repeat(64));
      expect(html).toContain("Not verified");
    }
  });
  it("handles loading, unavailable records and malformed responses without a preview", () => {
    expect(parsePublicVerification({ idn: "IDN", status: "completed" })).toBeNull();
    expect(parsePublicVerification(null)).toBeNull();
    expect(renderToStaticMarkup(<PublicVerificationSummary payload={null} idn="IDN" isLoading={true} errorMessage={null} />)).toContain("Checking verification");
    expect(renderToStaticMarkup(<PublicVerificationSummary payload={null} idn="IDN" isLoading={false} errorMessage="Not available" />)).toContain('role="alert"');
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { VerificationIdentifier } from "./VerificationIdentifier";

it("keeps a full SHA-256 hash copyable without forcing a minimum content width", () => {
  const hash = "0123456789abcdef".repeat(4);
  const html = renderToStaticMarkup(<VerificationIdentifier label="Hash" value={hash} />);
  expect(html).toContain(hash);
  expect(html).toContain("overflow-wrap:anywhere");
  expect(html).toContain("white-space:normal");
  expect(html).not.toContain("truncate");
  expect(renderToStaticMarkup(<VerificationIdentifier label="Ledger TX" />)).toContain(">-</span>");
});

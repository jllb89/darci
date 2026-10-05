import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { NotaryQueueRequestSummary } from "@/lib/notaryWorkspace";
import { RequestRow } from "./RequestRow";

const request = {
  request: {
    id: "request/123",
    status: "completed",
    queueStatus: "completed",
    submittedAt: null,
  },
  document: {
    idn: "OH26TEST123",
    documentType: "poa",
    documentTypeLabel: "POA",
    summary: {
      finalization: {
        isFinalized: true,
      },
    },
  },
  owner: {
    displayName: "Test Member",
    email: "member@example.com",
  },
  workflow: null,
  meeting: null,
  finalization: {
    latestStatus: "completed",
    anchoredAt: null,
  },
  nextAction: null,
} as NotaryQueueRequestSummary;

describe("notary request row", () => {
  it("keeps reusable components out of the Next.js page export contract", async () => {
    const page = await import("./page");
    expect(Object.keys(page)).toEqual(["default"]);
  });

  it("does not link completed requests to the document workspace", () => {
    const html = renderToStaticMarkup(<RequestRow request={request} tab="completed" />);

    expect(html).not.toContain("<a");
    expect(html).not.toContain("/app/notary/requests/");
  });

  it("keeps active queue requests linked to the document workspace", () => {
    const html = renderToStaticMarkup(<RequestRow request={request} tab="review" />);

    expect(html).toContain('<a class="');
    expect(html).toContain('/app/notary/requests/request%2F123');
  });
});

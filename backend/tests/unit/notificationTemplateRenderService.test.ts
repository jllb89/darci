import { afterEach, describe, expect, it, vi } from "vitest";
import { emailButtonStyle } from "../../src/services/emailLayoutService";
import { renderNotificationTemplate } from "../../src/services/notificationTemplateRenderService";

describe("notificationTemplateRenderService", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("renders standalone markdown links as CTA buttons and inline links as inline links", () => {
    const rendered = renderNotificationTemplate({
      template: {
        templateKey: "test_email",
        audienceScope: "registrant",
        subjectTemplate: "Test email",
        bodyTemplate: [
          "Questions? Email [support](mailto:support@darciregistry.com).",
          "",
          "[Open request](https://app.staging.darciregistry.dev/app)",
        ].join("\n"),
        bodyFormat: "markdown",
      },
      payload: {},
      recipientEmail: "recipient@example.com",
    });

    expect(rendered.html).toContain(
      '<a class="darci-inline-link" href="mailto:support@darciregistry.com">support</a>',
    );
    expect(rendered.html).toContain(
      `<p class="darci-cta-row"><a class="darci-button" style="${emailButtonStyle}" href="https://app.staging.darciregistry.dev/app">Open request</a></p>`,
    );
  });
  it("redesigns the existing review template without a migration or private logo URL", () => {
    vi.stubEnv("NOTIFICATION_REPLY_TO", "lopezb.jl@gmail.com");
    const url = "https://app.illuminotary.com/app/review?documentId=sample-document";
    const result = renderNotificationTemplate({template: {
      templateKey: "document_ready_for_review_email", audienceScope: "registrant",
      subjectTemplate: "Your documents are ready for review",
      bodyTemplate: "Hi {{firstName}},\n\nYour documents are ready for review.\n\nPlease review carefully:\n{{reviewUrl}}\n\n- Your DARCi Team",
      bodyFormat: "markdown",
    }, payload: {firstName: "Sample", reviewUrl: url}});
    expect(result.html).toContain("Review documents&nbsp;↗</a>");
    expect(result.html).toContain(`href="${url}"`);
    expect(result.html).not.toContain("<img");
    expect(result.html).not.toContain("support@darciregistry.com");
    expect(result.html).toContain('href="mailto:lopezb.jl@gmail.com"');
    expect(result.html).not.toContain("<li>Your DARCi Team");
    expect(result.text).toContain(url);
    expect(result.missingVariables).toEqual([]);
  });
  it("escapes plain text content and subject rather than interpreting it as email markup", () => {
    const result = renderNotificationTemplate({template: {
      templateKey: "text", audienceScope: null, subjectTemplate: "<img src=x>",
      bodyTemplate: "<script>alert(1)</script>", bodyFormat: "text",
    }, payload: {}});
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).toContain("&lt;img src=x&gt;");
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("prefers-color-scheme:dark");
  });
  it("keeps HTML template content and configured delivery addressing", () => {
    vi.stubEnv("NOTIFICATION_DEFAULT_FROM", "DARCi <notifications@example.com>");
    vi.stubEnv("NOTIFICATION_REPLY_TO", "Support <help@example.com>");
    const result = renderNotificationTemplate({template: {
      templateKey: "html", audienceScope: null, subjectTemplate: "Ready",
      bodyTemplate: '<p>Ready. <a href="https://example.com">Open</a></p>', bodyFormat: "html",
    }, payload: {}, recipientEmail: "test@example.com"});
    expect(result.from).toBe("DARCi <notifications@example.com>");
    expect(result.replyTo).toBe("Support <help@example.com>");
    expect(result.html).toContain('href="mailto:help@example.com"');
    expect(result.html).toContain('<a href="https://example.com">Open</a>');
    expect(result.to).toBe("test@example.com");
  });
});

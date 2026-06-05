import { describe, expect, it } from "vitest";
import { renderNotificationTemplate } from "../../src/services/notificationTemplateRenderService";

describe("notificationTemplateRenderService", () => {
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
      '<p class="darci-cta-row"><a class="darci-button" href="https://app.staging.darciregistry.dev/app">Open request</a></p>',
    );
  });
});
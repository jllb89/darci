import { marked } from "marked";

export type JsonObject = Record<string, unknown>;

export type NotificationTemplateRenderSource = {
  templateKey: string;
  audienceScope: string | null;
  subjectTemplate: string | null;
  bodyTemplate: string | null;
  bodyFormat: "text" | "markdown" | "html" | null;
};

export type RenderNotificationTemplateInput = {
  template: NotificationTemplateRenderSource;
  payload: JsonObject;
  recipientEmail?: string | null;
  recipientDisplayName?: string | null;
};

export type RenderedNotificationTemplate = {
  from: string;
  replyTo: string;
  to: string | null;
  subject: string;
  html: string;
  text: string;
  missingVariables: string[];
};

export class NotificationTemplateRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationTemplateRenderError";
  }
}

const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;
const resolveWebAppBaseUrl = () => {
  return (
    process.env.WEB_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_WEB_BASE_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://app.staging.darciregistry.dev"
  ).replace(/\/+$/, "");
};

const collectPlaceholders = (template: string) => {
  const matches = template.matchAll(PLACEHOLDER_REGEX);
  return Array.from(
    new Set(
      Array.from(matches, (match) => match[1]).filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    ),
  ).sort();
};

const interpolate = (template: string, payload: JsonObject): string =>
  template.replace(PLACEHOLDER_REGEX, (_, key) => {
    const value = payload[key];
    return value != null ? String(value) : "";
  });

const getEmailLogoUrl = () => {
  return `${resolveWebAppBaseUrl()}/icons/navbar/darci_white.svg`;
};

const wrapEmailHtml = (bodyHtml: string): string => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      /* Base content styles */
      .darci-content p {
        margin: 0 0 18px;
      }
      .darci-content p:last-child {
        margin-bottom: 0;
      }
      .darci-content strong {
        color: #191919;
        font-weight: 600;
      }
      .darci-content .darci-cta-row {
        margin: 8px 0 24px;
      }
      .darci-content .darci-button {
        display: block;
        padding: 14px 0;
        background: #0aff4a;
        color: #191919 !important;
        text-align: center;
        text-decoration: none;
        font-weight: 600;
        font-size: 14px;
        border: 0;
      }
      .darci-content .darci-inline-link {
        color: #191919;
        text-decoration: underline;
        font-weight: 600;
      }
      .darci-content ul,
      .darci-content ol {
        margin: 0 0 20px;
        padding-left: 20px;
      }
      .darci-content li {
        margin: 6px 0;
      }
      .darci-content hr {
        border: 0;
        border-top: 1px solid #d8d8d8;
        margin: 24px 0;
      }
      /* Mobile */
      @media only screen and (max-width: 620px) {
        .darci-outer { padding: 16px 8px !important; }
        .darci-card { width: 100% !important; }
        .darci-header { padding: 20px 20px !important; }
        .darci-body { padding: 24px 20px !important; }
        .darci-footer { padding: 16px 20px !important; }
        .darci-contact-btn { display: block !important; width: 100% !important; box-sizing: border-box; margin-bottom: 10px !important; padding-right: 0 !important; }
        .darci-contact-btn td { display: block !important; width: 100% !important; }
        .darci-content .darci-button { width: 100% !important; box-sizing: border-box !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f2f2f2;font-family:Arial,'Helvetica Neue',sans-serif;font-weight:500;">
    <table class="darci-outer" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;padding:40px 16px;">
      <tr>
        <td align="center">
          <table class="darci-card" width="640" cellpadding="0" cellspacing="0"
            style="background:#ffffff;border:1px solid #d8d8d8;max-width:640px;width:100%;">
            <tr>
              <td class="darci-header" style="padding:24px 34px;background:#000000;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="left">
                      <img src="${getEmailLogoUrl()}" width="91" height="20" alt="DARCi" style="display:block;border:0;outline:none;text-decoration:none;width:91px;height:auto;color:#ffffff;font-size:16px;line-height:20px;" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="darci-body" style="padding:34px;color:#191919;font-size:14px;line-height:1.7;font-weight:500;">
                <div class="darci-content">
                  ${bodyHtml}
                </div>
              </td>
            </tr>
            <tr>
              <td class="darci-footer" style="background:#f2f2f2;padding:22px 34px;border-top:1px solid #d8d8d8;">
                <p style="margin:0;color:#7f7f7f;font-size:12px;line-height:18px;font-weight:500;">
                  DARCi document signing<br/>
                  Questions? Reply to this email or contact <a href="mailto:support@darciregistry.com" style="color:#191919;text-decoration:underline;">support@darciregistry.com</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

const firstConfiguredValue = (keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
};

const normalizeEnvKeySegment = (value: string) => {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
};

const resolveFromAddress = (audienceScope: string | null, templateKey: string): string => {
  const isBilling =
    templateKey.includes("payment") ||
    templateKey.includes("billing") ||
    templateKey.includes("client_payment");

  const configuredFromAddress = firstConfiguredValue([
    `NOTIFICATION_FROM_${normalizeEnvKeySegment(templateKey)}`,
    isBilling ? "NOTIFICATION_BILLING_FROM" : "",
    audienceScope === "notary" ? "NOTIFICATION_NOTARY_FROM" : "",
    audienceScope ? `NOTIFICATION_FROM_${normalizeEnvKeySegment(audienceScope)}` : "",
    "NOTIFICATION_SIGNATURE_FROM",
    "NOTIFICATION_DEFAULT_FROM",
    "RESEND_FROM_ADDRESS",
  ]);
  if (configuredFromAddress) {
    return configuredFromAddress;
  }

  if (isBilling) {
    return "DARCI Billing <billing@darciregistry.com>";
  }

  if (audienceScope === "notary") {
    return "DARCI Notarization <no-reply@darciregistry.com>";
  }

  return "DARCI Signatures <no-reply@darciregistry.com>";
};

const resolveReplyToAddress = () => {
  return firstConfiguredValue(["NOTIFICATION_REPLY_TO", "RESEND_REPLY_TO_ADDRESS"]) ?? "support@darciregistry.com";
};

const enhanceMarkdownEmailHtml = (html: string) => {
  const withButtons = html.replace(
    /<p>\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/p>/g,
    (_match, href: string, label: string) =>
      `<p class="darci-cta-row"><a class="darci-button" href="${href}">${label}</a></p>`,
  );

  return withButtons.replace(/<a href=/g, '<a class="darci-inline-link" href=');
};

export const renderNotificationTemplate = (
  input: RenderNotificationTemplateInput,
): RenderedNotificationTemplate => {
  const { template, payload } = input;

  if (!template.subjectTemplate || !template.bodyTemplate) {
    throw new NotificationTemplateRenderError(
      `Template ${template.templateKey} is missing subjectTemplate or bodyTemplate`,
    );
  }

  const placeholders = [
    ...collectPlaceholders(template.subjectTemplate),
    ...collectPlaceholders(template.bodyTemplate),
  ];
  const missingVariables = Array.from(
    new Set(placeholders.filter((key) => payload[String(key)] == null)),
  ).sort();

  const subject = interpolate(template.subjectTemplate, payload);
  const text = interpolate(template.bodyTemplate, payload);

  const bodyHtml =
    template.bodyFormat === "html"
      ? text
      : template.bodyFormat === "markdown"
        ? enhanceMarkdownEmailHtml(marked(text) as string)
        : `<pre style="white-space:pre-wrap;font-family:inherit;">${text}</pre>`;

  const recipientEmail = input.recipientEmail?.trim() || null;
  const recipientDisplayName = input.recipientDisplayName?.trim() || null;

  return {
    from: resolveFromAddress(template.audienceScope, template.templateKey),
    replyTo: resolveReplyToAddress(),
    to: recipientEmail
      ? recipientDisplayName
        ? `${recipientDisplayName} <${recipientEmail}>`
        : recipientEmail
      : null,
    subject,
    html: wrapEmailHtml(bodyHtml),
    text,
    missingVariables,
  };
};
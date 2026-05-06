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
const STAGING_APP_BASE_URL = "https://app.staging.darciregistry.com";

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
  return `${STAGING_APP_BASE_URL}/icons/navbar/darci_white.svg`;
};

const wrapEmailHtml = (bodyHtml: string): string => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      .darci-content p {
        margin: 0 0 18px;
      }
      .darci-content p:last-child {
        margin-bottom: 0;
      }
      .darci-content strong {
        color: #191919;
        font-weight: 500;
      }
      .darci-content a {
        display: inline-block;
        margin: 6px 0 8px;
        padding: 13px 18px;
        background: #0aff4a;
        color: #191919 !important;
        text-decoration: none;
        font-weight: 500;
        border: 0;
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
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f2f2f2;font-family:Arial,'Helvetica Neue',sans-serif;font-weight:500;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;padding:40px 16px;">
      <tr>
        <td align="center">
          <table width="640" cellpadding="0" cellspacing="0"
            style="background:#ffffff;border:1px solid #d8d8d8;max-width:640px;width:100%;">
            <tr>
              <td style="padding:28px 34px;background:#000000;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="left">
                      <img src="${getEmailLogoUrl()}" width="91" height="20" alt="DARCi" style="display:block;border:0;outline:none;text-decoration:none;width:91px;height:auto;color:#ffffff;font-size:16px;line-height:20px;" />
                    </td>
                    <td align="right" style="font-size:12px;line-height:16px;color:#ffffff;font-weight:500;">
                      Signature request
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px;color:#191919;font-size:14px;line-height:1.65;font-weight:500;">
                <div class="darci-content">
                  ${bodyHtml}
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#f2f2f2;padding:22px 34px;border-top:1px solid #d8d8d8;">
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
        ? (marked(text) as string)
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
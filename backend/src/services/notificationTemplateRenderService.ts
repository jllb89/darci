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

const wrapEmailHtml = (bodyHtml: string): string => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0"
            style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
            <tr>
              <td style="background:#0f172a;padding:24px 32px;">
                <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">DARCI Registry</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1e293b;font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#94a3b8;font-size:12px;">
                  DARCI Registry &mdash; Trust &amp; Notarization Platform<br/>
                  Questions? Reply to this email or contact
                  <a href="mailto:support@darciregistry.com" style="color:#64748b;">support@darciregistry.com</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

const resolveFromAddress = (audienceScope: string | null, templateKey: string): string => {
  const isBilling =
    templateKey.includes("payment") ||
    templateKey.includes("billing") ||
    templateKey.includes("client_payment");

  if (isBilling) {
    return "DARCI Billing <billing@darciregistry.com>";
  }

  if (audienceScope === "notary") {
    return "DARCI Notarization <no-reply@darciregistry.com>";
  }

  return "DARCI Signatures <no-reply@darciregistry.com>";
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
    replyTo: "support@darciregistry.com",
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
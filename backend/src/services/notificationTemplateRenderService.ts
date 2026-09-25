import { marked } from "marked";
import {emailButtonStyle, escapeEmailHtml, renderEmailLayout} from "./emailLayoutService";

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
  return firstConfiguredValue(["NOTIFICATION_REPLY_TO", "RESEND_REPLY_TO_ADDRESS"]) ?? "lopezb.jl@gmail.com";
};

const enhanceMarkdownEmailHtml = (html: string, templateKey: string) => {
  // Older database templates put the review URL inside a sentence rather than
  // a standalone Markdown link. Give it a useful label without modifying its URL.
  const labeled = templateKey === "document_ready_for_review_email"
    ? html.replace(/<p>Your documents are ready for review\.<\/p>\s*/, "")
      .replace(/<ul>\s*<li>Your DARCi Team<\/li>\s*<\/ul>/, "")
      .replace(/<a href="([^"]+)">https?:\/\/[^<]+<\/a>/g,
        (_match, href: string) => `<br/><a class="darci-button" style="${emailButtonStyle};margin-top:20px;" href="${href}">Review documents&nbsp;↗</a>`)
    : html;
  const withButtons = labeled.replace(
    /<p>\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/p>/g,
    (_match, href: string, label: string) =>
      `<p class="darci-cta-row"><a class="darci-button" style="${emailButtonStyle}" href="${href}">${label}</a></p>`,
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
        ? enhanceMarkdownEmailHtml(marked(text) as string, template.templateKey)
        : `<div style="white-space:pre-wrap;font-family:inherit;">${escapeEmailHtml(text)}</div>`;

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
    html: renderEmailLayout({subject, bodyHtml, replyTo: resolveReplyToAddress()}),
    text,
    missingVariables,
  };
};

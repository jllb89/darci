/**
 * One-shot test sender for the two contact-exchange notification emails.
 * Usage:
 *   NODE_OPTIONS='' DOTENV_CONFIG_PATH=../.env.staging node -r dotenv/config -r ts-node/register scripts/send-test-contact-emails.ts --to=lopezb.jl@gmail.com
 */

import { Resend } from "resend";
import { renderNotificationTemplate } from "../src/services/notificationTemplateRenderService";

const getArgValue = (flag: string): string | null => {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  return arg ? arg.split("=").slice(1).join("=") : null;
};

const notaryApprovalReceivedTemplate = {
  templateKey: "notary_approval_received_email",
  audienceScope: "client",
  subjectTemplate: "Your notarization request was approved — contact details inside",
  bodyTemplate: [
    "<p>Hi {{firstName}},</p>",
    "<p>{{illuminotaryName}} reviewed and approved your <strong>{{documentName}}</strong>.<br/>Their contact details are below so you can coordinate next steps.</p>",
    "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f9f9f9;border:1px solid #e0e0e0;margin:24px 0;\"><tr><td style=\"padding:20px 24px;\">",
    "<p style=\"margin:0 0 2px;font-size:11px;color:#7f7f7f;text-transform:uppercase;letter-spacing:0.5px;\">Your illuminotary</p>",
    "<p style=\"margin:0 0 16px;font-size:16px;font-weight:600;color:#191919;\">{{notaryName}}</p>",
    "<table cellpadding=\"0\" cellspacing=\"0\" style=\"width:100%;\"><tr>",
    "<td style=\"padding:0 8px 0 0;width:50%;\"><a href=\"mailto:{{notaryEmail}}\" style=\"display:block;padding:10px 0;background:#0aff4a;color:#191919;text-align:center;text-decoration:none;font-size:13px;font-weight:600;\">Email</a></td>",
    "<td style=\"width:50%;\"><a href=\"{{notaryPhoneHref}}\" style=\"display:block;padding:10px 0;background:#191919;color:#ffffff;text-align:center;text-decoration:none;font-size:13px;font-weight:600;\">Call</a></td>",
    "</tr></table>",
    "<p style=\"margin:14px 0 0;font-size:12px;color:#7f7f7f;\">{{notaryEmail}} &nbsp;&bull;&nbsp; {{notaryPhone}}</p>",
    "</td></tr></table>",
    "<a href=\"{{nextStepUrl}}\" style=\"display:block;padding:14px 0;background:#0aff4a;color:#191919;text-align:center;text-decoration:none;font-size:14px;font-weight:600;margin:8px 0 24px;\">Open your request &rarr;</a>",
    "<p style=\"margin:0;color:#7f7f7f;font-size:12px;\">— Your DARCi Team</p>",
  ].join("\n"),
  bodyFormat: "html" as const,
};

const notaryMemberContactTemplate = {
  templateKey: "notary_member_contact_received_email",
  audienceScope: "notary",
  subjectTemplate: "Member contact details — {{documentName}}",
  bodyTemplate: [
    "<p>Hi {{firstName}},</p>",
    "<p>You approved <strong>{{documentName}}</strong>.<br/>The member's contact details are ready so you can coordinate the signing meeting.</p>",
    "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f9f9f9;border:1px solid #e0e0e0;margin:24px 0;\"><tr><td style=\"padding:20px 24px;\">",
    "<p style=\"margin:0 0 2px;font-size:11px;color:#7f7f7f;text-transform:uppercase;letter-spacing:0.5px;\">Member</p>",
    "<p style=\"margin:0 0 16px;font-size:16px;font-weight:600;color:#191919;\">{{memberName}}</p>",
    "<table cellpadding=\"0\" cellspacing=\"0\" style=\"width:100%;\"><tr>",
    "<td style=\"padding:0 8px 0 0;width:50%;\"><a href=\"mailto:{{memberEmail}}\" style=\"display:block;padding:10px 0;background:#0aff4a;color:#191919;text-align:center;text-decoration:none;font-size:13px;font-weight:600;\">Email</a></td>",
    "<td style=\"width:50%;\"><a href=\"{{memberPhoneHref}}\" style=\"display:block;padding:10px 0;background:#191919;color:#ffffff;text-align:center;text-decoration:none;font-size:13px;font-weight:600;\">Call</a></td>",
    "</tr></table>",
    "<p style=\"margin:14px 0 0;font-size:12px;color:#7f7f7f;\">{{memberEmail}} &nbsp;&bull;&nbsp; {{memberPhone}}</p>",
    "</td></tr></table>",
    "<a href=\"{{nextStepUrl}}\" style=\"display:block;padding:14px 0;background:#0aff4a;color:#191919;text-align:center;text-decoration:none;font-size:14px;font-weight:600;margin:8px 0 24px;\">Open the request &rarr;</a>",
    "<p style=\"margin:0;color:#7f7f7f;font-size:12px;\">— Your DARCi Team</p>",
  ].join("\n"),
  bodyFormat: "html" as const,
};

const approvalPayload = {
  firstName: "Jorge",
  illuminotaryName: "Sarah Chen",
  documentName: "Durable Power of Attorney",
  notaryName: "Sarah Chen, NP",
  notaryEmail: "sarah.chen@example.com",
  notaryPhone: "+1 (555) 234-5678",
  notaryPhoneHref: "tel:+15552345678",
  nextStepUrl: "https://app.staging.darciregistry.dev/app/requests/req-test-001",
};

const memberContactPayload = {
  firstName: "Sarah",
  documentName: "Durable Power of Attorney",
  memberName: "Jorge Lopez",
  memberEmail: "lopezb.jl@gmail.com",
  memberPhone: "+1 (555) 987-6543",
  memberPhoneHref: "tel:+15559876543",
  nextStepUrl: "https://app.staging.darciregistry.dev/app/notary/requests/req-test-001",
};

const main = async () => {
  const to = getArgValue("--to") ?? "lopezb.jl@gmail.com";
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    console.error("ERROR: RESEND_API_KEY is not set in the environment.");
    process.exit(1);
  }

  const resend = new Resend(apiKey);

  const fromDefault =
    process.env.NOTIFICATION_DEFAULT_FROM?.trim() ??
    process.env.RESEND_FROM_ADDRESS?.trim() ??
    "DARCI Signatures <no-reply@darciregistry.com>";

  const fromNotary =
    process.env.NOTIFICATION_NOTARY_FROM?.trim() ??
    fromDefault;

  // --- Email 1: Member receives notary contact ---
  const rendered1 = renderNotificationTemplate({
    template: notaryApprovalReceivedTemplate,
    payload: approvalPayload,
    recipientEmail: to,
    recipientDisplayName: approvalPayload.firstName,
  });

  console.log(`\n[1] Sending "notary_approval_received_email" → ${to}`);
  const result1 = await resend.emails.send({
    from: fromDefault,
    to,
    subject: rendered1.subject,
    html: rendered1.html,
    text: rendered1.text,
    replyTo: "support@darciregistry.com",
    tags: [{ name: "template_key", value: "notary_approval_received_email" }, { name: "test", value: "true" }],
  });

  if (result1.error) {
    console.error("  FAILED:", result1.error.message);
  } else {
    console.log("  OK — message id:", result1.data?.id);
    if (rendered1.missingVariables.length > 0) {
      console.warn("  Missing variables:", rendered1.missingVariables.join(", "));
    }
  }

  // --- Email 2: Notary receives member contact ---
  const rendered2 = renderNotificationTemplate({
    template: notaryMemberContactTemplate,
    payload: memberContactPayload,
    recipientEmail: to,
    recipientDisplayName: memberContactPayload.firstName,
  });

  console.log(`\n[2] Sending "notary_member_contact_received_email" → ${to}`);
  const result2 = await resend.emails.send({
    from: fromNotary,
    to,
    subject: rendered2.subject,
    html: rendered2.html,
    text: rendered2.text,
    replyTo: "support@darciregistry.com",
    tags: [{ name: "template_key", value: "notary_member_contact_received_email" }, { name: "test", value: "true" }],
  });

  if (result2.error) {
    console.error("  FAILED:", result2.error.message);
  } else {
    console.log("  OK — message id:", result2.data?.id);
    if (rendered2.missingVariables.length > 0) {
      console.warn("  Missing variables:", rendered2.missingVariables.join(", "));
    }
  }

  console.log("\nDone.");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

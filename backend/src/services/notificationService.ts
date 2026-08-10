import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  resolveEmailNotificationProvider,
  resolvePushNotificationProvider,
  resolveSmsNotificationProvider,
} from "./notificationProviderPolicy";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type NotificationChannel = "email" | "sms" | "in_app" | "push";
type NotificationJobKind =
  | "invite"
  | "invite_reminder"
  | "status_update"
  | "payment_request"
  | "notary_code"
  | "completion"
  | "transactional"
  | "custom";

type NotificationTemplateRecord = {
  id: string;
  template_key: string;
  channel: NotificationChannel;
  trigger_event: string | null;
};

type NotificationJobRecord = {
  id: string;
};

type NotificationDeliveryRecord = {
  id: string;
  provider: string | null;
};

type DevicePushTokenRecord = {
  id: string;
  user_id: string;
  environment: "sandbox" | "production";
  app_bundle_id: string;
  permission_status: string;
};

type FallbackNotificationTemplate = {
  template_key: string;
  template_version: string;
  locale: string;
  channel: NotificationChannel;
  template_kind: string;
  audience_scope: string;
  trigger_event: string;
  invite_kind: null;
  subject_template: string;
  body_template: string;
  body_format: string;
  variables_schema: Record<string, unknown>;
  is_active: boolean;
  source_reference: string;
  metadata: Record<string, unknown>;
};

type NotificationUserRecord = {
  id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
};

type NotificationUserRow = NotificationUserRecord & {
  role?: string | null;
  status?: string | null;
};

type NotificationDocumentRecord = {
  id: string;
  owner_id: string;
  document_type: string | null;
  product_flow_mode: string | null;
  jurisdiction: string | null;
  idn: string | null;
};

type NotificationRecipient = {
  targetUserId?: string | null;
  email?: string | null;
  phone?: string | null;
  displayName?: string | null;
  devicePushTokenId?: string | null;
  metadata?: Record<string, unknown>;
};

type QueueTemplatedNotificationInput = {
  templateKey: string;
  jobKind: NotificationJobKind;
  dedupeKey?: string | undefined;
  documentId?: string | undefined;
  billingPaymentRequestId?: string | undefined;
  notarizationRequestId?: string | undefined;
  requestedBySupabaseUserId?: string | undefined;
  payload: Record<string, unknown>;
  recipients: NotificationRecipient[];
  metadata?: Record<string, unknown> | undefined;
};

type QueueNotificationResult = {
  jobId: string;
  deliveryCount: number;
  existing: boolean;
  jobIds?: string[];
  channelResults?: Partial<Record<NotificationChannel, QueueNotificationResult>>;
};

const fallbackNotificationTemplates: Record<string, FallbackNotificationTemplate> = {
  notary_request_received_email: {
    template_key: "notary_request_received_email",
    template_version: "2026.06.03.v1",
    locale: "en-US",
    channel: "email",
    template_kind: "status_update",
    audience_scope: "notary",
    trigger_event: "member.notary_selected",
    invite_kind: null,
    subject_template: "New notarization request ready for review",
    body_template: [
      "Hi {{firstName}},",
      "",
      "{{memberName}} selected you to review a {{documentName}} in {{jurisdiction}}.",
      "",
      "Open your notary workspace to review the request:",
      "",
      "[Review request]({{reviewRequestUrl}})",
      "",
      "- Your DARCi Team",
    ].join("\n"),
    body_format: "markdown",
    variables_schema: {
      required: ["firstName", "memberName", "documentName", "jurisdiction", "reviewRequestUrl"],
      optional: ["dashboardUrl", "requestId", "documentId"],
      scope: [11],
    },
    is_active: true,
    source_reference: "docs/notarization-selected-notary-handoff-roadmap.md",
    metadata: { seed_source: "runtime_selected_notary_request_fallback" },
  },
  notary_application_approved_email: {
    template_key: "notary_application_approved_email",
    template_version: "2026.05.28.v1",
    locale: "en-US",
    channel: "email",
    template_kind: "status_update",
    audience_scope: "client",
    trigger_event: "notary.application_approved",
    invite_kind: null,
    subject_template: "Your notary profile request was approved",
    body_template: [
      "Hi {{firstName}},",
      "",
      "Your request to become a notary was approved.",
      "",
      "Open your profile settings to review your notary information and finish setup:",
      "",
      "[Open notary settings]({{nextStepUrl}})",
      "",
      "{{approvalSummary}}",
      "",
      "- Your DARCi Team",
    ].join("\n"),
    body_format: "markdown",
    variables_schema: {
      required: ["firstName", "nextStepUrl"],
      optional: ["approvalSummary", "dashboardUrl"],
      scope: [11],
    },
    is_active: true,
    source_reference: "runtime:notary_application_approved_email",
    metadata: { seed_source: "runtime_notary_application_decision_fallback" },
  },
  notary_application_rejected_email: {
    template_key: "notary_application_rejected_email",
    template_version: "2026.05.28.v1",
    locale: "en-US",
    channel: "email",
    template_kind: "status_update",
    audience_scope: "client",
    trigger_event: "notary.application_rejected",
    invite_kind: null,
    subject_template: "Update on your notary profile request",
    body_template: [
      "Hi {{firstName}},",
      "",
      "Thanks for submitting your notary profile request. After review, we are not able to approve it at this time.",
      "",
      "Review your profile settings here:",
      "",
      "[Open notary settings]({{nextStepUrl}})",
      "",
      "{{rejectionSummary}}",
      "",
      "If you have questions, reply to this email and our team can help.",
      "",
      "- Your DARCi Team",
    ].join("\n"),
    body_format: "markdown",
    variables_schema: {
      required: ["firstName", "nextStepUrl"],
      optional: ["rejectionSummary", "dashboardUrl"],
      scope: [11],
    },
    is_active: true,
    source_reference: "runtime:notary_application_rejected_email",
    metadata: { seed_source: "runtime_notary_application_decision_fallback" },
  },
  notary_approval_received_email: {
    template_key: "notary_approval_received_email",
    template_version: "2026.06.05.v1",
    locale: "en-US",
    channel: "email",
    template_kind: "status_update",
    audience_scope: "client",
    trigger_event: "notary.request_approved",
    invite_kind: null,
    subject_template: "Your notarization request was approved — contact details inside",
    body_template: [
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
    body_format: "html",
    variables_schema: {
      required: [
        "firstName",
        "illuminotaryName",
        "documentName",
        "notaryName",
        "notaryEmail",
        "notaryPhone",
        "notaryPhoneHref",
        "nextStepUrl",
      ],
      optional: ["approvalSummary", "continueUrl", "dashboardUrl"],
      scope: [11],
    },
    is_active: true,
    source_reference: "runtime:notary_approval_received_email",
    metadata: { seed_source: "runtime_notary_contact_exchange_fallback" },
  },
  notary_request_rejected_email: {
    template_key: "notary_request_rejected_email",
    template_version: "2026.06.17.v1",
    locale: "en-US",
    channel: "email",
    template_kind: "status_update",
    audience_scope: "client",
    trigger_event: "notary.request_rejected",
    invite_kind: null,
    subject_template: "Select a new illuminotary for {{documentName}}",
    body_template: [
      "<p>Hi {{firstName}},</p>",
      "<p>{{illuminotaryName}} cannot continue your request for <strong>{{documentName}}</strong>.</p>",
      "<p>Please choose another illuminotary to keep notarization moving.</p>",
      "<a href=\"{{nextStepUrl}}\" style=\"display:block;padding:14px 0;background:#0aff4a;color:#191919;text-align:center;text-decoration:none;font-size:14px;font-weight:600;margin:8px 0 24px;\">Select an illuminotary</a>",
      "<p style=\"margin:0;color:#7f7f7f;font-size:12px;\">— Your DARCi Team</p>",
    ].join("\n"),
    body_format: "html",
    variables_schema: {
      required: ["firstName", "illuminotaryName", "documentName", "nextStepUrl"],
      optional: ["rejectionSummary", "dashboardUrl"],
      scope: [11],
    },
    is_active: true,
    source_reference: "runtime:notary_request_rejected_email",
    metadata: { seed_source: "runtime_notary_request_rejected_fallback" },
  },
  in_person_session_started_email: {
    template_key: "in_person_session_started_email",
    template_version: "2026.06.09.v1",
    locale: "en-US",
    channel: "email",
    template_kind: "status_update",
    audience_scope: "client",
    trigger_event: "notary.meeting_started",
    invite_kind: null,
    subject_template: "Your in-person notarization session has started",
    body_template: [
      "<p>Hi {{firstName}},</p>",
      "<p>{{illuminotaryName}} started the in-person session for <strong>{{documentName}}</strong>.</p>",
      "<p>Open your request to check in from your device.</p>",
      "<a href=\"{{sessionUrl}}\" style=\"display:block;padding:14px 0;background:#0aff4a;color:#191919;text-align:center;text-decoration:none;font-size:14px;font-weight:600;margin:8px 0 24px;\">Open request</a>",
      "<p style=\"margin:0;color:#7f7f7f;font-size:12px;\">-- Your DARCi Team</p>",
    ].join("\n"),
    body_format: "html",
    variables_schema: {
      required: ["firstName", "illuminotaryName", "documentName", "sessionUrl"],
      optional: ["dashboardUrl", "requestId", "documentId"],
      scope: [11],
    },
    is_active: true,
    source_reference: "docs/in-person-session-completion-roadmap.md",
    metadata: { seed_source: "runtime_in_person_session_started_fallback" },
  },
  notary_member_contact_received_email: {
    template_key: "notary_member_contact_received_email",
    template_version: "2026.06.05.v1",
    locale: "en-US",
    channel: "email",
    template_kind: "status_update",
    audience_scope: "notary",
    trigger_event: "notary.request_approved",
    invite_kind: null,
    subject_template: "Member contact details — {{documentName}}",
    body_template: [
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
    body_format: "html",
    variables_schema: {
      required: [
        "firstName",
        "documentName",
        "memberName",
        "memberEmail",
        "memberPhone",
        "memberPhoneHref",
        "nextStepUrl",
      ],
      optional: ["approvalSummary", "continueUrl", "dashboardUrl", "illuminotaryName"],
      scope: [11],
    },
    is_active: true,
    source_reference: "runtime:notary_member_contact_received_email",
    metadata: { seed_source: "runtime_notary_contact_exchange_fallback" },
  },
};

const documentTypeLabels: Record<string, string> = {
  poa_general: "Power of Attorney",
  poa_durable: "Durable Power of Attorney",
  poa_medical: "Medical Power of Attorney",
  poa_limited: "Limited Power of Attorney",
  trust_rrr: "trust registration",
  trust_certification: "trust certification",
  acknowledgment: "acknowledgment",
  authentic_act: "authentic act",
  public_instrument: "public instrument",
};

export const queueNotaryApplicationApprovedNotification = async (input: {
  applicationId: string;
  userId: string;
  reviewedBySupabaseUserId: string;
  reviewNotes?: string | null;
}) => {
  try {
    const recipient = await getUserById(input.userId);
    if (!recipient?.email) {
      return null;
    }

    return await queueTemplatedNotification({
      templateKey: "notary_application_approved_email",
      jobKind: "status_update",
      dedupeKey: `notary_application_approved:${input.applicationId}`,
      requestedBySupabaseUserId: input.reviewedBySupabaseUserId,
      payload: {
        firstName: toFirstName(recipient),
        nextStepUrl: buildAppUrl("/app/settings"),
        dashboardUrl: buildAppUrl("/app/settings"),
        approvalSummary: input.reviewNotes?.trim() || null,
      },
      recipients: [buildOwnerRecipient(recipient)],
      metadata: {
        applicationId: input.applicationId,
        userId: input.userId,
        reviewNotes: input.reviewNotes?.trim() || null,
      },
    });
  } catch (error) {
    logNotificationFailure("notary_application_approved_email", error, {
      applicationId: input.applicationId,
      userId: input.userId,
      reviewedBySupabaseUserId: input.reviewedBySupabaseUserId,
    });
    return null;
  }
};

export const queueNotaryApplicationRejectedNotification = async (input: {
  applicationId: string;
  userId: string;
  reviewedBySupabaseUserId: string;
  reviewNotes?: string | null;
}) => {
  try {
    const recipient = await getUserById(input.userId);
    if (!recipient?.email) {
      return null;
    }

    return await queueTemplatedNotification({
      templateKey: "notary_application_rejected_email",
      jobKind: "status_update",
      dedupeKey: `notary_application_rejected:${input.applicationId}`,
      requestedBySupabaseUserId: input.reviewedBySupabaseUserId,
      payload: {
        firstName: toFirstName(recipient),
        nextStepUrl: buildAppUrl("/app/settings"),
        dashboardUrl: buildAppUrl("/app/settings"),
        rejectionSummary: input.reviewNotes?.trim() || null,
      },
      recipients: [buildOwnerRecipient(recipient)],
      metadata: {
        applicationId: input.applicationId,
        userId: input.userId,
        reviewNotes: input.reviewNotes?.trim() || null,
      },
    });
  } catch (error) {
    logNotificationFailure("notary_application_rejected_email", error, {
      applicationId: input.applicationId,
      userId: input.userId,
      reviewedBySupabaseUserId: input.reviewedBySupabaseUserId,
    });
    return null;
  }
};

export const queueNotaryApplicationSubmittedAdminNotification = async (input: {
  applicationId: string;
  applicantUserId: string;
  jurisdiction: string;
  serviceAreaKind: string;
  serviceAreaName: string;
  submittedAt: string;
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const [applicant, admins] = await Promise.all([
      getUserById(input.applicantUserId),
      listActiveAdminUsers(),
    ]);
    const recipients = admins.map(buildOwnerRecipient);

    if (recipients.length === 0) {
      return null;
    }

    const requestUrl = buildAppUrl("/admin/notary-requests", { requestId: input.applicationId });
    return await queueTemplatedNotification({
      templateKey: "notary_application_submitted_admin_email",
      jobKind: "transactional",
      dedupeKey: `notary_application_submitted_admin:${input.applicationId}:${input.submittedAt}`,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        applicantName: applicant ? toDisplayName(applicant) : "A member",
        applicantEmail: applicant?.email?.trim() || null,
        applicantPhone: applicant?.phone?.trim() || null,
        jurisdiction: input.jurisdiction,
        serviceAreaKind: humanizeToken(input.serviceAreaKind),
        serviceAreaName: input.serviceAreaName,
        submittedAt: input.submittedAt,
        requestUrl,
        dashboardUrl: requestUrl,
      },
      recipients,
      metadata: {
        applicationId: input.applicationId,
        applicantUserId: input.applicantUserId,
        jurisdiction: input.jurisdiction,
        serviceAreaKind: input.serviceAreaKind,
        serviceAreaName: input.serviceAreaName,
        preparedRoute: "/admin/notary-requests?requestId=:id",
      },
    });
  } catch (error) {
    logNotificationFailure("notary_application_submitted_admin_email", error, {
      applicationId: input.applicationId,
      applicantUserId: input.applicantUserId,
    });
    return null;
  }
};

const getApiBaseUrl = () => {
  return (
    process.env.API_BASE_URL?.trim() ??
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ??
    "http://localhost:4000"
  ).replace(/\/$/, "");
};

const getAppBaseUrl = () => {
  const candidates = [
    process.env.WEB_APP_URL,
    process.env.NEXT_PUBLIC_WEB_BASE_URL,
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_APP_BASE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ];

  for (const candidate of candidates) {
    const normalized = normalizePublicAppBaseUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return "https://app.staging.darciregistry.dev";
};

const normalizePublicAppBaseUrl = (value: string | undefined) => {
  const trimmedValue = value?.trim().replace(/\/+$/, "");
  if (!trimmedValue) {
    return null;
  }

  try {
    const url = new URL(trimmedValue);
    const host = url.hostname.toLowerCase();
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    if (["0.0.0.0", "localhost", "127.0.0.1", "::1"].includes(host)) {
      return null;
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
};

const buildAppUrl = (pathname: string, searchParams?: Record<string, string>) => {
  const url = new URL(pathname, `${getAppBaseUrl()}/`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
};

const buildDocumentDetailsUrl = (documentId: string) => {
  return buildAppUrl(`/app/documents/${encodeURIComponent(documentId)}`);
};

const buildReviewUrl = (documentId: string) => {
  return buildAppUrl("/app/review", { documentId });
};

const buildSignUrl = (documentId: string) => {
  return buildAppUrl("/app/sign", { documentId });
};

const buildVerificationApiUrl = (idn: string) => {
  return `${getApiBaseUrl()}/verify/${encodeURIComponent(idn)}`;
};

const toDisplayName = (user: NotificationUserRecord) => {
  const fullName = [user.first_name, user.last_name]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ");

  if (fullName) {
    return fullName;
  }

  return user.email?.trim() ?? "DARCi user";
};

const toFirstName = (user: NotificationUserRecord) => {
  if (user.first_name?.trim()) {
    return user.first_name.trim();
  }

  const emailPrefix = user.email?.split("@")[0]?.trim();
  if (emailPrefix) {
    return emailPrefix;
  }

  return "there";
};

const humanizeToken = (value: string) => {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const getDocumentLabel = (document: NotificationDocumentRecord) => {
  if (document.product_flow_mode === "trust_bundle") {
    return "trust registration";
  }

  if (document.product_flow_mode === "poa_only") {
    return "DARCi Dynamic POA";
  }

  if (document.product_flow_mode === "notarize_document") {
    return "document notarization";
  }

  if (document.document_type && documentTypeLabels[document.document_type]) {
    return documentTypeLabels[document.document_type];
  }

  if (document.document_type) {
    return humanizeToken(document.document_type);
  }

  return "document";
};

const buildOwnerRecipient = (user: NotificationUserRecord): NotificationRecipient => {
  return {
    targetUserId: user.id,
    email: user.email?.trim() ?? null,
    phone: user.phone?.trim() ?? null,
    displayName: toDisplayName(user),
  };
};

const toPhoneHref = (phone: string | null | undefined) => {
  const trimmed = phone?.trim();
  if (!trimmed) {
    return null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
};

const buildContactPayload = (user: NotificationUserRecord | null) => {
  if (!user) {
    return {
      name: null,
      email: null,
      phone: null,
      phoneHref: null,
    };
  }

  const phone = user.phone?.trim() ?? null;

  return {
    name: toDisplayName(user),
    email: user.email?.trim() ?? null,
    phone,
    phoneHref: toPhoneHref(phone),
  };
};

const toFirstNameFromNameOrEmail = (input: {
  displayName?: string | null;
  email?: string | null;
}) => {
  const firstName = input.displayName?.trim().split(/\s+/)[0]?.trim();
  if (firstName) {
    return firstName;
  }

  const emailPrefix = input.email?.split("@")[0]?.trim();
  if (emailPrefix) {
    return emailPrefix;
  }

  return "there";
};

const resolveRequestedByUserId = async (supabaseUserId?: string) => {
  if (!supabaseUserId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("supabase_user_id", supabaseUserId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data?.id as string | undefined) ?? null;
};

const getActiveTemplateByKey = async (
  templateKey: string,
  channel: NotificationChannel = "email",
) => {
  const loadTemplate = () => supabaseAdmin
    .from("notification_templates")
    .select("id, template_key, channel, trigger_event")
    .eq("template_key", templateKey)
    .eq("channel", channel)
    .eq("locale", "en-US")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { data, error } = await loadTemplate();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    return data as NotificationTemplateRecord;
  }

  const fallbackTemplate = channel === "email" ? fallbackNotificationTemplates[templateKey] : null;
  if (!fallbackTemplate) {
    return null;
  }

  const { error: insertError } = await supabaseAdmin
    .from("notification_templates")
    .upsert(fallbackTemplate, {
      onConflict: "template_key,template_version,locale,channel",
    });

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { data: seededTemplate, error: reloadError } = await loadTemplate();

  if (reloadError) {
    throw new Error(reloadError.message);
  }

  return (seededTemplate as NotificationTemplateRecord | null) ?? null;
};

const getNotificationJobByDedupeKey = async (dedupeKey: string) => {
  const { data, error } = await supabaseAdmin
    .from("notification_jobs")
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as NotificationJobRecord | null) ?? null;
};

const listActivePushDeviceTokensForUserIds = async (userIds: string[]) => {
  const uniqueUserIds = Array.from(
    new Set(userIds.map((userId) => userId.trim()).filter((userId) => userId.length > 0)),
  );
  if (uniqueUserIds.length === 0) {
    return [] as DevicePushTokenRecord[];
  }

  const { data, error } = await supabaseAdmin
    .from("device_push_tokens")
    .select("id, user_id, environment, app_bundle_id, permission_status")
    .in("user_id", uniqueUserIds)
    .eq("platform", "ios")
    .eq("provider", "apns")
    .eq("is_active", true)
    .not("device_token", "is", null)
    .in("permission_status", ["authorized", "provisional"])
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DevicePushTokenRecord[];
};

const insertNotificationJob = async (input: {
  template: NotificationTemplateRecord;
  jobKind: NotificationJobKind;
  dedupeKey?: string | undefined;
  documentId?: string | undefined;
  billingPaymentRequestId?: string | undefined;
  notarizationRequestId?: string | undefined;
  requestedByUserId?: string | null | undefined;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown> | undefined;
}) => {
  const queuedAt = new Date().toISOString();
  const jobPayload = {
    template_id: input.template.id,
    document_id: input.documentId ?? null,
    billing_payment_request_id: input.billingPaymentRequestId ?? null,
    notarization_request_id: input.notarizationRequestId ?? null,
    requested_by_user_id: input.requestedByUserId ?? null,
    job_kind: input.jobKind,
    channel: input.template.channel,
    status: input.template.channel === "in_app" ? "completed" : "queued",
    priority: "normal",
    dedupe_key: input.dedupeKey ?? null,
    scheduled_for: queuedAt,
    completed_at: input.template.channel === "in_app" ? queuedAt : null,
    payload_json: input.payload,
    metadata: {
      ...(input.metadata ?? {}),
      templateKey: input.template.template_key,
      triggerEvent: input.template.trigger_event,
      source: "runtime_notification_service",
    },
  };

  const { data, error } = await supabaseAdmin
    .from("notification_jobs")
    .insert(jobPayload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data as NotificationJobRecord;
};

const insertNotificationDeliveries = async (input: {
  jobId: string;
  channel: NotificationChannel;
  templateKey: string;
  recipients: NotificationRecipient[];
}) => {
  const queuedAt = new Date().toISOString();
  const deliveryStatus = input.channel === "in_app" ? "delivered" : "queued";
  const eventType = input.channel === "in_app" ? "delivered" : "queued";

  const getRecipientAddress = (recipient: NotificationRecipient) => {
    if (input.channel === "in_app" || input.channel === "push") {
      return null;
    }

    if (input.channel === "sms") {
      return recipient.phone?.trim() ?? null;
    }

    return recipient.email?.trim() ?? null;
  };

  const resolveProvider = (recipient: NotificationRecipient, index: number) => {
    const rolloutKey =
      recipient.targetUserId ??
      recipient.email?.trim().toLowerCase() ??
      recipient.phone?.trim() ??
      `${input.jobId}:${index}`;

    if (input.channel === "email") {
      return resolveEmailNotificationProvider({ rolloutKey }).provider;
    }

    if (input.channel === "sms") {
      return resolveSmsNotificationProvider({ rolloutKey }).provider;
    }

    if (input.channel === "push") {
      return resolvePushNotificationProvider({ rolloutKey }).provider;
    }

    return "internal";
  };

  const deliveriesToInsert = input.recipients.map((recipient, index) => ({
    notification_job_id: input.jobId,
    target_user_id: recipient.targetUserId ?? null,
    device_push_token_id: input.channel === "push" ? (recipient.devicePushTokenId ?? null) : null,
    channel: input.channel,
    recipient_address: getRecipientAddress(recipient),
    recipient_display_name: recipient.displayName ?? null,
    provider: resolveProvider(recipient, index),
    status: deliveryStatus,
    attempt_number: 1,
    queued_at: queuedAt,
    sent_at: input.channel === "in_app" ? queuedAt : null,
    delivered_at: input.channel === "in_app" ? queuedAt : null,
    metadata: {
      ...(recipient.metadata ?? {}),
      templateKey: input.templateKey,
      recipientIndex: index,
      source: "runtime_notification_service",
    },
  }));

  const { data, error } = await supabaseAdmin
    .from("notification_deliveries")
    .insert(deliveriesToInsert)
    .select("id, provider");

  if (error) {
    throw new Error(error.message);
  }

  const deliveries = (data ?? []) as NotificationDeliveryRecord[];
  if (deliveries.length > 0) {
    const { error: eventError } = await supabaseAdmin
      .from("outbound_message_events")
      .insert(
        deliveries.map((delivery) => ({
          notification_delivery_id: delivery.id,
          event_type: eventType,
          provider: delivery.provider ?? "internal",
          event_at: queuedAt,
          payload: {
            templateKey: input.templateKey,
            channel: input.channel,
          },
          metadata: {
            source: "runtime_notification_service",
          },
        })),
      );

    if (eventError) {
      throw new Error(eventError.message);
    }
  }

  return deliveries;
};

const filterRecipientsForChannel = (
  recipients: NotificationRecipient[],
  channel: NotificationChannel,
) => recipients.filter((recipient) => {
  if (channel === "email") {
    return Boolean(recipient.email?.trim());
  }

  if (channel === "sms") {
    return Boolean(recipient.phone?.trim());
  }

  if (channel === "push") {
    return Boolean(recipient.targetUserId && recipient.devicePushTokenId);
  }

  return Boolean(recipient.targetUserId);
});

const buildPushRecipients = async (recipients: NotificationRecipient[]) => {
  const recipientsByUserId = new Map<string, NotificationRecipient>();
  for (const recipient of recipients) {
    const targetUserId = recipient.targetUserId?.trim();
    if (!targetUserId || recipientsByUserId.has(targetUserId)) {
      continue;
    }

    recipientsByUserId.set(targetUserId, recipient);
  }

  const tokens = await listActivePushDeviceTokensForUserIds(Array.from(recipientsByUserId.keys()));
  return tokens.map((token) => {
    const sourceRecipient = recipientsByUserId.get(token.user_id);
    return {
      targetUserId: token.user_id,
      displayName: sourceRecipient?.displayName ?? null,
      devicePushTokenId: token.id,
      metadata: {
        ...(sourceRecipient?.metadata ?? {}),
        tokenEnvironment: token.environment,
        appBundleId: token.app_bundle_id,
        permissionStatus: token.permission_status,
      },
    } satisfies NotificationRecipient;
  });
};

const queueSingleChannelTemplatedNotification = async (
  input: QueueTemplatedNotificationInput & {
    channel: NotificationChannel;
    dedupeKey?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
    recipients: NotificationRecipient[];
  },
): Promise<QueueNotificationResult | null> => {
  const template = await getActiveTemplateByKey(input.templateKey, input.channel);
  if (!template) {
    console.warn("Notification template not found", {
      templateKey: input.templateKey,
      channel: input.channel,
    });
    return null;
  }

  const requestedByUserId = await resolveRequestedByUserId(input.requestedBySupabaseUserId);
  const recipients = filterRecipientsForChannel(input.recipients, template.channel);

  if (recipients.length === 0) {
    console.warn("Notification recipients missing delivery targets", {
      templateKey: input.templateKey,
      channel: template.channel,
      documentId: input.documentId ?? null,
      billingPaymentRequestId: input.billingPaymentRequestId ?? null,
      notarizationRequestId: input.notarizationRequestId ?? null,
    });
    return null;
  }

  try {
    const job = await insertNotificationJob({
      template,
      jobKind: input.jobKind,
      dedupeKey: input.dedupeKey,
      documentId: input.documentId,
      billingPaymentRequestId: input.billingPaymentRequestId,
      notarizationRequestId: input.notarizationRequestId,
      requestedByUserId,
      payload: input.payload,
      metadata: input.metadata,
    });

    const deliveries = await insertNotificationDeliveries({
      jobId: job.id,
      channel: template.channel,
      templateKey: input.templateKey,
      recipients,
    });

    return {
      jobId: job.id,
      deliveryCount: deliveries.length,
      existing: false,
    };
  } catch (error) {
    const duplicateCode =
      typeof error === "object" && error !== null && "code" in error
        ? ((error as { code?: string }).code ?? null)
        : null;

    if (duplicateCode === "23505" && input.dedupeKey) {
      const existingJob = await getNotificationJobByDedupeKey(input.dedupeKey);
      if (existingJob) {
        return {
          jobId: existingJob.id,
          deliveryCount: 0,
          existing: true,
        };
      }
    }

    throw error;
  }
};

const queuePushCompanionNotification = async (input: {
  source: QueueTemplatedNotificationInput;
  emailJobId: string;
  eventCorrelationId: string;
}) => {
  if (!input.source.dedupeKey) {
    return null;
  }

  const pushTemplate = await getActiveTemplateByKey(input.source.templateKey, "push");
  if (!pushTemplate) {
    return null;
  }

  const pushRecipients = await buildPushRecipients(input.source.recipients);
  if (pushRecipients.length === 0) {
    return null;
  }

  return queueSingleChannelTemplatedNotification({
    ...input.source,
    channel: "push",
    dedupeKey: `${input.source.dedupeKey}:push`,
    recipients: pushRecipients,
    metadata: {
      ...(input.source.metadata ?? {}),
      eventCorrelationId: input.eventCorrelationId,
      emailJobId: input.emailJobId,
      sourceEmailTemplateKey: input.source.templateKey,
      source: "runtime_notification_service_push_fanout",
    },
  });
};

const queueTemplatedNotification = async (
  input: QueueTemplatedNotificationInput,
): Promise<QueueNotificationResult | null> => {
  const eventCorrelationId =
    typeof input.metadata?.eventCorrelationId === "string"
      ? input.metadata.eventCorrelationId
      : randomUUID();

  const emailResult = await queueSingleChannelTemplatedNotification({
    ...input,
    channel: "email",
    metadata: {
      ...(input.metadata ?? {}),
      eventCorrelationId,
    },
  });

  if (!emailResult || emailResult.existing) {
    return emailResult;
  }

  try {
    const pushResult = await queuePushCompanionNotification({
      source: input,
      emailJobId: emailResult.jobId,
      eventCorrelationId,
    });

    if (!pushResult) {
      return emailResult;
    }

    return {
      ...emailResult,
      jobIds: [emailResult.jobId, pushResult.jobId],
      channelResults: {
        email: emailResult,
        push: pushResult,
      },
    };
  } catch (error) {
    logNotificationFailure("push_fanout", error, {
      templateKey: input.templateKey,
      dedupeKey: input.dedupeKey ?? null,
      emailJobId: emailResult.jobId,
    });
    return emailResult;
  }
};

const getUserById = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, email, phone, first_name, last_name")
    .eq("id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as NotificationUserRecord | null) ?? null;
};

const notificationUserSelect = "id, email, phone, first_name, last_name, role, status";

const toNotificationUserRecord = (row: NotificationUserRow): NotificationUserRecord => ({
  id: String(row.id),
  email: row.email == null ? null : String(row.email),
  phone: row.phone == null ? null : String(row.phone),
  first_name: row.first_name == null ? null : String(row.first_name),
  last_name: row.last_name == null ? null : String(row.last_name),
});

const isActiveNotificationUser = (row: NotificationUserRow) => {
  return (row.status ?? "active") === "active";
};

const hasNotificationEmail = (row: NotificationUserRow) => {
  return typeof row.email === "string" && row.email.trim().length > 0;
};

const listActiveAdminUsers = async () => {
  const { data: legacyAdmins, error: legacyError } = await supabaseAdmin
    .from("users")
    .select(notificationUserSelect)
    .eq("role", "admin");

  if (legacyError) {
    throw new Error(legacyError.message);
  }

  const { data: activeAdminRoles, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .eq("status", "active");

  if (roleError) {
    throw new Error(roleError.message);
  }

  const assignedAdminUserIds = Array.from(
    new Set(
      (activeAdminRoles ?? [])
        .map((row: { user_id?: unknown }) => (typeof row.user_id === "string" ? row.user_id : null))
        .filter((userId): userId is string => Boolean(userId)),
    ),
  );

  const assignedAdmins = assignedAdminUserIds.length > 0
    ? await supabaseAdmin
        .from("users")
        .select(notificationUserSelect)
        .in("id", assignedAdminUserIds)
    : { data: [], error: null };

  if (assignedAdmins.error) {
    throw new Error(assignedAdmins.error.message);
  }

  const usersById = new Map<string, NotificationUserRecord>();
  for (const row of [
    ...((legacyAdmins ?? []) as NotificationUserRow[]),
    ...((assignedAdmins.data ?? []) as NotificationUserRow[]),
  ]) {
    if (!isActiveNotificationUser(row) || !hasNotificationEmail(row)) {
      continue;
    }

    usersById.set(String(row.id), toNotificationUserRecord(row));
  }

  return Array.from(usersById.values()).sort((left, right) =>
    (left.email ?? "").localeCompare(right.email ?? ""),
  );
};

const getDocumentById = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("id, owner_id, document_type, product_flow_mode, jurisdiction, idn")
    .eq("id", documentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as NotificationDocumentRecord | null) ?? null;
};

const logNotificationFailure = (
  notificationKind: string,
  error: unknown,
  metadata?: Record<string, unknown>,
) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn("Notification queue failed", {
    notificationKind,
    message,
    ...(metadata ?? {}),
  });
};

export const queueDocumentReadyForReviewNotification = async (input: {
  documentId: string;
  documentVersionId?: string | undefined;
  generationRunId?: string | undefined;
  reviewSource?: string | undefined;
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const document = await getDocumentById(input.documentId);
    if (!document) {
      return null;
    }

    const owner = await getUserById(document.owner_id);
    if (!owner) {
      return null;
    }

    return await queueTemplatedNotification({
      templateKey: "document_ready_for_review_email",
      jobKind: "status_update",
      dedupeKey: `document_ready_for_review:${document.id}`,
      documentId: document.id,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstName(owner),
        reviewUrl: buildReviewUrl(document.id),
        documentName: getDocumentLabel(document),
      },
      recipients: [buildOwnerRecipient(owner)],
      metadata: {
        documentVersionId: input.documentVersionId ?? null,
        generationRunId: input.generationRunId ?? null,
        reviewSource: input.reviewSource ?? null,
      },
    });
  } catch (error) {
    logNotificationFailure("document_ready_for_review_email", error, {
      documentId: input.documentId,
    });
    return null;
  }
};

export const queueDocumentSigningPreparedNotification = async (input: {
  documentId: string;
  approvedAt: string;
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const document = await getDocumentById(input.documentId);
    if (!document) {
      return null;
    }

    const owner = await getUserById(document.owner_id);
    if (!owner) {
      return null;
    }

    return await queueTemplatedNotification({
      templateKey: "member_signing_ready_email",
      jobKind: "status_update",
      dedupeKey: `document_signing_prepared:${document.id}`,
      documentId: document.id,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstName(owner),
        signUrl: buildSignUrl(document.id),
        documentName: getDocumentLabel(document),
      },
      recipients: [buildOwnerRecipient(owner)],
      metadata: {
        approvedAt: input.approvedAt,
      },
    });
  } catch (error) {
    logNotificationFailure("member_signing_ready_email", error, {
      documentId: input.documentId,
    });
    return null;
  }
};

export const queueMemberSignaturesRecordedNotification = async (input: {
  documentId: string;
  confirmedAt: string;
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const document = await getDocumentById(input.documentId);
    if (!document) {
      return null;
    }

    const owner = await getUserById(document.owner_id);
    if (!owner) {
      return null;
    }

    return await queueTemplatedNotification({
      templateKey: "member_signatures_recorded_email",
      jobKind: "completion",
      dedupeKey: `document_signatures_confirmed:${document.id}`,
      documentId: document.id,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstName(owner),
        documentName: getDocumentLabel(document),
        dashboardUrl: buildDocumentDetailsUrl(document.id),
      },
      recipients: [buildOwnerRecipient(owner)],
      metadata: {
        confirmedAt: input.confirmedAt,
      },
    });
  } catch (error) {
    logNotificationFailure("member_signatures_recorded_email", error, {
      documentId: input.documentId,
    });
    return null;
  }
};

export const queueSignerCompletionConfirmationNotification = async (input: {
  documentId: string;
  documentOutputSignerId: string;
  signatureId: string;
  signerEmail: string;
  signerName?: string | null | undefined;
  signerUserId?: string | null | undefined;
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const document = await getDocumentById(input.documentId);
    if (!document) {
      return null;
    }

    return await queueTemplatedNotification({
      templateKey: "signer_completion_confirmation_email",
      jobKind: "completion",
      dedupeKey: `signer_completion_confirmation:${document.id}:${input.documentOutputSignerId}`,
      documentId: document.id,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstNameFromNameOrEmail({
          displayName: input.signerName ?? null,
          email: input.signerEmail,
        }),
        documentName: getDocumentLabel(document),
      },
      recipients: [
        {
          targetUserId: input.signerUserId ?? null,
          email: input.signerEmail,
          displayName: input.signerName ?? null,
          metadata: {
            documentOutputSignerId: input.documentOutputSignerId,
            signatureId: input.signatureId,
          },
        },
      ],
      metadata: {
        documentOutputSignerId: input.documentOutputSignerId,
        signatureId: input.signatureId,
      },
    });
  } catch (error) {
    logNotificationFailure("signer_completion_confirmation_email", error, {
      documentId: input.documentId,
      documentOutputSignerId: input.documentOutputSignerId,
      signatureId: input.signatureId,
    });
    return null;
  }
};

export const queueSignerSignedUpdateNotification = async (input: {
  documentId: string;
  documentOutputSignerId: string;
  signatureId: string;
  signerName: string;
  remainingSignerCount: number;
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const document = await getDocumentById(input.documentId);
    if (!document) {
      return null;
    }

    const owner = await getUserById(document.owner_id);
    if (!owner) {
      return null;
    }

    return await queueTemplatedNotification({
      templateKey: "signer_signed_update_email",
      jobKind: "status_update",
      dedupeKey: `signer_signed_update:${document.id}:${input.documentOutputSignerId}`,
      documentId: document.id,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstName(owner),
        signerName: input.signerName,
        documentName: getDocumentLabel(document),
        dashboardUrl: buildDocumentDetailsUrl(document.id),
        remainingSignerCount: input.remainingSignerCount,
      },
      recipients: [buildOwnerRecipient(owner)],
      metadata: {
        documentOutputSignerId: input.documentOutputSignerId,
        signatureId: input.signatureId,
        remainingSignerCount: input.remainingSignerCount,
      },
    });
  } catch (error) {
    logNotificationFailure("signer_signed_update_email", error, {
      documentId: input.documentId,
      documentOutputSignerId: input.documentOutputSignerId,
      signatureId: input.signatureId,
    });
    return null;
  }
};

export const queueAllSignaturesCompleteNotification = async (input: {
  documentId: string;
  completedAt: string;
  requiresNotarization: boolean;
  nextDocumentStatus: string | null;
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const document = await getDocumentById(input.documentId);
    if (!document) {
      return null;
    }

    const owner = await getUserById(document.owner_id);
    if (!owner) {
      return null;
    }

    return await queueTemplatedNotification({
      templateKey: "all_signatures_complete_email",
      jobKind: "completion",
      dedupeKey: `all_signatures_complete:${document.id}`,
      documentId: document.id,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstName(owner),
        documentName: getDocumentLabel(document),
        nextStepUrl: buildDocumentDetailsUrl(document.id),
      },
      recipients: [buildOwnerRecipient(owner)],
      metadata: {
        completedAt: input.completedAt,
        requiresNotarization: input.requiresNotarization,
        nextDocumentStatus: input.nextDocumentStatus,
      },
    });
  } catch (error) {
    logNotificationFailure("all_signatures_complete_email", error, {
      documentId: input.documentId,
    });
    return null;
  }
};

export const queueNotarizationSubmissionConfirmationNotification = async (input: {
  documentId: string;
  requestId: string;
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const document = await getDocumentById(input.documentId);
    if (!document) {
      return null;
    }

    const owner = await getUserById(document.owner_id);
    if (!owner) {
      return null;
    }

    return await queueTemplatedNotification({
      templateKey: "notarization_submission_confirmation_email",
      jobKind: "status_update",
      dedupeKey: `notarization_submitted:${input.requestId}`,
      documentId: document.id,
      notarizationRequestId: input.requestId,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstName(owner),
        documentName: getDocumentLabel(document),
        dashboardUrl: buildDocumentDetailsUrl(document.id),
      },
      recipients: [buildOwnerRecipient(owner)],
      metadata: {
        requestId: input.requestId,
      },
    });
  } catch (error) {
    logNotificationFailure("notarization_submission_confirmation_email", error, {
      documentId: input.documentId,
      requestId: input.requestId,
    });
    return null;
  }
};

export const queueNotaryNextStepNotification = async (input: {
  documentId: string;
  requestId: string;
  codeId: string;
  codeValue: string;
  expiresAt: string | null;
  deliveryReason: "initial_submit" | "resent" | "regenerated";
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const document = await getDocumentById(input.documentId);
    if (!document) {
      return null;
    }

    const owner = await getUserById(document.owner_id);
    if (!owner) {
      return null;
    }

    const documentUrl = buildDocumentDetailsUrl(document.id);
    return await queueTemplatedNotification({
      templateKey: "notary_next_step_email",
      jobKind: "notary_code",
      dedupeKey:
        input.deliveryReason === "resent"
          ? undefined
          : `notary_next_step:${input.requestId}:${input.codeId}`,
      documentId: document.id,
      notarizationRequestId: input.requestId,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstName(owner),
        registrationLabel: getDocumentLabel(document),
        illuminotaryCode: input.codeValue,
        findIlluminotaryUrl: documentUrl,
        dashboardUrl: documentUrl,
        scheduleAppointmentUrl: documentUrl,
        documentName: getDocumentLabel(document),
      },
      recipients: [buildOwnerRecipient(owner)],
      metadata: {
        requestId: input.requestId,
        codeId: input.codeId,
        deliveryReason: input.deliveryReason,
        expiresAt: input.expiresAt,
      },
    });
  } catch (error) {
    logNotificationFailure("notary_next_step_email", error, {
      documentId: input.documentId,
      requestId: input.requestId,
      codeId: input.codeId,
      deliveryReason: input.deliveryReason,
    });
    return null;
  }
};

export const queueSelectedNotaryRequestNotification = async (input: {
  documentId: string;
  requestId: string;
  selectedNotaryUserId: string;
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const document = await getDocumentById(input.documentId);
    if (!document) {
      return null;
    }

    const [owner, selectedNotary] = await Promise.all([
      getUserById(document.owner_id),
      getUserById(input.selectedNotaryUserId),
    ]);
    if (!selectedNotary?.email) {
      return null;
    }

    const reviewRequestUrl = buildAppUrl("/start", {
      returnTo: "/app/notary?role=notary",
      intendedEmail: selectedNotary.email,
    });
    return await queueTemplatedNotification({
      templateKey: "notary_request_received_email",
      jobKind: "status_update",
      dedupeKey: `selected_notary_request:${input.requestId}:${input.selectedNotaryUserId}`,
      documentId: document.id,
      notarizationRequestId: input.requestId,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstName(selectedNotary),
        memberName: owner ? toDisplayName(owner) : "A member",
        documentName: getDocumentLabel(document),
        jurisdiction: document.jurisdiction?.trim() || "the document jurisdiction",
        reviewRequestUrl,
        dashboardUrl: reviewRequestUrl,
        requestId: input.requestId,
        documentId: document.id,
      },
      recipients: [buildOwnerRecipient(selectedNotary)],
      metadata: {
        requestId: input.requestId,
        selectedNotaryUserId: input.selectedNotaryUserId,
        documentId: document.id,
        reviewRequestPath: `/start?returnTo=${encodeURIComponent("/app/notary?role=notary")}&intendedEmail=${encodeURIComponent(selectedNotary.email)}`,
      },
    });
  } catch (error) {
    logNotificationFailure("notary_request_received_email", error, {
      documentId: input.documentId,
      requestId: input.requestId,
      selectedNotaryUserId: input.selectedNotaryUserId,
    });
    return null;
  }
};

export const queueNotaryRequestClaimedNotification = async (input: {
  documentId: string;
  requestId: string;
  notaryUserId: string;
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const document = await getDocumentById(input.documentId);
    if (!document) {
      return null;
    }

    const owner = await getUserById(document.owner_id);
    const notary = await getUserById(input.notaryUserId);
    if (!owner) {
      return null;
    }

    return await queueTemplatedNotification({
      templateKey: "notary_request_claimed_email",
      jobKind: "status_update",
      dedupeKey: `notary_request_claimed:${input.requestId}`,
      documentId: document.id,
      notarizationRequestId: input.requestId,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstName(owner),
        illuminotaryName: notary ? toDisplayName(notary) : "Your illuminotary",
        dashboardUrl: buildDocumentDetailsUrl(document.id),
        documentName: getDocumentLabel(document),
      },
      recipients: [buildOwnerRecipient(owner)],
      metadata: {
        requestId: input.requestId,
        notaryUserId: input.notaryUserId,
      },
    });
  } catch (error) {
    logNotificationFailure("notary_request_claimed_email", error, {
      documentId: input.documentId,
      requestId: input.requestId,
      notaryUserId: input.notaryUserId,
    });
    return null;
  }
};

export const queueNotaryChangesRequestedNotification = async (input: {
  documentId: string;
  requestId: string;
  notaryUserId: string;
  summary?: string | null | undefined;
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const document = await getDocumentById(input.documentId);
    if (!document) {
      return null;
    }

    const owner = await getUserById(document.owner_id);
    const notary = await getUserById(input.notaryUserId);
    if (!owner) {
      return null;
    }

    const dashboardUrl = buildDocumentDetailsUrl(document.id);
    return await queueTemplatedNotification({
      templateKey: "notary_changes_requested_email",
      jobKind: "status_update",
      documentId: document.id,
      notarizationRequestId: input.requestId,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstName(owner),
        illuminotaryName: notary ? toDisplayName(notary) : "Your illuminotary",
        changeSummary:
          input.summary?.trim() || "Your illuminotary left additional notes for this request.",
        reviewChangesUrl: dashboardUrl,
        dashboardUrl,
        documentName: getDocumentLabel(document),
      },
      recipients: [buildOwnerRecipient(owner)],
      metadata: {
        requestId: input.requestId,
        notaryUserId: input.notaryUserId,
        summary: input.summary?.trim() || null,
      },
    });
  } catch (error) {
    logNotificationFailure("notary_changes_requested_email", error, {
      documentId: input.documentId,
      requestId: input.requestId,
      notaryUserId: input.notaryUserId,
    });
    return null;
  }
};

export const queueNotaryRequestRejectedNotification = async (input: {
  documentId: string;
  requestId: string;
  notaryUserId: string;
  summary?: string | null | undefined;
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const document = await getDocumentById(input.documentId);
    if (!document) {
      return null;
    }

    const owner = await getUserById(document.owner_id);
    const notary = await getUserById(input.notaryUserId);
    if (!owner) {
      return null;
    }

    const dashboardUrl = buildDocumentDetailsUrl(document.id);
    return await queueTemplatedNotification({
      templateKey: "notary_request_rejected_email",
      jobKind: "status_update",
      documentId: document.id,
      notarizationRequestId: input.requestId,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstName(owner),
        illuminotaryName: notary ? toDisplayName(notary) : "Your illuminotary",
        rejectionSummary:
          input.summary?.trim() || "Please select another illuminotary to continue this request.",
        nextStepUrl: dashboardUrl,
        dashboardUrl,
        documentName: getDocumentLabel(document),
      },
      recipients: [buildOwnerRecipient(owner)],
      metadata: {
        requestId: input.requestId,
        notaryUserId: input.notaryUserId,
        summary: input.summary?.trim() || null,
      },
    });
  } catch (error) {
    logNotificationFailure("notary_request_rejected_email", error, {
      documentId: input.documentId,
      requestId: input.requestId,
      notaryUserId: input.notaryUserId,
    });
    return null;
  }
};

export const queueNotaryApprovalReceivedNotification = async (input: {
  documentId: string;
  requestId: string;
  notaryUserId: string;
  summary?: string | null | undefined;
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const document = await getDocumentById(input.documentId);
    if (!document) {
      return null;
    }

    const owner = await getUserById(document.owner_id);
    const notary = await getUserById(input.notaryUserId);
    if (!owner) {
      return null;
    }

    const memberRequestPath = `/app/requests/${encodeURIComponent(input.requestId)}`;
    const ownerUrl = buildAppUrl(`/open/requests/${encodeURIComponent(input.requestId)}`, {
      ...(owner.email ? { intendedEmail: owner.email } : {}),
    });
    const notaryRequestPath = `/app/notary/requests/${encodeURIComponent(input.requestId)}?role=notary`;
    const notaryUrl = buildAppUrl("/start", {
      returnTo: notaryRequestPath,
      ...(notary?.email ? { intendedEmail: notary.email } : {}),
    });
    const memberContact = buildContactPayload(owner);
    const notaryContact = buildContactPayload(notary);
    const ownerResult = await queueTemplatedNotification({
      templateKey: "notary_approval_received_email",
      jobKind: "status_update",
      dedupeKey: `notary_request_approved:${input.requestId}`,
      documentId: document.id,
      notarizationRequestId: input.requestId,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstName(owner),
        illuminotaryName: notary ? toDisplayName(notary) : "Your illuminotary",
        approvalSummary: input.summary?.trim() || null,
        continueUrl: ownerUrl,
        dashboardUrl: ownerUrl,
        nextStepUrl: ownerUrl,
        notaryName: notaryContact.name,
        notaryEmail: notaryContact.email,
        notaryPhone: notaryContact.phone,
        notaryPhoneHref: notaryContact.phoneHref,
        documentName: getDocumentLabel(document),
      },
      recipients: [buildOwnerRecipient(owner)],
      metadata: {
        requestId: input.requestId,
        notaryUserId: input.notaryUserId,
        memberRequestPath,
        summary: input.summary?.trim() || null,
        contactExchange: true,
      },
    });

    const notaryResult = notary
      ? await queueTemplatedNotification({
          templateKey: "notary_member_contact_received_email",
          jobKind: "status_update",
          dedupeKey: `notary_request_approved_notary:${input.requestId}`,
          documentId: document.id,
          notarizationRequestId: input.requestId,
          requestedBySupabaseUserId: input.requestedBySupabaseUserId,
          payload: {
            firstName: toFirstName(notary),
            illuminotaryName: toDisplayName(notary),
            approvalSummary: input.summary?.trim() || null,
            continueUrl: notaryUrl,
            dashboardUrl: notaryUrl,
            nextStepUrl: notaryUrl,
            memberName: memberContact.name,
            memberEmail: memberContact.email,
            memberPhone: memberContact.phone,
            memberPhoneHref: memberContact.phoneHref,
            documentName: getDocumentLabel(document),
          },
          recipients: [buildOwnerRecipient(notary)],
          metadata: {
            requestId: input.requestId,
            notaryUserId: input.notaryUserId,
            memberUserId: owner.id,
            summary: input.summary?.trim() || null,
            contactExchange: true,
          },
        })
      : null;

    const queuedJobIds = [ownerResult?.jobId, notaryResult?.jobId].filter(
      (jobId): jobId is string => Boolean(jobId && jobId.trim()),
    );

    if (ownerResult) {
      return {
        ...ownerResult,
        jobIds: queuedJobIds,
      };
    }

    if (notaryResult) {
      return {
        ...notaryResult,
        jobIds: queuedJobIds,
      };
    }

    return null;
  } catch (error) {
    logNotificationFailure("notary_approval_received_email", error, {
      documentId: input.documentId,
      requestId: input.requestId,
      notaryUserId: input.notaryUserId,
    });
    return null;
  }
};

export const queueInPersonSessionStartedNotification = async (input: {
  documentId: string;
  requestId: string;
  notaryUserId: string;
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const document = await getDocumentById(input.documentId);
    if (!document) {
      return null;
    }

    const owner = await getUserById(document.owner_id);
    const notary = await getUserById(input.notaryUserId);
    if (!owner) {
      return null;
    }

    const memberRequestPath = `/app/requests/${encodeURIComponent(input.requestId)}`;
    const sessionUrl = buildAppUrl(`/open/requests/${encodeURIComponent(input.requestId)}`, {
      ...(owner.email ? { intendedEmail: owner.email } : {}),
    });

    return await queueTemplatedNotification({
      templateKey: "in_person_session_started_email",
      jobKind: "status_update",
      dedupeKey: `in_person_session_started:${input.requestId}`,
      documentId: document.id,
      notarizationRequestId: input.requestId,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstName(owner),
        illuminotaryName: notary ? toDisplayName(notary) : "Your illuminotary",
        documentName: getDocumentLabel(document),
        sessionUrl,
        dashboardUrl: sessionUrl,
        requestId: input.requestId,
        documentId: document.id,
      },
      recipients: [buildOwnerRecipient(owner)],
      metadata: {
        requestId: input.requestId,
        notaryUserId: input.notaryUserId,
        memberRequestPath,
      },
    });
  } catch (error) {
    logNotificationFailure("in_person_session_started_email", error, {
      documentId: input.documentId,
      requestId: input.requestId,
      notaryUserId: input.notaryUserId,
    });
    return null;
  }
};

export const queueMeetingScheduledConfirmationNotification = async (input: {
  documentId: string;
  requestId: string;
  scheduledAt: string;
  meetingLocation?: string | null | undefined;
  requestedBySupabaseUserId?: string | undefined;
}) => {
  try {
    const document = await getDocumentById(input.documentId);
    if (!document) {
      return null;
    }

    const owner = await getUserById(document.owner_id);
    if (!owner) {
      return null;
    }

    return await queueTemplatedNotification({
      templateKey: "meeting_scheduled_confirmation_email",
      jobKind: "status_update",
      dedupeKey: `meeting_scheduled:${input.requestId}:${input.scheduledAt}`,
      documentId: document.id,
      notarizationRequestId: input.requestId,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstName(owner),
        documentName: getDocumentLabel(document),
        scheduledAt: input.scheduledAt,
        meetingLocation: input.meetingLocation?.trim() || "To be confirmed",
        meetingUrl: buildDocumentDetailsUrl(document.id),
      },
      recipients: [buildOwnerRecipient(owner)],
      metadata: {
        requestId: input.requestId,
        scheduledAt: input.scheduledAt,
        meetingLocation: input.meetingLocation?.trim() || null,
      },
    });
  } catch (error) {
    logNotificationFailure("meeting_scheduled_confirmation_email", error, {
      documentId: input.documentId,
      requestId: input.requestId,
      scheduledAt: input.scheduledAt,
    });
    return null;
  }
};

export const buildVerificationReadyPayload = async (documentId: string) => {
  const document = await getDocumentById(documentId);
  if (!document || !document.idn) {
    return null;
  }

  const owner = await getUserById(document.owner_id);
  if (!owner) {
    return null;
  }

  return {
    firstName: toFirstName(owner),
    verificationUrl: buildVerificationApiUrl(document.idn),
    dashboardUrl: buildDocumentDetailsUrl(document.id),
    documentName: getDocumentLabel(document),
  };
};
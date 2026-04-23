import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type NotificationChannel = "email" | "sms" | "in_app";
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
};

type NotificationUserRecord = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

type NotificationDocumentRecord = {
  id: string;
  owner_id: string;
  document_type: string | null;
  product_flow_mode: string | null;
  idn: string | null;
};

type NotificationRecipient = {
  targetUserId?: string | null;
  email?: string | null;
  displayName?: string | null;
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

const getApiBaseUrl = () => {
  return (
    process.env.API_BASE_URL?.trim() ??
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ??
    "http://localhost:4000"
  ).replace(/\/$/, "");
};

const getAppBaseUrl = () => {
  return (
    process.env.APP_BASE_URL?.trim() ??
    process.env.NEXT_PUBLIC_APP_BASE_URL?.trim() ??
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
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
    displayName: toDisplayName(user),
  };
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

const getActiveTemplateByKey = async (templateKey: string) => {
  const { data, error } = await supabaseAdmin
    .from("notification_templates")
    .select("id, template_key, channel, trigger_event")
    .eq("template_key", templateKey)
    .eq("locale", "en-US")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as NotificationTemplateRecord | null) ?? null;
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

  const deliveriesToInsert = input.recipients.map((recipient, index) => ({
    notification_job_id: input.jobId,
    target_user_id: recipient.targetUserId ?? null,
    channel: input.channel,
    recipient_address: input.channel === "in_app" ? null : recipient.email?.trim() ?? null,
    recipient_display_name: recipient.displayName ?? null,
    provider: "internal",
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
    .select("id");

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
          provider: "internal",
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

const queueTemplatedNotification = async (
  input: QueueTemplatedNotificationInput,
): Promise<QueueNotificationResult | null> => {
  const template = await getActiveTemplateByKey(input.templateKey);
  if (!template) {
    console.warn("Notification template not found", {
      templateKey: input.templateKey,
    });
    return null;
  }

  const requestedByUserId = await resolveRequestedByUserId(input.requestedBySupabaseUserId);
  const recipients = input.recipients.filter((recipient) => {
    if (template.channel === "email") {
      return Boolean(recipient.email?.trim());
    }

    return Boolean(recipient.targetUserId);
  });

  if (recipients.length === 0) {
    console.warn("Notification recipients missing delivery targets", {
      templateKey: input.templateKey,
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

const getUserById = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, email, first_name, last_name")
    .eq("id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as NotificationUserRecord | null) ?? null;
};

const getDocumentById = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("id, owner_id, document_type, product_flow_mode, idn")
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

export const queueNotaryApprovalReceivedNotification = async (input: {
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

    const dashboardUrl = buildDocumentDetailsUrl(document.id);
    return await queueTemplatedNotification({
      templateKey: "notary_approval_received_email",
      jobKind: "status_update",
      dedupeKey: `notary_request_approved:${input.requestId}`,
      documentId: document.id,
      notarizationRequestId: input.requestId,
      requestedBySupabaseUserId: input.requestedBySupabaseUserId,
      payload: {
        firstName: toFirstName(owner),
        illuminotaryName: notary ? toDisplayName(notary) : "Your illuminotary",
        continueUrl: dashboardUrl,
        dashboardUrl,
        documentName: getDocumentLabel(document),
      },
      recipients: [buildOwnerRecipient(owner)],
      metadata: {
        requestId: input.requestId,
        notaryUserId: input.notaryUserId,
      },
    });
  } catch (error) {
    logNotificationFailure("notary_approval_received_email", error, {
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
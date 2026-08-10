import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  getDocumentById,
  getDocumentOutputSignerById,
  listDocumentParties,
  type DocumentOutputSignerRecord,
  type DocumentPartyRecord,
  type DocumentRecord,
} from "./documentService";
import {
  createInviteAccessToken,
  type DocumentInviteStatus,
  type InviteClaimMode,
  type InviteTokenStatus,
} from "./inviteClaimService";
import { recordAuditEvent } from "./auditService";
import {
  resolveEmailNotificationProvider,
  resolvePushNotificationProvider,
} from "./notificationProviderPolicy";
import type { RequestRole } from "./userRoleService";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JsonObject = Record<string, unknown>;

type UserRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

type NotificationTemplateRow = {
  id: string;
  template_key: string;
  channel: "email" | "sms" | "in_app" | "push";
};

type DevicePushTokenRow = {
  id: string;
  user_id: string;
  environment: "sandbox" | "production";
  app_bundle_id: string;
  permission_status: string;
};

type DocumentInviteRow = {
  id: string;
  document_id: string;
  document_output_signer_id: string | null;
  document_party_id: string | null;
  created_by_user_id: string | null;
  claimed_user_id: string | null;
  template_id: string | null;
  invite_kind: string;
  access_scope: string;
  claim_mode: InviteClaimMode;
  status: DocumentInviteStatus;
  invite_label: string | null;
  recipient_name_snapshot: string | null;
  party_role_snapshot: string | null;
  obligation_type_snapshot: string | null;
  output_key_snapshot: string | null;
  document_key_snapshot: string | null;
  idempotency_key: string | null;
  requires_acceptance: boolean;
  expires_at: string | null;
  sent_at: string | null;
  first_opened_at: string | null;
  first_clicked_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  revoked_at: string | null;
  completed_at: string | null;
  delivery_count: number;
  resend_count: number;
  context_json: JsonObject;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
};

type InviteRecipientRow = {
  id: string;
  invite_id: string;
  target_user_id: string | null;
  channel: "email" | "sms" | "in_app";
  delivery_address: string | null;
  display_name: string | null;
  status: string;
  is_primary: boolean;
  last_notified_at: string | null;
  last_event_at: string | null;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
};

type InviteTokenRow = {
  id: string;
  invite_id: string;
  token_prefix: string | null;
  purpose: string;
  status: InviteTokenStatus;
  max_uses: number;
  use_count: number;
  expires_at: string;
  last_used_at: string | null;
  consumed_at: string | null;
  consumed_by_user_id: string | null;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
};

type InviteClaimRow = {
  id: string;
  invite_id: string;
  invite_token_id: string | null;
  claimed_user_id: string | null;
  created_user_id: string | null;
  claim_status: string;
  claim_method: string;
  claim_channel: string;
  claim_address: string | null;
  claimed_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
};

type NotificationJobRow = {
  id: string;
};

type NotificationDeliveryRow = {
  id: string;
};

const documentInviteSelect = [
  "id",
  "document_id",
  "document_output_signer_id",
  "document_party_id",
  "created_by_user_id",
  "claimed_user_id",
  "template_id",
  "invite_kind",
  "access_scope",
  "claim_mode",
  "status",
  "invite_label",
  "recipient_name_snapshot",
  "party_role_snapshot",
  "obligation_type_snapshot",
  "output_key_snapshot",
  "document_key_snapshot",
  "idempotency_key",
  "requires_acceptance",
  "expires_at",
  "sent_at",
  "first_opened_at",
  "first_clicked_at",
  "accepted_at",
  "declined_at",
  "revoked_at",
  "completed_at",
  "delivery_count",
  "resend_count",
  "context_json",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const inviteRecipientSelect = [
  "id",
  "invite_id",
  "target_user_id",
  "channel",
  "delivery_address",
  "display_name",
  "status",
  "is_primary",
  "last_notified_at",
  "last_event_at",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const inviteTokenSelect = [
  "id",
  "invite_id",
  "token_prefix",
  "purpose",
  "status",
  "max_uses",
  "use_count",
  "expires_at",
  "last_used_at",
  "consumed_at",
  "consumed_by_user_id",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const inviteClaimSelect = [
  "id",
  "invite_id",
  "invite_token_id",
  "claimed_user_id",
  "created_user_id",
  "claim_status",
  "claim_method",
  "claim_channel",
  "claim_address",
  "claimed_at",
  "accepted_at",
  "declined_at",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

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

const partyRoleLabels: Record<string, string> = {
  principal: "Principal",
  agent: "Agent",
  successor_agent: "Successor agent",
  grantor: "Trustmaker",
  trustee: "Trustee",
  successor_trustee: "Successor trustee",
};

export type DocumentInviteRecipient = {
  id: string;
  targetUserId: string | null;
  channel: "email" | "sms" | "in_app";
  deliveryAddress: string | null;
  displayName: string | null;
  status: string;
  isPrimary: boolean;
  lastNotifiedAt: string | null;
  lastEventAt: string | null;
};

export type DocumentInviteTokenInfo = {
  id: string;
  tokenPrefix: string | null;
  purpose: string;
  status: InviteTokenStatus;
  maxUses: number;
  useCount: number;
  expiresAt: string;
  lastUsedAt: string | null;
  consumedAt: string | null;
  consumedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentInviteClaimInfo = {
  id: string;
  inviteTokenId: string | null;
  claimedUserId: string | null;
  createdUserId: string | null;
  claimStatus: string;
  claimMethod: string;
  claimChannel: string;
  claimAddress: string | null;
  claimedAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentInviteDetail = {
  id: string;
  documentId: string;
  documentOutputSignerId: string | null;
  documentPartyId: string | null;
  createdByUserId: string | null;
  claimedUserId: string | null;
  templateId: string | null;
  inviteKind: string;
  accessScope: string;
  claimMode: InviteClaimMode;
  status: DocumentInviteStatus;
  inviteLabel: string | null;
  recipientName: string | null;
  partyRole: string | null;
  obligationType: string | null;
  outputKey: string | null;
  documentKey: string | null;
  requiresAcceptance: boolean;
  expiresAt: string | null;
  sentAt: string | null;
  firstOpenedAt: string | null;
  firstClickedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  revokedAt: string | null;
  completedAt: string | null;
  deliveryCount: number;
  resendCount: number;
  context: JsonObject;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
  recipients: DocumentInviteRecipient[];
  latestToken: DocumentInviteTokenInfo | null;
  latestClaim: DocumentInviteClaimInfo | null;
};

export type ListDocumentInvitesResponse = {
  invites: DocumentInviteDetail[];
  page: {
    limit: number;
    offset: number;
    total: number;
  };
};

export type SigningRequestCardDirection = "incoming" | "outgoing";

export type SigningRequestCard = {
  id: string;
  inviteId: string;
  direction: SigningRequestCardDirection;
  documentId: string;
  documentLabel: string;
  documentTypeLabel: string;
  signerName: string | null;
  signerEmail: string | null;
  signerPhone: string | null;
  senderName: string | null;
  senderEmail: string | null;
  roleLabel: string;
  status: DocumentInviteStatus;
  sentAt: string | null;
  updatedAt: string;
  expiresAt: string | null;
  completedAt: string | null;
  firstOpenedAt: string | null;
  firstClickedAt: string | null;
  resendCount: number;
  actionKind: "open_signing" | "claim_and_sign" | "none";
  actionHref: string | null;
  actionLabel: string;
  detail: string;
};

export type ListSigningRequestCardsResponse = {
  incoming: SigningRequestCard[];
  outgoing: SigningRequestCard[];
};

export type InviteNotificationDispatch = {
  jobId: string;
  deliveryId: string;
  templateId: string;
  templateKey: string;
  pushJobIds?: string[];
};

export type DocumentInviteMutationResult = {
  invite: DocumentInviteDetail;
  access:
    | {
        token: string;
        accessUrl: string;
        expiresAt: string;
      }
    | null;
  notification:
    | {
        jobId: string;
        deliveryId: string;
        templateId: string;
        templateKey: string;
      }
    | null;
  existing: boolean;
};

export class DocumentInviteServiceError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "DocumentInviteServiceError";
  }
}

const isPrivilegedRole = (role: RequestRole) => role === "admin" || role === "service_role";

const requireViewerUserId = (input: {
  role: RequestRole;
  viewerUserId: string | null | undefined;
}) => {
  const viewerUserId = input.viewerUserId?.trim() ?? "";
  if (viewerUserId) {
    return viewerUserId;
  }

  throw new DocumentInviteServiceError(403, "User is not registered");
};

const humanizeToken = (value: string) => {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const getDocumentLabel = (document: Pick<DocumentRecord, "document_type" | "product_flow_mode">) => {
  if (document.product_flow_mode === "trust_bundle") {
    return "trust registration";
  }

  if (document.product_flow_mode === "poa_only") {
    return "DARCi Dynamic POA";
  }

  const mappedLabel = document.document_type ? documentTypeLabels[document.document_type] : undefined;
  if (mappedLabel) {
    return mappedLabel;
  }

  if (document.document_type) {
    return humanizeToken(document.document_type);
  }

  return "document";
};

export const resolveDocumentInviteDocumentTypeLabel = (document: Pick<DocumentRecord, "document_type" | "product_flow_mode">) => {
  if (
    document.product_flow_mode === "trust_bundle" ||
    document.product_flow_mode === "poa_only" ||
    document.product_flow_mode === "notarize_document"
  ) {
    return getDocumentLabel(document);
  }

  const mappedLabel = document.document_type ? documentTypeLabels[document.document_type] : undefined;
  if (mappedLabel) {
    return mappedLabel;
  }

  if (document.document_type) {
    return humanizeToken(document.document_type);
  }

  return getDocumentLabel(document);
};

export const resolveDocumentInviteRoleLabel = (input: {
  partyRole?: string | null | undefined;
  obligationType?: string | null | undefined;
}) => {
  const partyRole = input.partyRole?.trim() ?? "";
  if (partyRole) {
    return partyRoleLabels[partyRole] ?? humanizeToken(partyRole);
  }

  const obligationType = input.obligationType?.trim() ?? "";
  if (obligationType) {
    return humanizeToken(obligationType);
  }

  return "Signer";
};

const toDisplayName = (user: UserRow | null) => {
  if (!user) {
    return null;
  }

  const fullName = [user.first_name, user.last_name]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ");

  if (fullName) {
    return fullName;
  }

  return user.email?.trim() ?? null;
};

const toFirstName = (input: {
  displayName?: string | null;
  email?: string | null;
}) => {
  const candidate = input.displayName?.trim() ?? "";
  if (candidate) {
    return candidate.split(/\s+/)[0] ?? candidate;
  }

  const emailPrefix = input.email?.split("@")[0]?.trim();
  if (emailPrefix) {
    return emailPrefix;
  }

  return "there";
};

const getAppBaseUrl = () => {
  return (
    process.env.WEB_APP_URL?.trim() ??
    process.env.NEXT_PUBLIC_WEB_BASE_URL?.trim() ??
    process.env.APP_BASE_URL?.trim() ??
    process.env.NEXT_PUBLIC_APP_BASE_URL?.trim() ??
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
};

const buildInviteAccessUrl = (token: string) => {
  const url = new URL("/app/invite", `${getAppBaseUrl()}/`);
  url.searchParams.set("token", token);
  return url.toString();
};

const getDefaultInviteExpiration = () => {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
};

const closedInviteStatuses = new Set<DocumentInviteStatus>([
  "declined",
  "revoked",
]);

const terminalInviteStatuses = new Set<DocumentInviteStatus>([
  "declined",
  "revoked",
  "expired",
  "completed",
  "failed",
]);

const actionableIncomingInviteStatuses = new Set<DocumentInviteStatus>([
  "claimed",
  "accepted",
]);

const claimableIncomingInviteStatuses = new Set<DocumentInviteStatus>([
  "draft",
  "queued",
  "sent",
  "opened",
  "expired",
  "failed",
]);

const completedInviteStatuses = new Set<DocumentInviteStatus>([
  "completed",
]);

const normalizeEmailAddress = (value?: string | null) => value?.trim().toLowerCase() ?? "";

const uniqueStrings = (values: Array<string | null | undefined>) => {
  return Array.from(new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)));
};

const findActiveInviteForSigner = async (input: {
  documentId: string;
  documentOutputSignerId: string;
  recipientEmail: string;
}) => {
  const { data, error } = await supabaseAdmin
    .from("document_access_invites")
    .select(documentInviteSelect)
    .eq("document_id", input.documentId)
    .eq("document_output_signer_id", input.documentOutputSignerId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    throw new Error(error.message);
  }

  const inviteRows = ((data ?? []) as unknown as DocumentInviteRow[]).filter(
    (invite) => !terminalInviteStatuses.has(invite.status),
  );
  if (inviteRows.length === 0) {
    return null;
  }

  const inviteDetails = await loadInviteDetails(inviteRows);
  const normalizedEmail = input.recipientEmail.trim().toLowerCase();

  for (const detail of inviteDetails) {
    const hasMatchingPrimaryRecipient = detail.recipients.some(
      (recipient) =>
        recipient.channel === "email" &&
        recipient.isPrimary &&
        (recipient.deliveryAddress?.trim().toLowerCase() ?? "") === normalizedEmail,
    );

    if (hasMatchingPrimaryRecipient) {
      return detail;
    }
  }

  return null;
};

export const deriveDocumentSigningTemplateKey = (input: {
  hasExistingUser: boolean;
  isReminder: boolean;
  claimMode: InviteClaimMode;
}) => {
  if (input.isReminder) {
    return "signer_reminder_email";
  }

  if (!input.hasExistingUser && input.claimMode !== "none") {
    return "signer_signup_required_email";
  }

  return "signer_invitation_email";
};

export const resolveDocumentInviteEmailProvider = (input?: {
  rolloutKey?: string | null | undefined;
}) => {
  return resolveEmailNotificationProvider({
    rolloutKey: input?.rolloutKey,
  }).provider;
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

  return (data as UserRow | null) ?? null;
};

const findUserByEmail = async (email: string) => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, email, first_name, last_name")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as UserRow | null) ?? null;
};

const getActiveTemplateByKey = async (
  templateKey: string,
  channel: NotificationTemplateRow["channel"] = "email",
) => {
  const { data, error } = await supabaseAdmin
    .from("notification_templates")
    .select("id, template_key, channel")
    .eq("template_key", templateKey)
    .eq("channel", channel)
    .eq("locale", "en-US")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as NotificationTemplateRow | null) ?? null;
};

const listActivePushDeviceTokensForUserId = async (userId: string | null) => {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) {
    return [] as DevicePushTokenRow[];
  }

  const { data, error } = await supabaseAdmin
    .from("device_push_tokens")
    .select("id, user_id, environment, app_bundle_id, permission_status")
    .eq("user_id", normalizedUserId)
    .eq("platform", "ios")
    .eq("provider", "apns")
    .eq("is_active", true)
    .not("device_token", "is", null)
    .in("permission_status", ["authorized", "provisional"])
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DevicePushTokenRow[];
};

const loadInviteRowsByIds = async (inviteIds: string[]) => {
  if (inviteIds.length === 0) {
    return [] as DocumentInviteRow[];
  }

  const { data, error } = await supabaseAdmin
    .from("document_access_invites")
    .select(documentInviteSelect)
    .in("id", inviteIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as DocumentInviteRow[]);
};

const loadInviteRecipientsByInviteIds = async (inviteIds: string[]) => {
  if (inviteIds.length === 0) {
    return [] as InviteRecipientRow[];
  }

  const { data, error } = await supabaseAdmin
    .from("invite_recipients")
    .select(inviteRecipientSelect)
    .in("invite_id", inviteIds)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as InviteRecipientRow[]);
};

const loadInviteTokensByInviteIds = async (inviteIds: string[]) => {
  if (inviteIds.length === 0) {
    return [] as InviteTokenRow[];
  }

  const { data, error } = await supabaseAdmin
    .from("invite_tokens")
    .select(inviteTokenSelect)
    .in("invite_id", inviteIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as InviteTokenRow[]);
};

const loadInviteClaimsByInviteIds = async (inviteIds: string[]) => {
  if (inviteIds.length === 0) {
    return [] as InviteClaimRow[];
  }

  const { data, error } = await supabaseAdmin
    .from("invite_claims")
    .select(inviteClaimSelect)
    .in("invite_id", inviteIds)
    .order("claimed_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as InviteClaimRow[]);
};

const mapInviteDetail = (input: {
  invite: DocumentInviteRow;
  recipients: InviteRecipientRow[];
  latestToken: InviteTokenRow | null;
  latestClaim: InviteClaimRow | null;
}) => {
  return {
    id: input.invite.id,
    documentId: input.invite.document_id,
    documentOutputSignerId: input.invite.document_output_signer_id,
    documentPartyId: input.invite.document_party_id,
    createdByUserId: input.invite.created_by_user_id,
    claimedUserId: input.invite.claimed_user_id,
    templateId: input.invite.template_id,
    inviteKind: input.invite.invite_kind,
    accessScope: input.invite.access_scope,
    claimMode: input.invite.claim_mode,
    status: input.invite.status,
    inviteLabel: input.invite.invite_label,
    recipientName: input.invite.recipient_name_snapshot,
    partyRole: input.invite.party_role_snapshot,
    obligationType: input.invite.obligation_type_snapshot,
    outputKey: input.invite.output_key_snapshot,
    documentKey: input.invite.document_key_snapshot,
    requiresAcceptance: input.invite.requires_acceptance,
    expiresAt: input.invite.expires_at,
    sentAt: input.invite.sent_at,
    firstOpenedAt: input.invite.first_opened_at,
    firstClickedAt: input.invite.first_clicked_at,
    acceptedAt: input.invite.accepted_at,
    declinedAt: input.invite.declined_at,
    revokedAt: input.invite.revoked_at,
    completedAt: input.invite.completed_at,
    deliveryCount: input.invite.delivery_count,
    resendCount: input.invite.resend_count,
    context: input.invite.context_json,
    metadata: input.invite.metadata,
    createdAt: input.invite.created_at,
    updatedAt: input.invite.updated_at,
    recipients: input.recipients.map((recipient) => ({
      id: recipient.id,
      targetUserId: recipient.target_user_id,
      channel: recipient.channel,
      deliveryAddress: recipient.delivery_address,
      displayName: recipient.display_name,
      status: recipient.status,
      isPrimary: recipient.is_primary,
      lastNotifiedAt: recipient.last_notified_at,
      lastEventAt: recipient.last_event_at,
    })),
    latestToken: input.latestToken
      ? {
          id: input.latestToken.id,
          tokenPrefix: input.latestToken.token_prefix,
          purpose: input.latestToken.purpose,
          status: input.latestToken.status,
          maxUses: input.latestToken.max_uses,
          useCount: input.latestToken.use_count,
          expiresAt: input.latestToken.expires_at,
          lastUsedAt: input.latestToken.last_used_at,
          consumedAt: input.latestToken.consumed_at,
          consumedByUserId: input.latestToken.consumed_by_user_id,
          createdAt: input.latestToken.created_at,
          updatedAt: input.latestToken.updated_at,
        }
      : null,
    latestClaim: input.latestClaim
      ? {
          id: input.latestClaim.id,
          inviteTokenId: input.latestClaim.invite_token_id,
          claimedUserId: input.latestClaim.claimed_user_id,
          createdUserId: input.latestClaim.created_user_id,
          claimStatus: input.latestClaim.claim_status,
          claimMethod: input.latestClaim.claim_method,
          claimChannel: input.latestClaim.claim_channel,
          claimAddress: input.latestClaim.claim_address,
          claimedAt: input.latestClaim.claimed_at,
          acceptedAt: input.latestClaim.accepted_at,
          declinedAt: input.latestClaim.declined_at,
          createdAt: input.latestClaim.created_at,
          updatedAt: input.latestClaim.updated_at,
        }
      : null,
  } satisfies DocumentInviteDetail;
};

const loadInviteDetails = async (invites: DocumentInviteRow[]) => {
  const inviteIds = invites.map((invite) => invite.id);
  const [recipients, tokens, claims] = await Promise.all([
    loadInviteRecipientsByInviteIds(inviteIds),
    loadInviteTokensByInviteIds(inviteIds),
    loadInviteClaimsByInviteIds(inviteIds),
  ]);

  const recipientsByInviteId = new Map<string, InviteRecipientRow[]>();
  for (const recipient of recipients) {
    const list = recipientsByInviteId.get(recipient.invite_id) ?? [];
    list.push(recipient);
    recipientsByInviteId.set(recipient.invite_id, list);
  }

  const latestTokenByInviteId = new Map<string, InviteTokenRow>();
  for (const token of tokens) {
    if (!latestTokenByInviteId.has(token.invite_id)) {
      latestTokenByInviteId.set(token.invite_id, token);
    }
  }

  const latestClaimByInviteId = new Map<string, InviteClaimRow>();
  for (const claim of claims) {
    if (!latestClaimByInviteId.has(claim.invite_id)) {
      latestClaimByInviteId.set(claim.invite_id, claim);
    }
  }

  return invites.map((invite) => {
    return mapInviteDetail({
      invite,
      recipients: recipientsByInviteId.get(invite.id) ?? [],
      latestToken: latestTokenByInviteId.get(invite.id) ?? null,
      latestClaim: latestClaimByInviteId.get(invite.id) ?? null,
    });
  });
};

const assertDocumentManageAccess = (input: {
  role: RequestRole;
  viewerUserId: string | null | undefined;
  document: DocumentRecord;
}) => {
  if (isPrivilegedRole(input.role)) {
    return input.viewerUserId?.trim() ?? null;
  }

  const viewerUserId = requireViewerUserId({
    role: input.role,
    viewerUserId: input.viewerUserId,
  });
  if (viewerUserId !== input.document.owner_id) {
    throw new DocumentInviteServiceError(403, "You do not have access to manage invites for this document");
  }

  return viewerUserId;
};

const getManageableInviteContext = async (input: {
  inviteId: string;
  role: RequestRole;
  viewerUserId: string | null | undefined;
}) => {
  const invites = await loadInviteRowsByIds([input.inviteId]);
  const invite = invites[0] ?? null;
  if (!invite) {
    throw new DocumentInviteServiceError(404, "Invite not found");
  }

  const document = await getDocumentById(invite.document_id);
  if (!document) {
    throw new DocumentInviteServiceError(404, "Document not found for invite");
  }

  const viewerUserId = assertDocumentManageAccess({
    role: input.role,
    viewerUserId: input.viewerUserId,
    document,
  });

  const details = await loadInviteDetails([invite]);
  const detail = details[0] ?? null;
  if (!detail) {
    throw new Error("Failed to load invite detail");
  }

  return {
    invite,
    document,
    viewerUserId,
    detail,
  };
};

const queueInviteNotification = async (input: {
  inviteId: string;
  inviteRecipientId: string;
  documentId: string;
  requestedByUserId?: string | null;
  templateKey: string;
  jobKind: "invite" | "invite_reminder";
  recipientAddress: string | null;
  recipientDisplayName: string | null;
  targetUserId: string | null;
  payload: JsonObject;
  metadata?: JsonObject;
}) => {
  const template = await getActiveTemplateByKey(input.templateKey);
  if (!template) {
    throw new DocumentInviteServiceError(400, `Notification template ${input.templateKey} is not available`);
  }

  if (template.channel !== "email") {
    throw new DocumentInviteServiceError(400, "Invite runtime currently supports email templates only");
  }

  const queuedAt = new Date().toISOString();
  const eventCorrelationId =
    typeof input.metadata?.eventCorrelationId === "string"
      ? input.metadata.eventCorrelationId
      : randomUUID();
  const provider = resolveDocumentInviteEmailProvider({
    rolloutKey:
      input.targetUserId ??
      input.recipientAddress?.trim().toLowerCase() ??
      input.inviteRecipientId ??
      input.inviteId,
  });
  const { data: jobData, error: jobError } = await supabaseAdmin
    .from("notification_jobs")
    .insert({
      template_id: template.id,
      invite_id: input.inviteId,
      document_id: input.documentId,
      requested_by_user_id: input.requestedByUserId ?? null,
      job_kind: input.jobKind,
      channel: template.channel,
      status: "queued",
      priority: "normal",
      scheduled_for: queuedAt,
      payload_json: input.payload,
      metadata: {
        ...(input.metadata ?? {}),
        eventCorrelationId,
        source: "document_invite_service",
        templateKey: input.templateKey,
      },
    })
    .select("id")
    .single();

  if (jobError || !jobData) {
    throw new Error(jobError?.message ?? "Failed to create notification job");
  }

  const { data: deliveryData, error: deliveryError } = await supabaseAdmin
    .from("notification_deliveries")
    .insert({
      notification_job_id: (jobData as NotificationJobRow).id,
      invite_recipient_id: input.inviteRecipientId,
      target_user_id: input.targetUserId,
      channel: template.channel,
      recipient_address: input.recipientAddress,
      recipient_display_name: input.recipientDisplayName,
      provider,
      status: "queued",
      attempt_number: 1,
      queued_at: queuedAt,
      metadata: {
        ...(input.metadata ?? {}),
        eventCorrelationId,
        source: "document_invite_service",
        templateKey: input.templateKey,
      },
    })
    .select("id")
    .single();

  if (deliveryError || !deliveryData) {
    throw new Error(deliveryError?.message ?? "Failed to create notification delivery");
  }

  const { error: eventError } = await supabaseAdmin
    .from("outbound_message_events")
    .insert({
      notification_delivery_id: (deliveryData as NotificationDeliveryRow).id,
      event_type: "queued",
      provider,
      event_at: queuedAt,
      payload: {},
      metadata: {
        source: "document_invite_service",
        templateKey: input.templateKey,
      },
    });

  if (eventError) {
    throw new Error(eventError.message);
  }

  let pushJobIds: string[] = [];
  try {
    pushJobIds = await queueInvitePushCompanion({
      ...input,
      emailJobId: (jobData as NotificationJobRow).id,
      eventCorrelationId,
    });
  } catch (error) {
    console.warn("Invite push notification queue failed", {
      inviteId: input.inviteId,
      inviteRecipientId: input.inviteRecipientId,
      templateKey: input.templateKey,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    jobId: (jobData as NotificationJobRow).id,
    deliveryId: (deliveryData as NotificationDeliveryRow).id,
    templateId: template.id,
    templateKey: template.template_key,
    ...(pushJobIds.length > 0 ? { pushJobIds } : {}),
  } satisfies InviteNotificationDispatch;
};

const queueInvitePushCompanion = async (input: {
  inviteId: string;
  inviteRecipientId: string;
  documentId: string;
  requestedByUserId?: string | null;
  templateKey: string;
  jobKind: "invite" | "invite_reminder";
  recipientDisplayName: string | null;
  targetUserId: string | null;
  payload: JsonObject;
  metadata?: JsonObject;
  emailJobId: string;
  eventCorrelationId: string;
}) => {
  if (!input.targetUserId) {
    return [] as string[];
  }

  const template = await getActiveTemplateByKey(input.templateKey, "push");
  if (!template) {
    return [] as string[];
  }

  const tokens = await listActivePushDeviceTokensForUserId(input.targetUserId);
  if (tokens.length === 0) {
    return [] as string[];
  }

  const queuedAt = new Date().toISOString();
  const pushDedupeKey = `invite:${input.inviteId}:${input.inviteRecipientId}:${input.templateKey}:push`;
  const { data: jobData, error: jobError } = await supabaseAdmin
    .from("notification_jobs")
    .insert({
      template_id: template.id,
      invite_id: input.inviteId,
      document_id: input.documentId,
      requested_by_user_id: input.requestedByUserId ?? null,
      job_kind: input.jobKind,
      channel: "push",
      status: "queued",
      priority: "normal",
      dedupe_key: pushDedupeKey,
      scheduled_for: queuedAt,
      payload_json: input.payload,
      metadata: {
        ...(input.metadata ?? {}),
        eventCorrelationId: input.eventCorrelationId,
        emailJobId: input.emailJobId,
        source: "document_invite_service_push_fanout",
        templateKey: input.templateKey,
      },
    })
    .select("id")
    .single();

  if (jobError || !jobData) {
    const duplicateCode =
      typeof jobError === "object" && jobError !== null && "code" in jobError
        ? ((jobError as { code?: string }).code ?? null)
        : null;
    if (duplicateCode === "23505") {
      return [] as string[];
    }

    throw new Error(jobError?.message ?? "Failed to create invite push notification job");
  }

  const pushJobId = (jobData as NotificationJobRow).id;
  const deliveryRows = tokens.map((token, index) => ({
    notification_job_id: pushJobId,
    invite_recipient_id: input.inviteRecipientId,
    target_user_id: token.user_id,
    device_push_token_id: token.id,
    channel: "push",
    recipient_address: null,
    recipient_display_name: input.recipientDisplayName,
    provider: resolvePushNotificationProvider({ rolloutKey: token.user_id }).provider,
    status: "queued",
    attempt_number: 1,
    queued_at: queuedAt,
    metadata: {
      ...(input.metadata ?? {}),
      eventCorrelationId: input.eventCorrelationId,
      source: "document_invite_service_push_fanout",
      templateKey: input.templateKey,
      recipientIndex: index,
      tokenEnvironment: token.environment,
      appBundleId: token.app_bundle_id,
      permissionStatus: token.permission_status,
    },
  }));

  const { data: deliveries, error: deliveryError } = await supabaseAdmin
    .from("notification_deliveries")
    .insert(deliveryRows)
    .select("id, provider");

  if (deliveryError) {
    throw new Error(deliveryError.message);
  }

  const deliveryEvents = ((deliveries ?? []) as Array<{ id: string; provider: string | null }>).map(
    (delivery) => ({
      notification_delivery_id: delivery.id,
      event_type: "queued",
      provider: delivery.provider ?? "internal",
      event_at: queuedAt,
      payload: {},
      metadata: {
        source: "document_invite_service_push_fanout",
        templateKey: input.templateKey,
      },
    }),
  );

  if (deliveryEvents.length > 0) {
    const { error: eventError } = await supabaseAdmin
      .from("outbound_message_events")
      .insert(deliveryEvents);
    if (eventError) {
      throw new Error(eventError.message);
    }
  }

  return [pushJobId];
};

const createInvitePayload = (input: {
  templateKey: string;
  requester: UserRow | null;
  recipient: InviteRecipientRow;
  document: DocumentRecord;
  accessUrl: string;
  expiresAt: string;
  partyRole?: string | null | undefined;
  obligationType?: string | null | undefined;
}) => {
  const requesterName = toDisplayName(input.requester) ?? "DARCi";
  const firstName = toFirstName({
    displayName: input.recipient.display_name,
    email: input.recipient.delivery_address,
  });
  const documentName = getDocumentLabel(input.document);
  const documentType = resolveDocumentInviteDocumentTypeLabel(input.document);
  const roleLabel = resolveDocumentInviteRoleLabel({
    partyRole: input.partyRole,
    obligationType: input.obligationType,
  });
  const basePayload = {
    firstName,
    requesterName,
    documentName,
    documentType,
    roleLabel,
    expiresAt: input.expiresAt,
  } satisfies JsonObject;

  if (input.templateKey === "signer_signup_required_email") {
    return {
      ...basePayload,
      signupUrl: input.accessUrl,
    } satisfies JsonObject;
  }

  if (input.templateKey === "signer_reminder_email") {
    return {
      ...basePayload,
      inviteUrl: input.accessUrl,
    } satisfies JsonObject;
  }

  return {
    ...basePayload,
    inviteUrl: input.accessUrl,
  } satisfies JsonObject;
};

export const listDocumentInvites = async (input: {
  role: RequestRole;
  viewerUserId?: string | null;
  documentId?: string | null;
  documentOutputSignerId?: string | null;
  status?: DocumentInviteStatus | null;
  limit: number;
  offset: number;
}) => {
  if (!isPrivilegedRole(input.role)) {
    const documentId = input.documentId?.trim() ?? "";
    if (!documentId) {
      throw new DocumentInviteServiceError(400, "documentId is required when listing invites as a document owner");
    }

    const document = await getDocumentById(documentId);
    if (!document) {
      throw new DocumentInviteServiceError(404, "Document not found");
    }

    assertDocumentManageAccess({
      role: input.role,
      viewerUserId: input.viewerUserId,
      document,
    });
  }

  let countQuery = supabaseAdmin
    .from("document_access_invites")
    .select("id", { count: "exact", head: true });

  let dataQuery = supabaseAdmin
    .from("document_access_invites")
    .select(documentInviteSelect)
    .order("created_at", { ascending: false })
    .range(input.offset, input.offset + input.limit - 1);

  const normalizedDocumentId = input.documentId?.trim() ?? "";
  if (normalizedDocumentId) {
    countQuery = countQuery.eq("document_id", normalizedDocumentId);
    dataQuery = dataQuery.eq("document_id", normalizedDocumentId);
  }

  const normalizedOutputSignerId = input.documentOutputSignerId?.trim() ?? "";
  if (normalizedOutputSignerId) {
    countQuery = countQuery.eq("document_output_signer_id", normalizedOutputSignerId);
    dataQuery = dataQuery.eq("document_output_signer_id", normalizedOutputSignerId);
  }

  if (input.status) {
    countQuery = countQuery.eq("status", input.status);
    dataQuery = dataQuery.eq("status", input.status);
  }

  const [{ count, error: countError }, { data, error: dataError }] = await Promise.all([
    countQuery,
    dataQuery,
  ]);

  if (countError) {
    throw new Error(countError.message);
  }

  if (dataError) {
    throw new Error(dataError.message);
  }

  const invites = await loadInviteDetails((data ?? []) as unknown as DocumentInviteRow[]);
  return {
    invites,
    page: {
      limit: input.limit,
      offset: input.offset,
      total: count ?? 0,
    },
  } satisfies ListDocumentInvitesResponse;
};

const listIncomingSigningInviteIds = async (input: {
  viewerUserId: string;
  viewerEmail: string;
  limit: number;
}) => {
  const inviteIds = new Set<string>();
  const claimedInvitesResult = await supabaseAdmin
    .from("document_access_invites")
    .select("id")
    .eq("invite_kind", "document_signing")
    .eq("claimed_user_id", input.viewerUserId)
    .order("updated_at", { ascending: false })
    .limit(input.limit);
  const targetedRecipientsResult = await supabaseAdmin
    .from("invite_recipients")
    .select("invite_id")
    .eq("target_user_id", input.viewerUserId)
    .order("updated_at", { ascending: false })
    .limit(input.limit);
  const emailRecipientsResult = input.viewerEmail
    ? await supabaseAdmin
        .from("invite_recipients")
        .select("invite_id")
        .eq("channel", "email")
        .ilike("delivery_address", input.viewerEmail)
        .order("updated_at", { ascending: false })
        .limit(input.limit)
    : null;
  const results = [claimedInvitesResult, targetedRecipientsResult, emailRecipientsResult].filter(
    (result): result is NonNullable<typeof result> => result !== null,
  );
  for (const result of results) {
    if (result.error) {
      throw new Error(result.error.message);
    }

    for (const row of result.data ?? []) {
      const candidate = row as { id?: string | null; invite_id?: string | null };
      const inviteId = candidate.id ?? candidate.invite_id ?? null;
      if (inviteId) {
        inviteIds.add(inviteId);
      }
    }
  }

  return Array.from(inviteIds);
};

const loadOutgoingSigningInviteRows = async (input: {
  viewerUserId: string;
  limit: number;
}) => {
  const { data, error } = await supabaseAdmin
    .from("document_access_invites")
    .select(documentInviteSelect)
    .eq("invite_kind", "document_signing")
    .eq("created_by_user_id", input.viewerUserId)
    .order("updated_at", { ascending: false })
    .limit(input.limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as DocumentInviteRow[];
};

const loadDocumentMapForInvites = async (invites: DocumentInviteDetail[]) => {
  const documentIds = uniqueStrings(invites.map((invite) => invite.documentId));
  const documentsById = new Map<string, DocumentRecord>();

  if (documentIds.length === 0) {
    return documentsById;
  }

  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("id, owner_id, idn, status, document_type, jurisdiction, product_flow_mode, selected_families, output_bundle, intake_status, intake_schema_version, intake_last_saved_at, intake_submitted_at, created_at, updated_at")
    .in("id", documentIds);

  if (error) {
    throw new Error(error.message);
  }

  for (const document of (data ?? []) as unknown as DocumentRecord[]) {
    documentsById.set(document.id, document);
  }

  return documentsById;
};

const loadDocumentPartyMapForInvites = async (invites: DocumentInviteDetail[]) => {
  const documentIds = uniqueStrings(invites.map((invite) => invite.documentId));
  const partiesById = new Map<string, DocumentPartyRecord>();

  if (documentIds.length === 0) {
    return partiesById;
  }

  const { data, error } = await supabaseAdmin
    .from("document_parties")
    .select("id, document_id, party_role, full_name, email, phone_country_code, phone, is_signing_party, sort_order, metadata, created_at, updated_at")
    .in("document_id", documentIds)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  for (const party of (data ?? []) as unknown as DocumentPartyRecord[]) {
    partiesById.set(party.id, party);
  }

  return partiesById;
};

const loadUserMapForInvites = async (invites: DocumentInviteDetail[]) => {
  const userIds = uniqueStrings(invites.map((invite) => invite.createdByUserId));
  const usersById = new Map<string, UserRow>();

  if (userIds.length === 0) {
    return usersById;
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, email, first_name, last_name")
    .in("id", userIds);

  if (error) {
    throw new Error(error.message);
  }

  for (const user of (data ?? []) as UserRow[]) {
    usersById.set(user.id, user);
  }

  return usersById;
};

const getPrimaryRecipient = (invite: DocumentInviteDetail) => {
  return invite.recipients.find((recipient) => recipient.isPrimary) ?? invite.recipients[0] ?? null;
};

const formatPartyPhone = (party: DocumentPartyRecord | null) => {
  const phone = party?.phone?.trim() ?? "";
  if (!phone) {
    return null;
  }

  const countryCode = party?.phone_country_code?.trim() ?? "";
  return [countryCode, phone].filter(Boolean).join(" ");
};

const getSigningRequestAction = (input: {
  direction: SigningRequestCardDirection;
  invite: DocumentInviteDetail;
  document: DocumentRecord | null;
}) => {
  if (!input.document) {
    return {
      actionKind: "none",
      actionHref: null,
      actionLabel: "Document unavailable",
    } as const;
  }

  if (input.direction === "incoming") {
    if (actionableIncomingInviteStatuses.has(input.invite.status) || completedInviteStatuses.has(input.invite.status)) {
      return {
        actionKind: "open_signing",
        actionHref: `/app/sign?documentId=${encodeURIComponent(input.invite.documentId)}`,
        actionLabel: completedInviteStatuses.has(input.invite.status) ? "View" : "Sign document",
      } as const;
    }

    if (claimableIncomingInviteStatuses.has(input.invite.status)) {
      return {
        actionKind: "claim_and_sign",
        actionHref: null,
        actionLabel: "Open document",
      } as const;
    }

    return {
      actionKind: "none",
      actionHref: null,
      actionLabel: closedInviteStatuses.has(input.invite.status) ? "Request closed" : "Request pending",
    } as const;
  }

  return {
    actionKind: "open_signing",
    actionHref: `/app/sign?documentId=${encodeURIComponent(input.invite.documentId)}`,
    actionLabel: completedInviteStatuses.has(input.invite.status) ? "View" : "Track request",
  } as const;
};

const mapSigningRequestCard = (input: {
  direction: SigningRequestCardDirection;
  invite: DocumentInviteDetail;
  document: DocumentRecord | null;
  party: DocumentPartyRecord | null;
  sender: UserRow | null;
}) => {
  const primaryRecipient = getPrimaryRecipient(input.invite);
  const signerName = input.invite.recipientName ?? primaryRecipient?.displayName ?? input.party?.full_name ?? null;
  const signerEmail = primaryRecipient?.deliveryAddress ?? input.party?.email ?? null;
  const signerPhone = formatPartyPhone(input.party);
  const senderName = toDisplayName(input.sender);
  const senderEmail = input.sender?.email ?? null;
  const roleLabel = resolveDocumentInviteRoleLabel({
    partyRole: input.invite.partyRole,
    obligationType: input.invite.obligationType,
  });
  const documentLabel = input.document ? getDocumentLabel(input.document) : "document";
  const documentTypeLabel = input.document ? resolveDocumentInviteDocumentTypeLabel(input.document) : "Document";
  const action = getSigningRequestAction({ direction: input.direction, invite: input.invite, document: input.document });
  const counterparty = input.direction === "incoming"
    ? senderName ?? "DARCi"
    : signerName ?? signerEmail ?? "Signer";
  const detail = input.direction === "incoming"
    ? `${counterparty} requested your ${roleLabel.toLowerCase()} signature.`
    : `Waiting on ${counterparty} to complete the ${roleLabel.toLowerCase()} signature.`;

  return {
    id: `${input.direction}-${input.invite.id}`,
    inviteId: input.invite.id,
    direction: input.direction,
    documentId: input.invite.documentId,
    documentLabel,
    documentTypeLabel,
    signerName,
    signerEmail,
    signerPhone,
    senderName,
    senderEmail,
    roleLabel,
    status: input.invite.status,
    sentAt: input.invite.sentAt,
    updatedAt: input.invite.updatedAt,
    expiresAt: input.invite.expiresAt,
    completedAt: input.invite.completedAt,
    firstOpenedAt: input.invite.firstOpenedAt,
    firstClickedAt: input.invite.firstClickedAt,
    resendCount: input.invite.resendCount,
    ...action,
    detail,
  } satisfies SigningRequestCard;
};

export const listSigningRequestCards = async (input: {
  role: RequestRole;
  viewerUserId?: string | null;
  viewerEmail?: string | null;
  limit: number;
}) => {
  if (!isPrivilegedRole(input.role)) {
    requireViewerUserId({ role: input.role, viewerUserId: input.viewerUserId });
  }

  const viewerUserId = input.viewerUserId?.trim() ?? "";
  if (!viewerUserId) {
    return { incoming: [], outgoing: [] } satisfies ListSigningRequestCardsResponse;
  }

  const viewerEmail = normalizeEmailAddress(input.viewerEmail);
  const [outgoingRows, incomingInviteIds] = await Promise.all([
    loadOutgoingSigningInviteRows({ viewerUserId, limit: input.limit }),
    listIncomingSigningInviteIds({ viewerUserId, viewerEmail, limit: input.limit }),
  ]);
  const incomingRows = (await loadInviteRowsByIds(incomingInviteIds))
    .filter((invite) => invite.invite_kind === "document_signing")
    .sort((first, second) => second.updated_at.localeCompare(first.updated_at))
    .slice(0, input.limit);

  const [incoming, outgoing] = await Promise.all([
    loadInviteDetails(incomingRows),
    loadInviteDetails(outgoingRows),
  ]);
  const allInvites = [...incoming, ...outgoing];
  const [documentsById, usersById] = await Promise.all([
    loadDocumentMapForInvites(allInvites),
    loadUserMapForInvites(allInvites),
  ]);
  const partiesById = await loadDocumentPartyMapForInvites(allInvites);

  return {
    incoming: incoming.map((invite) => mapSigningRequestCard({
      direction: "incoming",
      invite,
      document: documentsById.get(invite.documentId) ?? null,
      party: invite.documentPartyId ? partiesById.get(invite.documentPartyId) ?? null : null,
      sender: invite.createdByUserId ? usersById.get(invite.createdByUserId) ?? null : null,
    })),
    outgoing: outgoing.map((invite) => mapSigningRequestCard({
      direction: "outgoing",
      invite,
      document: documentsById.get(invite.documentId) ?? null,
      party: invite.documentPartyId ? partiesById.get(invite.documentPartyId) ?? null : null,
      sender: invite.createdByUserId ? usersById.get(invite.createdByUserId) ?? null : null,
    })),
  } satisfies ListSigningRequestCardsResponse;
};

const signerCompletionEligibleInviteStatuses = new Set<DocumentInviteStatus>([
  "draft",
  "queued",
  "sent",
  "opened",
  "claimed",
  "accepted",
  "failed",
]);

export const completeDocumentSignerInvitesForOutputSigners = async (input: {
  documentId: string;
  documentOutputSignerIds: string[];
  completedAt: string;
}) => {
  const outputSignerIds = Array.from(
    new Set(
      input.documentOutputSignerIds
        .map((documentOutputSignerId) => documentOutputSignerId.trim())
        .filter(Boolean),
    ),
  );

  if (outputSignerIds.length === 0) {
    return [] as DocumentInviteDetail[];
  }

  const { data: existingData, error: existingError } = await supabaseAdmin
    .from("document_access_invites")
    .select(documentInviteSelect)
    .eq("document_id", input.documentId)
    .in("document_output_signer_id", outputSignerIds)
    .eq("invite_kind", "document_signing");

  if (existingError) {
    throw new Error(existingError.message);
  }

  const eligibleInviteIds = ((existingData ?? []) as unknown as DocumentInviteRow[])
    .filter((invite) => signerCompletionEligibleInviteStatuses.has(invite.status))
    .map((invite) => invite.id);

  if (eligibleInviteIds.length === 0) {
    return [] as DocumentInviteDetail[];
  }

  const { data, error } = await supabaseAdmin
    .from("document_access_invites")
    .update({
      status: "completed" satisfies DocumentInviteStatus,
      completed_at: input.completedAt,
      updated_at: input.completedAt,
    })
    .in("id", eligibleInviteIds)
    .select(documentInviteSelect);

  if (error) {
    throw new Error(error.message);
  }

  return loadInviteDetails((data ?? []) as unknown as DocumentInviteRow[]);
};

export const createDocumentInvite = async (input: {
  role: RequestRole;
  viewerUserId?: string | null;
  documentId: string;
  documentOutputSignerId: string;
  recipientEmail: string;
  recipientName?: string | null;
  inviteLabel?: string | null;
  claimMode: InviteClaimMode;
  expiresAt?: string | null;
  idempotencyKey?: string | null;
}) => {
  const document = await getDocumentById(input.documentId);
  if (!document) {
    throw new DocumentInviteServiceError(404, "Document not found");
  }

  const viewerUserId = assertDocumentManageAccess({
    role: input.role,
    viewerUserId: input.viewerUserId,
    document,
  });

  const signer = await getDocumentOutputSignerById({
    signerId: input.documentOutputSignerId,
    documentId: input.documentId,
  });
  if (!signer) {
    throw new DocumentInviteServiceError(404, "Document signer obligation not found");
  }

  if (signer.obligation_type !== "signer") {
    throw new DocumentInviteServiceError(400, "Invites are currently supported for signer obligations only");
  }

  const normalizedEmail = input.recipientEmail.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new DocumentInviteServiceError(400, "Recipient email is required");
  }

  const existingActiveInvite = await findActiveInviteForSigner({
    documentId: input.documentId,
    documentOutputSignerId: signer.id,
    recipientEmail: normalizedEmail,
  });
  if (existingActiveInvite) {
    return {
      invite: existingActiveInvite,
      access: null,
      notification: null,
      existing: true,
    } satisfies DocumentInviteMutationResult;
  }

  const [matchedUser, requester, documentParties] = await Promise.all([
    findUserByEmail(normalizedEmail),
    viewerUserId ? getUserById(viewerUserId) : Promise.resolve(null),
    listDocumentParties(input.documentId),
  ]);

  const documentParty = documentParties.find((party) => party.id === signer.document_party_id) ?? null;
  const recipientName = input.recipientName?.trim() || documentParty?.full_name || signer.party_name;
  const inviteLabel = input.inviteLabel?.trim() || `${signer.party_name} signature request`;
  const expiresAt = input.expiresAt?.trim() || getDefaultInviteExpiration();
  const templateKey = deriveDocumentSigningTemplateKey({
    hasExistingUser: Boolean(matchedUser),
    isReminder: false,
    claimMode: input.claimMode,
  });
  const access = createInviteAccessToken();
  const accessUrl = buildInviteAccessUrl(access.token);
  const createdAt = new Date().toISOString();

  let inviteRow: DocumentInviteRow | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from("document_access_invites")
      .insert({
        document_id: input.documentId,
        document_output_signer_id: signer.id,
        document_party_id: signer.document_party_id,
        created_by_user_id: viewerUserId,
        claimed_user_id: null,
        template_id: null,
        invite_kind: "document_signing",
        access_scope: "sign",
        claim_mode: input.claimMode,
        status: "draft",
        invite_label: inviteLabel,
        recipient_name_snapshot: recipientName,
        party_role_snapshot: signer.party_role,
        obligation_type_snapshot: signer.obligation_type,
        output_key_snapshot: signer.output_key,
        document_key_snapshot: signer.document_key,
        idempotency_key: input.idempotencyKey?.trim() || null,
        requires_acceptance: true,
        expires_at: expiresAt,
        context_json: {
          generationRunId: signer.generation_run_id,
          source: "document_invite_service",
        },
        metadata: {
          source: "document_invite_service",
          existingUserMatched: Boolean(matchedUser),
        },
      })
      .select(documentInviteSelect)
      .single();

    if (error || !data) {
      const duplicateCode = error?.code ?? null;
      if (duplicateCode === "23505" && input.idempotencyKey?.trim()) {
        const { data: existingData, error: existingError } = await supabaseAdmin
          .from("document_access_invites")
          .select(documentInviteSelect)
          .eq("idempotency_key", input.idempotencyKey.trim())
          .limit(1)
          .maybeSingle();

        if (existingError) {
          throw new Error(existingError.message);
        }

        const existingInvite = (existingData as DocumentInviteRow | null) ?? null;
        if (!existingInvite) {
          throw new Error(error?.message ?? "Failed to resolve existing invite");
        }

        const existingDetail = (await loadInviteDetails([existingInvite]))[0] ?? null;
        if (!existingDetail) {
          throw new Error("Failed to load existing invite detail");
        }

        return {
          invite: existingDetail,
          access: null,
          notification: null,
          existing: true,
        } satisfies DocumentInviteMutationResult;
      }

      throw new Error(error?.message ?? "Failed to create invite");
    }

    inviteRow = data as unknown as DocumentInviteRow;
  } catch (error) {
    throw error;
  }

  const { data: recipientData, error: recipientError } = await supabaseAdmin
    .from("invite_recipients")
    .insert({
      invite_id: inviteRow.id,
      document_party_id: documentParty?.id ?? null,
      target_user_id: matchedUser?.id ?? null,
      recipient_kind: "to",
      channel: "email",
      delivery_address: normalizedEmail,
      display_name: recipientName,
      status: "pending",
      is_primary: true,
      metadata: {
        source: "document_invite_service",
      },
    })
    .select(inviteRecipientSelect)
    .single();

  if (recipientError || !recipientData) {
    throw new Error(recipientError?.message ?? "Failed to create invite recipient");
  }

  const recipient = recipientData as unknown as InviteRecipientRow;
  const { error: tokenError } = await supabaseAdmin
    .from("invite_tokens")
    .insert({
      invite_id: inviteRow.id,
      token_hash: access.tokenHash,
      token_prefix: access.tokenPrefix,
      purpose: "invite_access",
      status: "active",
      max_uses: 1,
      use_count: 0,
      expires_at: expiresAt,
      metadata: {
        source: "document_invite_service",
      },
    });

  if (tokenError) {
    throw new Error(tokenError.message);
  }

  let notification: InviteNotificationDispatch | null = null;
  try {
    notification = await queueInviteNotification({
      inviteId: inviteRow.id,
      inviteRecipientId: recipient.id,
      documentId: document.id,
      requestedByUserId: viewerUserId,
      templateKey,
      jobKind: "invite",
      recipientAddress: recipient.delivery_address,
      recipientDisplayName: recipient.display_name,
      targetUserId: recipient.target_user_id,
      payload: createInvitePayload({
        templateKey,
        requester,
        recipient,
        document,
        accessUrl,
        expiresAt,
        partyRole: signer.party_role,
        obligationType: signer.obligation_type,
      }),
      metadata: {
        inviteId: inviteRow.id,
        issuedAt: createdAt,
        documentType: resolveDocumentInviteDocumentTypeLabel(document),
        roleLabel: resolveDocumentInviteRoleLabel({
          partyRole: signer.party_role,
          obligationType: signer.obligation_type,
        }),
      },
    });
  } catch (error) {
    await supabaseAdmin
      .from("document_access_invites")
      .update({
        status: "failed",
        metadata: {
          ...inviteRow.metadata,
          queueFailure: error instanceof Error ? error.message : String(error),
        },
      })
      .eq("id", inviteRow.id);
    throw error;
  }

  const nextContext = {
    ...inviteRow.context_json,
    latestNotificationJobId: notification.jobId,
    latestNotificationDeliveryId: notification.deliveryId,
  } satisfies JsonObject;

  const [{ error: inviteUpdateError }, { error: recipientUpdateError }] = await Promise.all([
    supabaseAdmin
      .from("document_access_invites")
      .update({
        status: "queued",
        template_id: notification.templateId,
        expires_at: expiresAt,
        sent_at: createdAt,
        delivery_count: inviteRow.delivery_count + 1,
        context_json: nextContext,
        metadata: {
          ...inviteRow.metadata,
          latestNotificationTemplateKey: templateKey,
        },
      })
      .eq("id", inviteRow.id),
    supabaseAdmin
      .from("invite_recipients")
      .update({
        status: "queued",
        last_notified_at: createdAt,
        last_event_at: createdAt,
        metadata: {
          ...recipient.metadata,
          latestNotificationDeliveryId: notification.deliveryId,
        },
      })
      .eq("id", recipient.id),
  ]);

  if (inviteUpdateError) {
    throw new Error(inviteUpdateError.message);
  }

  if (recipientUpdateError) {
    throw new Error(recipientUpdateError.message);
  }

  const refreshedInvite = (await loadInviteDetails((await loadInviteRowsByIds([inviteRow.id]))))[0] ?? null;
  if (!refreshedInvite) {
    throw new Error("Failed to load created invite detail");
  }

  if ((input.idempotencyKey?.trim() ?? "").startsWith("signing-remaining:")) {
    await recordAuditEvent({
      actorRole: input.role,
      entityType: "document",
      entityId: document.id,
      action: "system.invites_issued_for_remaining_signers",
      metadata: {
        document_id: document.id,
        invite_id: refreshedInvite.id,
        document_output_signer_id: refreshedInvite.documentOutputSignerId,
        recipient_email: normalizedEmail,
        source: "signing_remaining_dispatch",
        idempotency_key: input.idempotencyKey?.trim() ?? null,
      },
    });
  }

  return {
    invite: refreshedInvite,
    access: {
      token: access.token,
      accessUrl,
      expiresAt,
    },
    notification,
    existing: false,
  } satisfies DocumentInviteMutationResult;
};

export const resendDocumentInvite = async (input: {
  role: RequestRole;
  viewerUserId: string | null | undefined;
  inviteId: string;
  expiresAt?: string | null;
}) => {
  const context = await getManageableInviteContext({
    inviteId: input.inviteId,
    role: input.role,
    viewerUserId: input.viewerUserId,
  });

  if (["completed", "declined", "revoked"].includes(context.invite.status)) {
    throw new DocumentInviteServiceError(409, "Invite cannot be resent in its current state");
  }

  const primaryRecipient = context.detail.recipients.find((recipient) => recipient.isPrimary) ?? context.detail.recipients[0] ?? null;
  if (!primaryRecipient || primaryRecipient.channel !== "email" || !primaryRecipient.deliveryAddress) {
    throw new DocumentInviteServiceError(400, "Invite does not have a deliverable email recipient");
  }

  const [matchedUser, requester] = await Promise.all([
    primaryRecipient.deliveryAddress ? findUserByEmail(primaryRecipient.deliveryAddress) : Promise.resolve(null),
    context.viewerUserId ? getUserById(context.viewerUserId) : Promise.resolve(null),
  ]);

  const templateKey = deriveDocumentSigningTemplateKey({
    hasExistingUser: Boolean(matchedUser || primaryRecipient.targetUserId),
    isReminder: true,
    claimMode: context.invite.claim_mode,
  });
  const access = createInviteAccessToken();
  const expiresAt = input.expiresAt?.trim() || getDefaultInviteExpiration();
  const accessUrl = buildInviteAccessUrl(access.token);
  const resentAt = new Date().toISOString();

  const { error: tokenInsertError } = await supabaseAdmin
    .from("invite_tokens")
    .insert({
      invite_id: context.invite.id,
      token_hash: access.tokenHash,
      token_prefix: access.tokenPrefix,
      purpose: "invite_access",
      status: "active",
      max_uses: 1,
      use_count: 0,
      expires_at: expiresAt,
      metadata: {
        source: "document_invite_service",
        resend: true,
      },
    });

  if (tokenInsertError) {
    throw new Error(tokenInsertError.message);
  }

  const notification = await queueInviteNotification({
    inviteId: context.invite.id,
    inviteRecipientId: primaryRecipient.id,
    documentId: context.document.id,
    requestedByUserId: context.viewerUserId,
    templateKey,
    jobKind: "invite_reminder",
    recipientAddress: primaryRecipient.deliveryAddress,
    recipientDisplayName: primaryRecipient.displayName,
    targetUserId: primaryRecipient.targetUserId,
    payload: createInvitePayload({
      templateKey,
      requester,
      recipient: {
        id: primaryRecipient.id,
        invite_id: context.invite.id,
        target_user_id: primaryRecipient.targetUserId,
        channel: primaryRecipient.channel,
        delivery_address: primaryRecipient.deliveryAddress,
        display_name: primaryRecipient.displayName,
        status: primaryRecipient.status,
        is_primary: primaryRecipient.isPrimary,
        last_notified_at: primaryRecipient.lastNotifiedAt,
        last_event_at: primaryRecipient.lastEventAt,
        metadata: {},
        created_at: context.detail.createdAt,
        updated_at: context.detail.updatedAt,
      },
      document: context.document,
      accessUrl,
      expiresAt,
      partyRole: context.detail.partyRole,
      obligationType: context.detail.obligationType,
    }),
    metadata: {
      inviteId: context.invite.id,
      resend: true,
      documentType: resolveDocumentInviteDocumentTypeLabel(context.document),
      roleLabel: resolveDocumentInviteRoleLabel({
        partyRole: context.detail.partyRole,
        obligationType: context.detail.obligationType,
      }),
    },
  });

  const nextContext = {
    ...context.invite.context_json,
    latestNotificationJobId: notification.jobId,
    latestNotificationDeliveryId: notification.deliveryId,
  } satisfies JsonObject;

  const [inviteUpdateResult, recipientUpdateResult, revokeOldTokensResult] = await Promise.all([
    supabaseAdmin
      .from("document_access_invites")
      .update({
        status: "queued",
        template_id: notification.templateId,
        expires_at: expiresAt,
        sent_at: resentAt,
        resend_count: context.invite.resend_count + 1,
        delivery_count: context.invite.delivery_count + 1,
        context_json: nextContext,
        metadata: {
          ...context.invite.metadata,
          latestNotificationTemplateKey: templateKey,
        },
      })
      .eq("id", context.invite.id),
    supabaseAdmin
      .from("invite_recipients")
      .update({
        status: "queued",
        last_notified_at: resentAt,
        last_event_at: resentAt,
      })
      .eq("invite_id", context.invite.id),
    supabaseAdmin
      .from("invite_tokens")
      .update({
        status: "revoked",
      })
      .eq("invite_id", context.invite.id)
      .eq("status", "active")
      .neq("token_prefix", access.tokenPrefix),
  ]);

  if (inviteUpdateResult.error) {
    throw new Error(inviteUpdateResult.error.message);
  }

  if (recipientUpdateResult.error) {
    throw new Error(recipientUpdateResult.error.message);
  }

  if (revokeOldTokensResult.error) {
    throw new Error(revokeOldTokensResult.error.message);
  }

  const refreshedInvite = (await loadInviteDetails((await loadInviteRowsByIds([context.invite.id]))))[0] ?? null;
  if (!refreshedInvite) {
    throw new Error("Failed to load resent invite detail");
  }

  return {
    invite: refreshedInvite,
    access: {
      token: access.token,
      accessUrl,
      expiresAt,
    },
    notification,
    existing: false,
  } satisfies DocumentInviteMutationResult;
};

export const revokeDocumentInvite = async (input: {
  role: RequestRole;
  viewerUserId: string | null | undefined;
  inviteId: string;
  reason?: string | null;
}) => {
  const context = await getManageableInviteContext({
    inviteId: input.inviteId,
    role: input.role,
    viewerUserId: input.viewerUserId,
  });

  if (context.invite.status === "completed") {
    throw new DocumentInviteServiceError(409, "Completed invites cannot be revoked");
  }

  if (context.invite.status === "revoked") {
    return {
      invite: context.detail,
      access: null,
      notification: null,
      existing: true,
    } satisfies DocumentInviteMutationResult;
  }

  const revokedAt = new Date().toISOString();
  const metadata = {
    ...context.invite.metadata,
    revokeReason: input.reason?.trim() || null,
  } satisfies JsonObject;

  const [inviteUpdateResult, recipientUpdateResult, tokenUpdateResult] = await Promise.all([
    supabaseAdmin
      .from("document_access_invites")
      .update({
        status: "revoked",
        revoked_at: revokedAt,
        metadata,
      })
      .eq("id", context.invite.id),
    supabaseAdmin
      .from("invite_recipients")
      .update({
        status: "suppressed",
        last_event_at: revokedAt,
      })
      .eq("invite_id", context.invite.id),
    supabaseAdmin
      .from("invite_tokens")
      .update({
        status: "revoked",
      })
      .eq("invite_id", context.invite.id)
      .eq("status", "active"),
  ]);

  if (inviteUpdateResult.error) {
    throw new Error(inviteUpdateResult.error.message);
  }

  if (recipientUpdateResult.error) {
    throw new Error(recipientUpdateResult.error.message);
  }

  if (tokenUpdateResult.error) {
    throw new Error(tokenUpdateResult.error.message);
  }

  const refreshedInvite = (await loadInviteDetails((await loadInviteRowsByIds([context.invite.id]))))[0] ?? null;
  if (!refreshedInvite) {
    throw new Error("Failed to load revoked invite detail");
  }

  return {
    invite: refreshedInvite,
    access: null,
    notification: null,
    existing: false,
  } satisfies DocumentInviteMutationResult;
};
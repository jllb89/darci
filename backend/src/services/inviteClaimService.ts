import { createHash, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JsonObject = Record<string, unknown>;

export type InviteClaimMode =
  | "none"
  | "optional_signup"
  | "required_signup"
  | "existing_account_only";

export type DocumentInviteStatus =
  | "draft"
  | "queued"
  | "sent"
  | "opened"
  | "claimed"
  | "accepted"
  | "declined"
  | "revoked"
  | "expired"
  | "completed"
  | "failed";

export type InviteTokenStatus = "active" | "consumed" | "expired" | "revoked";

type DocumentInviteRow = {
  id: string;
  document_id: string;
  document_output_signer_id: string | null;
  document_party_id: string | null;
  created_by_user_id: string | null;
  claimed_user_id: string | null;
  invite_kind: string;
  access_scope: string;
  claim_mode: InviteClaimMode;
  status: DocumentInviteStatus;
  recipient_name_snapshot: string | null;
  party_role_snapshot: string | null;
  obligation_type_snapshot: string | null;
  output_key_snapshot: string | null;
  document_key_snapshot: string | null;
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

type UserRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type DocumentRow = {
  id: string;
  owner_id: string;
  document_type: string | null;
  product_flow_mode: string | null;
};

const documentInviteSelect = [
  "id",
  "document_id",
  "document_output_signer_id",
  "document_party_id",
  "created_by_user_id",
  "claimed_user_id",
  "invite_kind",
  "access_scope",
  "claim_mode",
  "status",
  "recipient_name_snapshot",
  "party_role_snapshot",
  "obligation_type_snapshot",
  "output_key_snapshot",
  "document_key_snapshot",
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

export type InvitePublicView = {
  id: string;
  documentId: string;
  documentOutputSignerId: string | null;
  inviteKind: string;
  accessScope: string;
  claimMode: InviteClaimMode;
  status: DocumentInviteStatus;
  recipientName: string | null;
  partyRole: string | null;
  obligationType: string | null;
  outputKey: string | null;
  documentKey: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  firstOpenedAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  completedAt: string | null;
  deliveryCount: number;
  resendCount: number;
  requesterName: string | null;
  claimedUserId: string | null;
  documentLabel: string;
  documentType: string;
  roleLabel: string;
  recipients: Array<{
    id: string;
    targetUserId: string | null;
    channel: "email" | "sms" | "in_app";
    deliveryAddress: string | null;
    displayName: string | null;
    status: string;
    isPrimary: boolean;
    lastNotifiedAt: string | null;
    lastEventAt: string | null;
  }>;
  token: {
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
    isExpired: boolean;
    canClaim: boolean;
  };
  latestClaim:
    | {
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
      }
    | null;
};

export type InviteClaimResult = {
  invite: InvitePublicView;
  claim: NonNullable<InvitePublicView["latestClaim"]>;
};

export type AuthenticatedInviteOpenResult = {
  inviteId: string;
  documentId: string;
  signingHref: string;
  status: DocumentInviteStatus;
};

export const authenticatedInviteOpenClaimMethod = "existing_session";

export class InviteClaimServiceError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "InviteClaimServiceError";
  }
}

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

const humanizeToken = (value: string) => {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const getDocumentLabel = (document: DocumentRow | null) => {
  if (!document) {
    return "document";
  }

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

const getDocumentTypeLabel = (document: DocumentRow | null) => {
  if (!document) {
    return "document";
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

export const resolveInviteClaimRoleLabel = (input: {
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

export const hashInviteToken = (token: string) => {
  return createHash("sha256").update(token).digest("hex");
};

export const getInviteTokenPrefix = (token: string) => {
  return token.slice(0, 8);
};

export const createInviteAccessToken = () => {
  const token = randomBytes(24).toString("base64url");
  return {
    token,
    tokenHash: hashInviteToken(token),
    tokenPrefix: getInviteTokenPrefix(token),
  };
};

export const isInviteTokenExpired = (expiresAt: string, now = new Date()) => {
  return new Date(expiresAt).getTime() <= now.getTime();
};

const normalizeEmail = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase() ?? "";
  return emailPattern.test(normalized) ? normalized : null;
};

export const canClaimInviteToken = (input: {
  tokenStatus: InviteTokenStatus;
  useCount: number;
  maxUses: number;
  expiresAt: string;
  inviteStatus: DocumentInviteStatus;
  claimMode: InviteClaimMode;
  viewerUserId?: string | null;
  now?: Date;
}) => {
  if (input.tokenStatus !== "active") {
    return false;
  }

  if (isInviteTokenExpired(input.expiresAt, input.now)) {
    return false;
  }

  if (input.useCount >= input.maxUses) {
    return false;
  }

  if (["claimed", "accepted", "declined", "revoked", "expired", "completed", "failed"].includes(input.inviteStatus)) {
    return false;
  }

  if (input.claimMode === "existing_account_only" && !input.viewerUserId) {
    return false;
  }

  return true;
};

const getInviteTokenByHash = async (tokenHash: string) => {
  const { data, error } = await supabaseAdmin
    .from("invite_tokens")
    .select(inviteTokenSelect)
    .eq("token_hash", tokenHash)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as InviteTokenRow | null) ?? null;
};

const getInviteById = async (inviteId: string) => {
  const { data, error } = await supabaseAdmin
    .from("document_access_invites")
    .select(documentInviteSelect)
    .eq("id", inviteId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as DocumentInviteRow | null) ?? null;
};

const listInviteRecipients = async (inviteId: string) => {
  const { data, error } = await supabaseAdmin
    .from("invite_recipients")
    .select(inviteRecipientSelect)
    .eq("invite_id", inviteId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as InviteRecipientRow[]);
};

const listInviteClaims = async (inviteId: string) => {
  const { data, error } = await supabaseAdmin
    .from("invite_claims")
    .select(inviteClaimSelect)
    .eq("invite_id", inviteId)
    .order("claimed_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as InviteClaimRow[]);
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

const getDocumentById = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("id, owner_id, document_type, product_flow_mode")
    .eq("id", documentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as DocumentRow | null) ?? null;
};

const userCanOpenInvite = (input: {
  invite: DocumentInviteRow;
  recipients: InviteRecipientRow[];
  viewerUserId: string;
  viewerEmail: string | null;
}) => {
  const claimedUserId = input.invite.claimed_user_id?.trim() ?? "";
  if (claimedUserId && claimedUserId !== input.viewerUserId) {
    return false;
  }

  return input.recipients.some((recipient) => {
    const targetUserId = recipient.target_user_id?.trim() ?? "";
    if (targetUserId && targetUserId === input.viewerUserId) {
      return true;
    }

    const recipientEmail = normalizeEmail(recipient.delivery_address);
    return Boolean(input.viewerEmail && recipientEmail && recipientEmail === input.viewerEmail);
  });
};

const getSigningHref = (documentId: string) => {
  return `/app/sign?documentId=${encodeURIComponent(documentId)}`;
};

const mapLatestClaim = (claim: InviteClaimRow | null) => {
  if (!claim) {
    return null;
  }

  return {
    id: claim.id,
    inviteTokenId: claim.invite_token_id,
    claimedUserId: claim.claimed_user_id,
    createdUserId: claim.created_user_id,
    claimStatus: claim.claim_status,
    claimMethod: claim.claim_method,
    claimChannel: claim.claim_channel,
    claimAddress: claim.claim_address,
    claimedAt: claim.claimed_at,
    acceptedAt: claim.accepted_at,
    declinedAt: claim.declined_at,
  };
};

const mapInvitePublicView = (input: {
  invite: DocumentInviteRow;
  recipients: InviteRecipientRow[];
  token: InviteTokenRow;
  latestClaim: InviteClaimRow | null;
  requester: UserRow | null;
  claimedUser: UserRow | null;
  document: DocumentRow | null;
  viewerUserId?: string | null;
}) => {
  return {
    id: input.invite.id,
    documentId: input.invite.document_id,
    documentOutputSignerId: input.invite.document_output_signer_id,
    inviteKind: input.invite.invite_kind,
    accessScope: input.invite.access_scope,
    claimMode: input.invite.claim_mode,
    status: input.invite.status,
    recipientName: input.invite.recipient_name_snapshot,
    partyRole: input.invite.party_role_snapshot,
    obligationType: input.invite.obligation_type_snapshot,
    outputKey: input.invite.output_key_snapshot,
    documentKey: input.invite.document_key_snapshot,
    expiresAt: input.invite.expires_at,
    sentAt: input.invite.sent_at,
    firstOpenedAt: input.invite.first_opened_at,
    acceptedAt: input.invite.accepted_at,
    revokedAt: input.invite.revoked_at,
    completedAt: input.invite.completed_at,
    deliveryCount: input.invite.delivery_count,
    resendCount: input.invite.resend_count,
    requesterName: toDisplayName(input.requester),
    claimedUserId: input.invite.claimed_user_id,
    documentLabel: getDocumentLabel(input.document),
    documentType: getDocumentTypeLabel(input.document),
    roleLabel: resolveInviteClaimRoleLabel({
      partyRole: input.invite.party_role_snapshot,
      obligationType: input.invite.obligation_type_snapshot,
    }),
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
    token: {
      id: input.token.id,
      tokenPrefix: input.token.token_prefix,
      purpose: input.token.purpose,
      status: input.token.status,
      maxUses: input.token.max_uses,
      useCount: input.token.use_count,
      expiresAt: input.token.expires_at,
      lastUsedAt: input.token.last_used_at,
      consumedAt: input.token.consumed_at,
      consumedByUserId: input.token.consumed_by_user_id,
      isExpired: isInviteTokenExpired(input.token.expires_at),
      canClaim: canClaimInviteToken({
        tokenStatus: input.token.status,
        useCount: input.token.use_count,
        maxUses: input.token.max_uses,
        expiresAt: input.token.expires_at,
        inviteStatus: input.invite.status,
        claimMode: input.invite.claim_mode,
        viewerUserId: input.viewerUserId ?? null,
      }),
    },
    latestClaim: mapLatestClaim(input.latestClaim),
  } satisfies InvitePublicView;
};

const loadInviteContextByTokenHash = async (tokenHash: string) => {
  const token = await getInviteTokenByHash(tokenHash);
  if (!token) {
    return null;
  }

  const invite = await getInviteById(token.invite_id);
  if (!invite) {
    return null;
  }

  const [recipients, claims, requester, claimedUser, document] = await Promise.all([
    listInviteRecipients(invite.id),
    listInviteClaims(invite.id),
    invite.created_by_user_id ? getUserById(invite.created_by_user_id) : Promise.resolve(null),
    invite.claimed_user_id ? getUserById(invite.claimed_user_id) : Promise.resolve(null),
    getDocumentById(invite.document_id),
  ]);

  return {
    token,
    invite,
    recipients,
    claims,
    requester,
    claimedUser,
    document,
  };
};

export const validateInviteToken = async (input: {
  token: string;
  viewerUserId?: string | null;
}) => {
  const normalizedToken = input.token.trim();
  if (!normalizedToken) {
    throw new InviteClaimServiceError(400, "Invite token is required");
  }

  const context = await loadInviteContextByTokenHash(hashInviteToken(normalizedToken));
  if (!context) {
    return null;
  }

  let invite = context.invite;
  let recipients = context.recipients;
  const now = new Date().toISOString();

  if (
    context.token.status === "active" &&
    !isInviteTokenExpired(context.token.expires_at) &&
    invite.first_opened_at === null &&
    ["draft", "queued", "sent"].includes(invite.status)
  ) {
    const nextInviteStatus: DocumentInviteStatus = "opened";
    const { error: inviteError } = await supabaseAdmin
      .from("document_access_invites")
      .update({
        status: nextInviteStatus,
        first_opened_at: now,
      })
      .eq("id", invite.id);

    if (inviteError) {
      throw new Error(inviteError.message);
    }

    const { error: recipientError } = await supabaseAdmin
      .from("invite_recipients")
      .update({
        status: "opened",
        last_event_at: now,
      })
      .eq("invite_id", invite.id)
      .in("status", ["pending", "queued", "sent"]);

    if (recipientError) {
      throw new Error(recipientError.message);
    }

    invite = {
      ...invite,
      status: nextInviteStatus,
      first_opened_at: now,
    };

    recipients = recipients.map((recipient) => {
      if (["pending", "queued", "sent"].includes(recipient.status)) {
        return {
          ...recipient,
          status: "opened",
          last_event_at: now,
        };
      }

      return recipient;
    });
  }

  return mapInvitePublicView({
    invite,
    recipients,
    token: context.token,
    latestClaim: context.claims[0] ?? null,
    requester: context.requester,
    claimedUser: context.claimedUser,
    document: context.document,
    viewerUserId: input.viewerUserId ?? null,
  });
};

export const claimInviteToken = async (input: {
  token: string;
  viewerUserId?: string | null;
  claimAddress?: string | null;
}) => {
  const normalizedToken = input.token.trim();
  if (!normalizedToken) {
    throw new InviteClaimServiceError(400, "Invite token is required");
  }

  const context = await loadInviteContextByTokenHash(hashInviteToken(normalizedToken));
  if (!context) {
    throw new InviteClaimServiceError(404, "Invite token not found");
  }

  const latestClaim = context.claims[0] ?? null;
  if (latestClaim && ["claimed", "accepted"].includes(latestClaim.claim_status)) {
    return {
      invite: mapInvitePublicView({
        invite: context.invite,
        recipients: context.recipients,
        token: context.token,
        latestClaim,
        requester: context.requester,
        claimedUser: context.claimedUser,
        document: context.document,
        viewerUserId: input.viewerUserId ?? null,
      }),
      claim: mapLatestClaim(latestClaim) as NonNullable<InvitePublicView["latestClaim"]>,
    } satisfies InviteClaimResult;
  }

  if (context.token.status === "revoked") {
    throw new InviteClaimServiceError(410, "Invite token has been revoked");
  }

  if (isInviteTokenExpired(context.token.expires_at)) {
    throw new InviteClaimServiceError(410, "Invite token has expired");
  }

  if (context.token.status === "consumed" || context.token.use_count >= context.token.max_uses) {
    throw new InviteClaimServiceError(409, "Invite token has already been used");
  }

  const canClaim = canClaimInviteToken({
    tokenStatus: context.token.status,
    useCount: context.token.use_count,
    maxUses: context.token.max_uses,
    expiresAt: context.token.expires_at,
    inviteStatus: context.invite.status,
    claimMode: context.invite.claim_mode,
    viewerUserId: input.viewerUserId ?? null,
  });

  if (!canClaim) {
    throw new InviteClaimServiceError(409, "Invite cannot be claimed in its current state");
  }

  const now = new Date().toISOString();
  const primaryRecipient = context.recipients.find((recipient) => recipient.is_primary) ?? context.recipients[0] ?? null;
  const claimMethod = input.viewerUserId ? "existing_session" : "signup";
  const normalizedClaimAddress = input.claimAddress?.trim() ?? "";
  const claimAddress = normalizedClaimAddress || primaryRecipient?.delivery_address || null;
  const nextInviteStatus: DocumentInviteStatus = context.invite.requires_acceptance ? "claimed" : "accepted";

  const { data: claimData, error: claimError } = await supabaseAdmin
    .from("invite_claims")
    .insert({
      invite_id: context.invite.id,
      invite_token_id: context.token.id,
      claimed_user_id: input.viewerUserId ?? null,
      created_user_id: null,
      claim_status: context.invite.requires_acceptance ? "claimed" : "accepted",
      claim_method: claimMethod,
      claim_channel: primaryRecipient?.channel ?? "unknown",
      claim_address: claimAddress,
      claimed_at: now,
      accepted_at: context.invite.requires_acceptance ? null : now,
      metadata: {
        source: "public_invite_claim_api",
      },
    })
    .select(inviteClaimSelect)
    .single();

  if (claimError || !claimData) {
    throw new Error(claimError?.message ?? "Failed to create invite claim");
  }

  const nextUseCount = context.token.use_count + 1;
  const nextTokenStatus: InviteTokenStatus = nextUseCount >= context.token.max_uses ? "consumed" : "active";

  const [inviteUpdateResult, tokenUpdateResult, recipientUpdateResult] = await Promise.all([
    supabaseAdmin
      .from("document_access_invites")
      .update({
        status: nextInviteStatus,
        claimed_user_id: input.viewerUserId ?? context.invite.claimed_user_id,
        first_clicked_at: context.invite.first_clicked_at ?? now,
        accepted_at: context.invite.requires_acceptance ? context.invite.accepted_at : now,
      })
      .eq("id", context.invite.id),
    supabaseAdmin
      .from("invite_tokens")
      .update({
        status: nextTokenStatus,
        use_count: nextUseCount,
        last_used_at: now,
        consumed_at: nextTokenStatus === "consumed" ? now : null,
        consumed_by_user_id: nextTokenStatus === "consumed" ? input.viewerUserId ?? null : null,
      })
      .eq("id", context.token.id),
    supabaseAdmin
      .from("invite_recipients")
      .update({
        status: context.invite.requires_acceptance ? "claimed" : "opened",
        last_event_at: now,
      })
      .eq("invite_id", context.invite.id),
  ]);

  if (inviteUpdateResult.error) {
    throw new Error(inviteUpdateResult.error.message);
  }

  if (tokenUpdateResult.error) {
    throw new Error(tokenUpdateResult.error.message);
  }

  if (recipientUpdateResult.error) {
    throw new Error(recipientUpdateResult.error.message);
  }

  const updatedInvite: DocumentInviteRow = {
    ...context.invite,
    status: nextInviteStatus,
    claimed_user_id: input.viewerUserId ?? context.invite.claimed_user_id,
    first_clicked_at: context.invite.first_clicked_at ?? now,
    accepted_at: context.invite.requires_acceptance ? context.invite.accepted_at : now,
    updated_at: now,
  };

  const updatedToken: InviteTokenRow = {
    ...context.token,
    status: nextTokenStatus,
    use_count: nextUseCount,
    last_used_at: now,
    consumed_at: nextTokenStatus === "consumed" ? now : null,
    consumed_by_user_id: nextTokenStatus === "consumed" ? input.viewerUserId ?? null : null,
    updated_at: now,
  };

  const updatedRecipients = context.recipients.map((recipient) => ({
    ...recipient,
    status: context.invite.requires_acceptance ? "claimed" : recipient.status,
    last_event_at: now,
  }));

  const mappedClaim = mapLatestClaim(claimData as unknown as InviteClaimRow);
  if (!mappedClaim) {
    throw new Error("Failed to map invite claim response");
  }

  return {
    invite: mapInvitePublicView({
      invite: updatedInvite,
      recipients: updatedRecipients,
      token: updatedToken,
      latestClaim: claimData as unknown as InviteClaimRow,
      requester: context.requester,
      claimedUser: context.claimedUser,
      document: context.document,
      viewerUserId: input.viewerUserId ?? null,
    }),
    claim: mappedClaim,
  } satisfies InviteClaimResult;
};

export const openAuthenticatedInvite = async (input: {
  inviteId: string;
  viewerUserId?: string | null;
  viewerEmail?: string | null;
  claimAddress?: string | null;
}) => {
  const inviteId = input.inviteId.trim();
  if (!inviteId) {
    throw new InviteClaimServiceError(400, "Invite id is required");
  }

  const viewerUserId = input.viewerUserId?.trim() ?? "";
  if (!viewerUserId) {
    throw new InviteClaimServiceError(401, "Sign in to open this invite");
  }

  const invite = await getInviteById(inviteId);
  if (!invite || invite.invite_kind !== "document_signing") {
    throw new InviteClaimServiceError(404, "Invite not found");
  }

  const [recipients, document] = await Promise.all([
    listInviteRecipients(invite.id),
    getDocumentById(invite.document_id),
  ]);

  if (!document) {
    throw new InviteClaimServiceError(404, "Document not found");
  }

  if (!invite.document_output_signer_id) {
    throw new InviteClaimServiceError(404, "Document signer obligation not found");
  }

  const viewerEmail = normalizeEmail(input.viewerEmail);
  if (!userCanOpenInvite({ invite, recipients, viewerUserId, viewerEmail })) {
    throw new InviteClaimServiceError(404, "Invite not found");
  }

  if (["declined", "revoked"].includes(invite.status)) {
    throw new InviteClaimServiceError(409, "Invite cannot be opened in its current state");
  }

  if (["claimed", "accepted", "completed"].includes(invite.status)) {
    return {
      inviteId: invite.id,
      documentId: invite.document_id,
      signingHref: getSigningHref(invite.document_id),
      status: invite.status,
    } satisfies AuthenticatedInviteOpenResult;
  }

  if (!["draft", "queued", "sent", "opened", "expired", "failed"].includes(invite.status)) {
    throw new InviteClaimServiceError(409, "Invite is not ready to open");
  }

  const now = new Date().toISOString();
  const primaryRecipient = recipients.find((recipient) => recipient.is_primary) ?? recipients[0] ?? null;
  const normalizedClaimAddress = input.claimAddress?.trim() ?? "";
  const claimAddress = normalizedClaimAddress || input.viewerEmail?.trim() || primaryRecipient?.delivery_address || null;
  const nextInviteStatus: DocumentInviteStatus = invite.requires_acceptance ? "claimed" : "accepted";

  const [claimResult, inviteUpdateResult, recipientUpdateResult] = await Promise.all([
    supabaseAdmin
      .from("invite_claims")
      .insert({
        invite_id: invite.id,
        invite_token_id: null,
        claimed_user_id: viewerUserId,
        created_user_id: null,
        claim_status: invite.requires_acceptance ? "claimed" : "accepted",
        claim_method: authenticatedInviteOpenClaimMethod,
        claim_channel: primaryRecipient?.channel ?? "unknown",
        claim_address: claimAddress,
        claimed_at: now,
        accepted_at: invite.requires_acceptance ? null : now,
        metadata: {
          source: "authenticated_invite_open_api",
        },
      }),
    supabaseAdmin
      .from("document_access_invites")
      .update({
        status: nextInviteStatus,
        claimed_user_id: viewerUserId,
        first_clicked_at: invite.first_clicked_at ?? now,
        accepted_at: invite.requires_acceptance ? invite.accepted_at : now,
        updated_at: now,
      })
      .eq("id", invite.id),
    supabaseAdmin
      .from("invite_recipients")
      .update({
        status: invite.requires_acceptance ? "claimed" : "opened",
        last_event_at: now,
      })
      .eq("invite_id", invite.id),
  ]);

  if (claimResult.error) {
    throw new Error(claimResult.error.message);
  }

  if (inviteUpdateResult.error) {
    throw new Error(inviteUpdateResult.error.message);
  }

  if (recipientUpdateResult.error) {
    throw new Error(recipientUpdateResult.error.message);
  }

  return {
    inviteId: invite.id,
    documentId: invite.document_id,
    signingHref: getSigningHref(invite.document_id),
    status: nextInviteStatus,
  } satisfies AuthenticatedInviteOpenResult;
};
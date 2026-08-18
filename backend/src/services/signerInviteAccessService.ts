import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type DocumentInviteAccessRow = {
  id: string;
  document_id: string;
  document_output_signer_id: string | null;
  document_party_id: string | null;
  claimed_user_id: string | null;
  status: string;
  party_role_snapshot: string | null;
  obligation_type_snapshot: string | null;
  output_key_snapshot: string | null;
  document_key_snapshot: string | null;
  recipient_name_snapshot: string | null;
  expires_at: string | null;
};

type InviteRecipientAccessRow = {
  invite_id: string;
  channel: string;
  delivery_address: string | null;
  is_primary: boolean;
};

export type ClaimedSignerInviteAccess = {
  inviteId: string;
  documentId: string;
  documentOutputSignerId: string;
  documentPartyId: string | null;
  claimedUserId: string;
  partyRole: string | null;
  obligationType: string | null;
  outputKey: string | null;
  documentKey: string | null;
  recipientEmail: string;
  recipientName: string | null;
};

const claimAccessibleInviteStatuses = ["claimed", "accepted", "completed"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const documentInviteAccessSelect = [
  "id",
  "document_id",
  "document_output_signer_id",
  "document_party_id",
  "claimed_user_id",
  "status",
  "party_role_snapshot",
  "obligation_type_snapshot",
  "output_key_snapshot",
  "document_key_snapshot",
  "recipient_name_snapshot",
  "expires_at",
].join(", ");

const normalizeEmail = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase() ?? "";
  return emailPattern.test(normalized) ? normalized : null;
};

export const resolveClaimedSignerInviteAccess = async (input: {
  documentId: string;
  viewerUserId?: string | null | undefined;
  viewerEmail?: string | null | undefined;
}) => {
  const viewerUserId = input.viewerUserId?.trim() ?? "";
  const viewerEmail = normalizeEmail(input.viewerEmail);
  if (!viewerUserId) {
    return null;
  }
  const { data: inviteRows, error: inviteError } = await supabaseAdmin
    .from("document_access_invites")
    .select(documentInviteAccessSelect)
    .eq("document_id", input.documentId)
    .in("status", claimAccessibleInviteStatuses)
    .order("updated_at", { ascending: false });

  if (inviteError) {
    throw new Error(inviteError.message);
  }

  const candidateInvites = ((inviteRows ?? []) as unknown as DocumentInviteAccessRow[])
    .filter((invite) => Boolean(invite.document_output_signer_id));
  if (candidateInvites.length === 0) {
    return null;
  }

  const { data: recipientRows, error: recipientError } = await supabaseAdmin
    .from("invite_recipients")
    .select("invite_id, channel, delivery_address, is_primary")
    .in("invite_id", candidateInvites.map((invite) => invite.id))
    .eq("channel", "email")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (recipientError) {
    throw new Error(recipientError.message);
  }

  const recipients = (recipientRows ?? []) as unknown as InviteRecipientAccessRow[];

  for (const invite of candidateInvites) {
    const claimedUserId = invite.claimed_user_id?.trim() ?? null;
    if (claimedUserId && claimedUserId !== viewerUserId) {
      continue;
    }

    const recipient = recipients.find((entry) => entry.invite_id === invite.id) ?? null;
    const recipientEmail = normalizeEmail(recipient?.delivery_address);
    if (!recipientEmail) {
      continue;
    }

    // Trust claimed_user_id as the primary authorization key; if an email claim exists,
    // keep the strict recipient-email match for defense in depth.
    if (viewerEmail && recipientEmail !== viewerEmail) {
      continue;
    }

    return {
      inviteId: invite.id,
      documentId: invite.document_id,
      documentOutputSignerId: invite.document_output_signer_id as string,
      documentPartyId: invite.document_party_id,
      claimedUserId: viewerUserId,
      partyRole: invite.party_role_snapshot,
      obligationType: invite.obligation_type_snapshot,
      outputKey: invite.output_key_snapshot,
      documentKey: invite.document_key_snapshot,
      recipientEmail,
      recipientName: invite.recipient_name_snapshot,
    } satisfies ClaimedSignerInviteAccess;
  }

  return null;
};
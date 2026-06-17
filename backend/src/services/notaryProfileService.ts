import { createClient } from "@supabase/supabase-js";
import {
  getUserIdentityContextBySupabaseId,
  getUserIdentityContextByUserId,
  type UserIdentityContext,
  upsertUserRoleAssignmentBySupabaseUserId,
} from "./userRoleService";
import { normalizeJurisdiction } from "./jurisdictionUtils";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type NotaryServiceAreaKind =
  | "county"
  | "parish"
  | "borough"
  | "district"
  | "city"
  | "metro"
  | "region"
  | "state"
  | "other";

export type NotaryProfileRecord = {
  id: string;
  userId: string;
  jurisdiction: string | null;
  serviceAreaKind: NotaryServiceAreaKind | null;
  serviceAreaName: string | null;
  commissionNumber: string | null;
  commissionExpiresAt: string | null;
  sealStoragePath: string | null;
  signatureDataUrl: string | null;
  sealDataUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AvailableNotaryRecord = {
  userId: string;
  displayName: string;
  jurisdiction: string;
  serviceAreaKind: NotaryServiceAreaKind | null;
  serviceAreaName: string | null;
  commissionExpiresAt: string | null;
};

export type NotaryApplicationStatus = "pending" | "approved" | "rejected";

export type NotaryApplicationRecord = {
  id: string;
  userId: string;
  jurisdiction: string;
  serviceAreaKind: NotaryServiceAreaKind;
  serviceAreaName: string;
  commissionNumber: string | null;
  commissionExpiresAt: string | null;
  signatureDataUrl: string | null;
  sealDataUrl: string | null;
  status: NotaryApplicationStatus;
  reviewNotes: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export class NotaryProfileServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const notaryProfileSelect =
  "id, user_id, jurisdiction, service_area_kind, service_area_name, commission_number, commission_expires_at, seal_storage_path, signature_data_url, seal_data_url, created_at, updated_at";
const notaryApplicationSelect =
  "id, user_id, jurisdiction, service_area_kind, service_area_name, commission_number, commission_expires_at, signature_data_url, seal_data_url, status, review_notes, reviewed_by_user_id, reviewed_at, created_at, updated_at";
const notaryAssetDataUrlPattern = /^data:image\/(?:png|jpe?g);base64,[a-z0-9+/=\s]+$/i;

const requireSupportedNotaryAssetDataUrl = (value: string | null | undefined, label: string) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  if (!notaryAssetDataUrlPattern.test(trimmed)) {
    throw new NotaryProfileServiceError(400, `${label} must be a PNG or JPEG data URL.`);
  }

  return trimmed;
};

const toNotaryProfileRecord = (row: Record<string, unknown> | null | undefined): NotaryProfileRecord | null => {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    jurisdiction: row.jurisdiction == null ? null : String(row.jurisdiction),
    serviceAreaKind: row.service_area_kind == null ? null : (String(row.service_area_kind) as NotaryServiceAreaKind),
    serviceAreaName: row.service_area_name == null ? null : String(row.service_area_name),
    commissionNumber: row.commission_number == null ? null : String(row.commission_number),
    commissionExpiresAt: row.commission_expires_at == null ? null : String(row.commission_expires_at),
    sealStoragePath: row.seal_storage_path == null ? null : String(row.seal_storage_path),
    signatureDataUrl: row.signature_data_url == null ? null : String(row.signature_data_url),
    sealDataUrl: row.seal_data_url == null ? null : String(row.seal_data_url),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
};

const toNotaryApplicationRecord = (row: Record<string, unknown>): NotaryApplicationRecord => {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    jurisdiction: String(row.jurisdiction),
    serviceAreaKind: String(row.service_area_kind) as NotaryServiceAreaKind,
    serviceAreaName: String(row.service_area_name),
    commissionNumber: row.commission_number == null ? null : String(row.commission_number),
    commissionExpiresAt: row.commission_expires_at == null ? null : String(row.commission_expires_at),
    signatureDataUrl: row.signature_data_url == null ? null : String(row.signature_data_url),
    sealDataUrl: row.seal_data_url == null ? null : String(row.seal_data_url),
    status: String(row.status) as NotaryApplicationStatus,
    reviewNotes: row.review_notes == null ? null : String(row.review_notes),
    reviewedByUserId: row.reviewed_by_user_id == null ? null : String(row.reviewed_by_user_id),
    reviewedAt: row.reviewed_at == null ? null : String(row.reviewed_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
};

const toFullName = (identity: UserIdentityContext) => {
  return [identity.firstName, identity.lastName]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .trim();
};

const toDisplayName = (identity: UserIdentityContext) => {
  return toFullName(identity) || identity.email?.trim() || identity.id;
};

export const hasActiveNotaryRole = (identity: UserIdentityContext | null | undefined) => {
  if (!identity || identity.status === "suspended" || identity.status === "revoked") {
    return false;
  }

  if (identity.role === "notary" || identity.availableRoles.includes("notary")) {
    return true;
  }

  return identity.roleAssignments.some(
    (assignment) => assignment.role === "notary" && assignment.status === "active",
  );
};

export const isNotaryCommissionExpired = (
  commissionExpiresAt: string | null | undefined,
  now = new Date(),
) => {
  if (!commissionExpiresAt) {
    return false;
  }

  const expirationTime = getCommissionExpirationTime(commissionExpiresAt);
  return expirationTime != null && expirationTime < now.getTime();
};

const getCommissionExpirationTime = (commissionExpiresAt: string | null | undefined) => {
  const trimmed = commissionExpiresAt?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const parsed = new Date(dateOnlyMatch ? `${trimmed}T23:59:59.999Z` : trimmed);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
};

export const isNotaryCommissionCurrent = (
  commissionExpiresAt: string | null | undefined,
  now = new Date(),
) => {
  const expirationTime = getCommissionExpirationTime(commissionExpiresAt);
  return expirationTime != null && expirationTime >= now.getTime();
};

const requireCurrentCommissionDetails = (input: {
  commissionNumber?: string | null;
  commissionExpiresAt?: string | null;
}) => {
  const commissionNumber = input.commissionNumber?.trim() ?? "";
  const commissionExpiresAt = input.commissionExpiresAt?.trim() ?? "";

  if (!commissionNumber || !commissionExpiresAt) {
    throw new NotaryProfileServiceError(400, "Notary commission number and expiration are required.");
  }

  if (!isNotaryCommissionCurrent(commissionExpiresAt)) {
    throw new NotaryProfileServiceError(400, "Notary commission expiration must be current.");
  }

  return {
    commissionNumber,
    commissionExpiresAt,
  };
};

const ensureNotaryDbReady = () => {
  if (!supabaseUrl || !supabaseKey) {
    throw new NotaryProfileServiceError(500, "Supabase service role is not configured");
  }
};

const isNotaryApplicationsSchemaCacheError = (error: { message?: string; code?: string } | null | undefined) => {
  if (!error) {
    return false;
  }

  const message = error.message ?? "";
  return (
    error.code === "PGRST205" ||
    /Could not find the table ['"]?public\.notary_profile_applications['"]? in the schema cache/i.test(message) ||
    /notary_profile_applications/i.test(message)
  );
};

const isUniqueViolationError = (error: { code?: string } | null | undefined) => {
  return error?.code === "23505";
};

const getNotaryApplicationByUserId = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from("notary_profile_applications")
    .select(notaryApplicationSelect)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (isNotaryApplicationsSchemaCacheError(error)) {
    throw new NotaryProfileServiceError(
      500,
      "Notary application schema is not available in PostgREST. Run the notary application migration in this environment.",
    );
  }

  if (error) {
    throw new NotaryProfileServiceError(500, error.message);
  }

  return data ? toNotaryApplicationRecord(data as Record<string, unknown>) : null;
};

export const listMyNotaryApplication = async (supabaseUserId: string) => {
  ensureNotaryDbReady();
  const identity = await getUserIdentityContextBySupabaseId(supabaseUserId);
  if (!identity) {
    throw new NotaryProfileServiceError(404, "User not found");
  }

  return getNotaryApplicationByUserId(identity.id);
};

export const submitNotaryApplication = async (input: {
  supabaseUserId: string;
  jurisdiction: string;
  serviceAreaKind: NotaryServiceAreaKind;
  serviceAreaName: string;
  commissionNumber: string;
  commissionExpiresAt: string;
  signatureDataUrl?: string | null;
  sealDataUrl?: string | null;
}) => {
  ensureNotaryDbReady();
  const identity = await getUserIdentityContextBySupabaseId(input.supabaseUserId);

  if (!identity) {
    throw new NotaryProfileServiceError(404, "User not found");
  }

  const commissionDetails = requireCurrentCommissionDetails(input);
  const signatureDataUrl = requireSupportedNotaryAssetDataUrl(
    input.signatureDataUrl,
    "Notary signature image",
  );
  const sealDataUrl = requireSupportedNotaryAssetDataUrl(input.sealDataUrl, "Notary seal image");

  const existingApplication = await getNotaryApplicationByUserId(identity.id);
  if (existingApplication) {
    throw new NotaryProfileServiceError(409, "A notary application has already been submitted for this account.");
  }

  const { data, error } = await supabaseAdmin
    .from("notary_profile_applications")
    .insert({
      user_id: identity.id,
      jurisdiction: input.jurisdiction.trim(),
      service_area_kind: input.serviceAreaKind,
      service_area_name: input.serviceAreaName.trim(),
      commission_number: commissionDetails.commissionNumber,
      commission_expires_at: commissionDetails.commissionExpiresAt,
      signature_data_url: signatureDataUrl,
      seal_data_url: sealDataUrl,
      status: "pending",
      review_notes: null,
      reviewed_by_user_id: null,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    })
    .select(notaryApplicationSelect)
    .single();

  if (isUniqueViolationError(error)) {
    throw new NotaryProfileServiceError(409, "A notary application has already been submitted for this account.");
  }

  if (error || !data) {
    throw new NotaryProfileServiceError(500, error?.message ?? "Failed to save notary application");
  }

  return toNotaryApplicationRecord(data as Record<string, unknown>);
};

export const listNotaryApplications = async () => {
  ensureNotaryDbReady();
  const { data, error } = await supabaseAdmin
    .from("notary_profile_applications")
    .select(`${notaryApplicationSelect}, users!notary_profile_applications_user_id_fkey(id, supabase_user_id, email, phone, first_name, last_name)`)
    .order("created_at", { ascending: false });

  if (error) {
    throw new NotaryProfileServiceError(500, error.message);
  }

  return (data ?? []).map((row) => {
    const application = toNotaryApplicationRecord(row as Record<string, unknown>);
    const user = row as Record<string, unknown> & { users?: Array<Record<string, unknown>> | Record<string, unknown> | null };
    const profile = Array.isArray(user.users) ? user.users[0] ?? null : user.users ?? null;
    return {
      application,
      user: profile
        ? {
            id: String(profile.id),
            supabaseUserId: String(profile.supabase_user_id),
            email: profile.email == null ? null : String(profile.email),
            phone: profile.phone == null ? null : String(profile.phone),
            firstName: profile.first_name == null ? null : String(profile.first_name),
            lastName: profile.last_name == null ? null : String(profile.last_name),
          }
        : null,
    };
  });
};

export const getMyNotaryProfile = async (supabaseUserId: string) => {
  ensureNotaryDbReady();
  const identity = await getUserIdentityContextBySupabaseId(supabaseUserId);

  if (!identity) {
    throw new NotaryProfileServiceError(404, "User not found");
  }

  const { data, error } = await supabaseAdmin
    .from("notary_profiles")
    .select(notaryProfileSelect)
    .eq("user_id", identity.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new NotaryProfileServiceError(500, error.message);
  }

  return data ? toNotaryProfileRecord(data as Record<string, unknown>) : null;
};

export const getNotaryProfileByUserId = async (userId: string) => {
  ensureNotaryDbReady();

  const { data, error } = await supabaseAdmin
    .from("notary_profiles")
    .select(notaryProfileSelect)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new NotaryProfileServiceError(500, error.message);
  }

  return data ? toNotaryProfileRecord(data as Record<string, unknown>) : null;
};

export const listAvailableNotariesByJurisdiction = async (input: {
  jurisdiction: string;
  excludeUserId?: string | null | undefined;
  now?: Date | undefined;
}) => {
  ensureNotaryDbReady();
  const normalizedJurisdiction = normalizeJurisdiction(input.jurisdiction);
  if (!normalizedJurisdiction) {
    throw new NotaryProfileServiceError(400, "Document jurisdiction is required to list available notaries");
  }

  const { data, error } = await supabaseAdmin
    .from("notary_profiles")
    .select(notaryProfileSelect);

  if (error) {
    throw new NotaryProfileServiceError(500, error.message);
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const excludedUserId = input.excludeUserId?.trim() ?? "";
  const notaries: AvailableNotaryRecord[] = [];

  for (const row of rows) {
    const profile = toNotaryProfileRecord(row);
    if (!profile || profile.userId === excludedUserId) {
      continue;
    }

    const profileJurisdiction = normalizeJurisdiction(profile.jurisdiction ?? "");
    if (profileJurisdiction !== normalizedJurisdiction) {
      continue;
    }

    if (!isNotaryCommissionCurrent(profile.commissionExpiresAt, input.now)) {
      continue;
    }

    const identity = await getUserIdentityContextByUserId(profile.userId);
    if (!identity || !hasActiveNotaryRole(identity)) {
      continue;
    }

    notaries.push({
      userId: profile.userId,
      displayName: toDisplayName(identity),
      jurisdiction: profileJurisdiction,
      serviceAreaKind: profile.serviceAreaKind,
      serviceAreaName: profile.serviceAreaName,
      commissionExpiresAt: profile.commissionExpiresAt,
    });
  }

  return notaries.sort((left, right) => left.displayName.localeCompare(right.displayName));
};

export const upsertMyNotaryProfile = async (input: {
  supabaseUserId: string;
  jurisdiction: string;
  serviceAreaKind: NotaryServiceAreaKind;
  serviceAreaName: string;
  commissionNumber: string;
  commissionExpiresAt: string;
  signatureDataUrl?: string | null;
  sealDataUrl?: string | null;
}) => {
  ensureNotaryDbReady();
  const identity = await getUserIdentityContextBySupabaseId(input.supabaseUserId);

  if (!identity) {
    throw new NotaryProfileServiceError(404, "User not found");
  }

  const commissionDetails = requireCurrentCommissionDetails(input);
  const signatureDataUrl = requireSupportedNotaryAssetDataUrl(
    input.signatureDataUrl,
    "Notary signature image",
  );
  const sealDataUrl = requireSupportedNotaryAssetDataUrl(input.sealDataUrl, "Notary seal image");

  const { data, error } = await supabaseAdmin
    .from("notary_profiles")
    .upsert({
      user_id: identity.id,
      jurisdiction: input.jurisdiction.trim(),
      service_area_kind: input.serviceAreaKind,
      service_area_name: input.serviceAreaName.trim(),
      commission_number: commissionDetails.commissionNumber,
      commission_expires_at: commissionDetails.commissionExpiresAt,
      signature_data_url: signatureDataUrl,
      seal_data_url: sealDataUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select(notaryProfileSelect)
    .single();

  if (error || !data) {
    throw new NotaryProfileServiceError(500, error?.message ?? "Failed to save notary profile");
  }

  return toNotaryProfileRecord(data as Record<string, unknown>);
};

export const approveNotaryApplication = async (input: {
  applicationId: string;
  reviewedBySupabaseUserId: string;
  reviewNotes?: string | null;
}) => {
  ensureNotaryDbReady();

  const applicationQuery = await supabaseAdmin
    .from("notary_profile_applications")
    .select(notaryApplicationSelect)
    .eq("id", input.applicationId)
    .limit(1)
    .maybeSingle();

  if (applicationQuery.error) {
    throw new NotaryProfileServiceError(500, applicationQuery.error.message);
  }

  const application = applicationQuery.data ? toNotaryApplicationRecord(applicationQuery.data as Record<string, unknown>) : null;
  if (!application) {
    throw new NotaryProfileServiceError(404, "Notary application not found");
  }

  const commissionDetails = requireCurrentCommissionDetails(application);

  const reviewerIdentity = await getUserIdentityContextByUserId(application.userId);
  if (!reviewerIdentity) {
    throw new NotaryProfileServiceError(404, "Applicant user not found");
  }

  const reviewer = await getUserIdentityContextBySupabaseId(input.reviewedBySupabaseUserId);
  if (!reviewer) {
    throw new NotaryProfileServiceError(404, "Reviewer user not found");
  }

  const approvedApplication = await supabaseAdmin
    .from("notary_profile_applications")
    .update({
      status: "approved",
      review_notes: input.reviewNotes?.trim() || null,
      reviewed_by_user_id: reviewer.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", application.id)
    .select(notaryApplicationSelect)
    .single();

  if (approvedApplication.error || !approvedApplication.data) {
    throw new NotaryProfileServiceError(500, approvedApplication.error?.message ?? "Failed to approve application");
  }

  const applicant = await upsertUserRoleAssignmentBySupabaseUserId({
    supabaseUserId: reviewerIdentity.supabaseUserId,
    role: "notary",
    status: "active",
    makeActive: true,
    grantedBySupabaseUserId: input.reviewedBySupabaseUserId,
    grantedReason: input.reviewNotes?.trim() || "Approved notary application",
  });

  const approvedProfile = await upsertMyNotaryProfile({
    supabaseUserId: reviewerIdentity.supabaseUserId,
    jurisdiction: application.jurisdiction,
    serviceAreaKind: application.serviceAreaKind,
    serviceAreaName: application.serviceAreaName,
    commissionNumber: commissionDetails.commissionNumber,
    commissionExpiresAt: commissionDetails.commissionExpiresAt,
    signatureDataUrl: application.signatureDataUrl,
    sealDataUrl: application.sealDataUrl,
  });

  return {
    application: toNotaryApplicationRecord(approvedApplication.data as Record<string, unknown>),
    profile: approvedProfile,
    applicant,
  };
};

export const rejectNotaryApplication = async (input: {
  applicationId: string;
  reviewedBySupabaseUserId: string;
  reviewNotes?: string | null;
}) => {
  ensureNotaryDbReady();

  const reviewer = await getUserIdentityContextBySupabaseId(input.reviewedBySupabaseUserId);
  if (!reviewer) {
    throw new NotaryProfileServiceError(404, "Reviewer user not found");
  }

  const { data, error } = await supabaseAdmin
    .from("notary_profile_applications")
    .update({
      status: "rejected",
      review_notes: input.reviewNotes?.trim() || null,
      reviewed_by_user_id: reviewer.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.applicationId)
    .select(notaryApplicationSelect)
    .single();

  if (error || !data) {
    throw new NotaryProfileServiceError(500, error?.message ?? "Failed to reject application");
  }

  return toNotaryApplicationRecord(data as Record<string, unknown>);
};

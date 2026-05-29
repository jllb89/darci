import { createClient } from "@supabase/supabase-js";
import { pool } from "../db/pool";
import {
  getUserIdentityContextBySupabaseId,
  getUserIdentityContextByUserId,
  upsertUserRoleAssignmentBySupabaseUserId,
} from "./userRoleService";

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

export type NotaryApplicationStatus = "pending" | "approved" | "rejected";

export type NotaryApplicationRecord = {
  id: string;
  userId: string;
  jurisdiction: string;
  serviceAreaKind: NotaryServiceAreaKind;
  serviceAreaName: string;
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
  "id, user_id, jurisdiction, service_area_kind, service_area_name, signature_data_url, seal_data_url, status, review_notes, reviewed_by_user_id, reviewed_at, created_at, updated_at";

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

const getNotaryApplicationByUserIdFromPool = async (userId: string) => {
  const result = await pool.query(
    `
      select
        id,
        user_id,
        jurisdiction,
        service_area_kind,
        service_area_name,
        signature_data_url,
        seal_data_url,
        status,
        review_notes,
        reviewed_by_user_id,
        reviewed_at,
        created_at,
        updated_at
      from public.notary_profile_applications
      where user_id = $1
      limit 1
    `,
    [userId],
  );

  const row = (result.rows[0] ?? null) as Record<string, unknown> | null;
  return row ? toNotaryApplicationRecord(row) : null;
};

const bootstrapNotarySchemaSql = `
  create table if not exists public.notary_profile_applications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references public.users(id) on delete cascade,
    jurisdiction text not null,
    service_area_kind text not null,
    service_area_name text not null,
    signature_data_url text,
    seal_data_url text,
    status text not null default 'pending',
    review_notes text,
    reviewed_by_user_id uuid references public.users(id),
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create index if not exists idx_notary_profile_applications_status on public.notary_profile_applications(status);
  create index if not exists idx_notary_profile_applications_user on public.notary_profile_applications(user_id);

  alter table public.notary_profiles
    add column if not exists service_area_kind text,
    add column if not exists service_area_name text,
    add column if not exists signature_data_url text,
    add column if not exists seal_data_url text,
    add column if not exists updated_at timestamptz not null default now();
`;

let notarySchemaBootstrapPromise: Promise<void> | null = null;

const ensureNotarySchema = async () => {
  if (!notarySchemaBootstrapPromise) {
    notarySchemaBootstrapPromise = (async () => {
      await pool.query(bootstrapNotarySchemaSql);
      await pool.query("select pg_notify('pgrst', 'reload schema');");
    })().catch((error) => {
      notarySchemaBootstrapPromise = null;
      throw error;
    });
  }

  return notarySchemaBootstrapPromise;
};

export const listMyNotaryApplication = async (supabaseUserId: string) => {
  ensureNotaryDbReady();
  await ensureNotarySchema();
  const identity = await getUserIdentityContextBySupabaseId(supabaseUserId);
  if (!identity) {
    throw new NotaryProfileServiceError(404, "User not found");
  }

  const { data, error } = await supabaseAdmin
    .from("notary_profile_applications")
    .select(notaryApplicationSelect)
    .eq("user_id", identity.id)
    .limit(1)
    .maybeSingle();

  if (isNotaryApplicationsSchemaCacheError(error)) {
    return getNotaryApplicationByUserIdFromPool(identity.id);
  }

  if (error) {
    throw new NotaryProfileServiceError(500, error.message);
  }

  return data ? toNotaryApplicationRecord(data as Record<string, unknown>) : null;
};

export const submitNotaryApplication = async (input: {
  supabaseUserId: string;
  jurisdiction: string;
  serviceAreaKind: NotaryServiceAreaKind;
  serviceAreaName: string;
  signatureDataUrl?: string | null;
  sealDataUrl?: string | null;
}) => {
  ensureNotaryDbReady();
  await ensureNotarySchema();
  const identity = await getUserIdentityContextBySupabaseId(input.supabaseUserId);

  if (!identity) {
    throw new NotaryProfileServiceError(404, "User not found");
  }

  const existingApplication = await getNotaryApplicationByUserIdFromPool(identity.id);
  if (existingApplication) {
    throw new NotaryProfileServiceError(409, "A notary application has already been submitted for this account.");
  }

  const { data, error } = await supabaseAdmin
    .from("notary_profile_applications")
    .upsert({
      user_id: identity.id,
      jurisdiction: input.jurisdiction.trim(),
      service_area_kind: input.serviceAreaKind,
      service_area_name: input.serviceAreaName.trim(),
      signature_data_url: input.signatureDataUrl ?? null,
      seal_data_url: input.sealDataUrl ?? null,
      status: "pending",
      review_notes: null,
      reviewed_by_user_id: null,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    })
    .select(notaryApplicationSelect)
    .single();

  if (error || !data) {
    throw new NotaryProfileServiceError(500, error?.message ?? "Failed to save notary application");
  }

  return toNotaryApplicationRecord(data as Record<string, unknown>);
};

export const listNotaryApplications = async () => {
  ensureNotaryDbReady();
  await ensureNotarySchema();
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
  await ensureNotarySchema();
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

export const upsertMyNotaryProfile = async (input: {
  supabaseUserId: string;
  jurisdiction: string;
  serviceAreaKind: NotaryServiceAreaKind;
  serviceAreaName: string;
  commissionNumber?: string | null;
  commissionExpiresAt?: string | null;
  signatureDataUrl?: string | null;
  sealDataUrl?: string | null;
}) => {
  ensureNotaryDbReady();
  await ensureNotarySchema();
  const identity = await getUserIdentityContextBySupabaseId(input.supabaseUserId);

  if (!identity) {
    throw new NotaryProfileServiceError(404, "User not found");
  }

  const { data, error } = await supabaseAdmin
    .from("notary_profiles")
    .upsert({
      user_id: identity.id,
      jurisdiction: input.jurisdiction.trim(),
      service_area_kind: input.serviceAreaKind,
      service_area_name: input.serviceAreaName.trim(),
      commission_number: input.commissionNumber?.trim() || null,
      commission_expires_at: input.commissionExpiresAt || null,
      signature_data_url: input.signatureDataUrl ?? null,
      seal_data_url: input.sealDataUrl ?? null,
      updated_at: new Date().toISOString(),
    })
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
  await ensureNotarySchema();

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
  await ensureNotarySchema();

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

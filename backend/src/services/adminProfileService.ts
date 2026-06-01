import { createClient } from "@supabase/supabase-js";
import { pool } from "../db/pool";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type AdminCapabilityKey =
  | "canManageAdmins"
  | "canReviewNotaries"
  | "canManageUsers"
  | "canViewAudit"
  | "canManagePlatformRules";

export type AdminCapabilities = Record<AdminCapabilityKey, boolean>;

export type AdminProfileContext = {
  dbUserId: string | null;
  supabaseUserId: string | null;
  email: string | null;
  capabilities: AdminCapabilities;
};

export class AdminProfileServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const defaultAdminCapabilities: AdminCapabilities = {
  canManageAdmins: false,
  canReviewNotaries: true,
  canManageUsers: true,
  canViewAudit: true,
  canManagePlatformRules: false,
};

const serviceRoleCapabilities: AdminCapabilities = {
  canManageAdmins: true,
  canReviewNotaries: true,
  canManageUsers: true,
  canViewAudit: true,
  canManagePlatformRules: true,
};

const defaultBootstrapSuperAdminEmails = ["lopezb.jl@gmail.com"];

const bootstrapSuperAdminEmails = (process.env.ADMIN_SUPER_ADMIN_EMAILS ?? defaultBootstrapSuperAdminEmails.join(","))
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const adminProfileSchemaSql = `
  alter table public.users
    add column if not exists phone text,
    add column if not exists last_sign_in_at timestamptz,
    add column if not exists last_auth_synced_at timestamptz;

  create table if not exists public.admin_permissions (
    user_id uuid primary key references public.users(id) on delete cascade,
    can_manage_admins boolean not null default false,
    can_review_notaries boolean not null default true,
    can_manage_users boolean not null default true,
    can_view_audit boolean not null default true,
    can_manage_platform_rules boolean not null default false,
    granted_by_user_id uuid references public.users(id) on delete set null,
    granted_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  alter table public.admin_permissions
    add column if not exists can_manage_admins boolean not null default false,
    add column if not exists can_review_notaries boolean not null default true,
    add column if not exists can_manage_users boolean not null default true,
    add column if not exists can_view_audit boolean not null default true,
    add column if not exists can_manage_platform_rules boolean not null default false,
    add column if not exists granted_by_user_id uuid references public.users(id) on delete set null,
    add column if not exists granted_reason text,
    add column if not exists updated_at timestamptz not null default now();

  create index if not exists idx_admin_permissions_manage_admins
    on public.admin_permissions(can_manage_admins)
    where can_manage_admins;
`;

let adminProfileBootstrapPromise: Promise<void> | null = null;

const ensureAdminProfileSchema = async () => {
  if (!adminProfileBootstrapPromise) {
    adminProfileBootstrapPromise = (async () => {
      await pool.query(adminProfileSchemaSql);

      if (bootstrapSuperAdminEmails.length === 0) {
        return;
      }

      await pool.query(
        `
          update public.user_roles ur
          set is_active_profile = false,
            updated_at = now()
          from public.users u
          where ur.user_id = u.id
            and lower(u.email) = any($1::text[])
            and ur.is_active_profile = true
        `,
        [bootstrapSuperAdminEmails],
      );

      await pool.query(
        `
          insert into public.user_roles (user_id, role, status, is_active_profile, granted_reason)
          select id, 'admin', 'active', true, 'Bootstrap admin manager'
          from public.users
          where lower(email) = any($1::text[])
          on conflict (user_id, role) do update
          set status = 'active',
            is_active_profile = true,
            granted_reason = coalesce(public.user_roles.granted_reason, excluded.granted_reason),
            updated_at = now()
        `,
        [bootstrapSuperAdminEmails],
      );

      await pool.query(
        `
          update public.users
          set role = 'admin'
          where lower(email) = any($1::text[])
        `,
        [bootstrapSuperAdminEmails],
      );

      await pool.query(
        `
          insert into public.admin_permissions (
            user_id,
            can_manage_admins,
            can_review_notaries,
            can_manage_users,
            can_view_audit,
            can_manage_platform_rules,
            granted_reason
          )
          select id, true, true, true, true, false, 'Bootstrap admin manager'
          from public.users
          where lower(email) = any($1::text[])
          on conflict (user_id) do update
          set can_manage_admins = true,
            can_review_notaries = true,
            can_manage_users = true,
            can_view_audit = true,
            updated_at = now()
        `,
        [bootstrapSuperAdminEmails],
      );
    })().catch((error) => {
      adminProfileBootstrapPromise = null;
      throw error;
    });
  }

  return adminProfileBootstrapPromise;
};

const toCapabilities = (row?: Record<string, unknown> | null): AdminCapabilities => {
  if (!row) {
    return { ...defaultAdminCapabilities };
  }

  return {
    canManageAdmins: Boolean(row.can_manage_admins),
    canReviewNotaries: row.can_review_notaries == null ? true : Boolean(row.can_review_notaries),
    canManageUsers: row.can_manage_users == null ? true : Boolean(row.can_manage_users),
    canViewAudit: row.can_view_audit == null ? true : Boolean(row.can_view_audit),
    canManagePlatformRules: Boolean(row.can_manage_platform_rules),
  };
};

const toIsoString = (value: unknown) => value == null ? null : String(value);

const toDisplayName = (row: { first_name?: unknown; last_name?: unknown; email?: unknown; phone?: unknown }) => {
  const fullName = [row.first_name, row.last_name]
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean)
    .join(" ");

  return fullName || (row.email == null ? null : String(row.email)) || (row.phone == null ? null : String(row.phone)) || "User";
};

const parseJsonArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const mapUserRow = (row: Record<string, unknown>) => ({
  id: String(row.id),
  supabaseUserId: row.supabase_user_id == null ? null : String(row.supabase_user_id),
  email: row.email == null ? null : String(row.email),
  phone: row.phone == null ? null : String(row.phone),
  firstName: row.first_name == null ? null : String(row.first_name),
  lastName: row.last_name == null ? null : String(row.last_name),
  displayName: toDisplayName(row),
  role: row.role == null ? null : String(row.role),
  status: row.status == null ? null : String(row.status),
  createdAt: toIsoString(row.created_at),
  lastSignInAt: toIsoString(row.last_sign_in_at),
  lastAuthSyncedAt: toIsoString(row.last_auth_synced_at),
  documentCount: Number(row.document_count ?? 0),
  roles: parseJsonArray(row.roles).map((roleRow) => {
    const role = roleRow as Record<string, unknown>;
    return {
      id: String(role.id),
      role: String(role.role),
      status: String(role.status),
      isActiveProfile: Boolean(role.is_active_profile),
      grantedReason: role.granted_reason == null ? null : String(role.granted_reason),
      createdAt: toIsoString(role.created_at),
      updatedAt: toIsoString(role.updated_at),
    };
  }),
  adminPermissions: toCapabilities(row),
});

const mapNotaryApplicationRow = (row: Record<string, unknown>) => ({
  id: String(row.id),
  status: String(row.status),
  jurisdiction: String(row.jurisdiction),
  serviceAreaKind: String(row.service_area_kind),
  serviceAreaName: String(row.service_area_name),
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
  applicant: {
    id: row.user_id == null ? null : String(row.user_id),
    email: row.email == null ? null : String(row.email),
    phone: row.phone == null ? null : String(row.phone),
    firstName: row.first_name == null ? null : String(row.first_name),
    lastName: row.last_name == null ? null : String(row.last_name),
    displayName: toDisplayName(row),
  },
});

const mapAuditRow = (row: Record<string, unknown>) => ({
  id: String(row.id),
  entityType: String(row.entity_type),
  entityId: row.entity_id == null ? null : String(row.entity_id),
  action: String(row.action),
  metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  createdAt: String(row.created_at),
  actor: row.actor_id
    ? {
        id: String(row.actor_id),
        email: row.actor_email == null ? null : String(row.actor_email),
        displayName: toDisplayName({
          first_name: row.actor_first_name,
          last_name: row.actor_last_name,
          email: row.actor_email,
        }),
      }
    : null,
});

const adminContextUserSelect = "id, supabase_user_id, email";
const adminPermissionsSelect = [
  "can_manage_admins",
  "can_review_notaries",
  "can_manage_users",
  "can_view_audit",
  "can_manage_platform_rules",
].join(", ");
const adminDashboardUserSelect = "id, supabase_user_id, email, phone, first_name, last_name";

const throwAdminSupabaseError = (error: { message?: string } | null | undefined, fallbackMessage: string) => {
  if (error) {
    throw new AdminProfileServiceError(500, error.message ?? fallbackMessage);
  }
};

const countSupabaseRows = async (
  tableName: string,
  configure?: (query: any) => any,
) => {
  const query = supabaseAdmin.from(tableName).select("id", { count: "exact", head: true });
  const { count, error } = await (configure?.(query) ?? query);
  throwAdminSupabaseError(error, `Failed to count ${tableName}`);
  return count ?? 0;
};

const toUserSummaryById = async (userIds: string[]) => {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return new Map<string, Record<string, unknown>>();
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select(adminDashboardUserSelect)
    .in("id", uniqueUserIds);

  throwAdminSupabaseError(error, "Failed to load user summaries");

  return new Map(
    ((data ?? []) as Record<string, unknown>[]).map((row) => [String(row.id), row]),
  );
};

const withUserSummary = (row: Record<string, unknown>, user?: Record<string, unknown>) => ({
  ...row,
  email: user?.email ?? null,
  phone: user?.phone ?? null,
  first_name: user?.first_name ?? null,
  last_name: user?.last_name ?? null,
});

const withActorSummary = (row: Record<string, unknown>, actor?: Record<string, unknown>) => ({
  ...row,
  actor_email: actor?.email ?? null,
  actor_first_name: actor?.first_name ?? null,
  actor_last_name: actor?.last_name ?? null,
});

export const getAdminProfileContext = async (input: {
  supabaseUserId?: string | null;
  role?: string | null;
}): Promise<AdminProfileContext> => {
  if (input.role === "service_role") {
    return {
      dbUserId: null,
      supabaseUserId: input.supabaseUserId ?? null,
      email: null,
      capabilities: { ...serviceRoleCapabilities },
    };
  }

  if (!input.supabaseUserId) {
    throw new AdminProfileServiceError(401, "Missing user context");
  }

  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select(adminContextUserSelect)
    .eq("supabase_user_id", input.supabaseUserId)
    .limit(1)
    .maybeSingle();

  throwAdminSupabaseError(userError, "Failed to load admin user");

  if (!user) {
    throw new AdminProfileServiceError(404, "Admin user not found");
  }

  const userRow = user as Record<string, unknown>;
  const { data: permissions, error: permissionsError } = await supabaseAdmin
    .from("admin_permissions")
    .select(adminPermissionsSelect)
    .eq("user_id", String(userRow.id))
    .limit(1)
    .maybeSingle();

  throwAdminSupabaseError(permissionsError, "Failed to load admin permissions");

  return {
    dbUserId: String(userRow.id),
    supabaseUserId: String(userRow.supabase_user_id),
    email: userRow.email == null ? null : String(userRow.email),
    capabilities: toCapabilities(permissions as Record<string, unknown> | null),
  };
};

export const assertAdminCapability = (context: AdminProfileContext, capability: AdminCapabilityKey) => {
  if (!context.capabilities[capability]) {
    throw new AdminProfileServiceError(403, "Insufficient admin permissions");
  }
};

export const getAdminDashboard = async (context: AdminProfileContext) => {
  const [
    totalApplications,
    pendingApplications,
    approvedApplications,
    rejectedApplications,
    totalUsers,
    activeUsers,
    legacyAdmins,
    roleAdmins,
    recentApplicationsResult,
    recentActivityResult,
  ] = await Promise.all([
    countSupabaseRows("notary_profile_applications"),
    countSupabaseRows("notary_profile_applications", (query) => query.eq("status", "pending")),
    countSupabaseRows("notary_profile_applications", (query) => query.eq("status", "approved")),
    countSupabaseRows("notary_profile_applications", (query) => query.eq("status", "rejected")),
    countSupabaseRows("users"),
    countSupabaseRows("users", (query) => query.or("status.eq.active,status.is.null")),
    supabaseAdmin.from("users").select("id").eq("role", "admin"),
    supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin").eq("status", "active"),
    supabaseAdmin
      .from("notary_profile_applications")
      .select("id, user_id, status, jurisdiction, service_area_kind, service_area_name, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(6),
    supabaseAdmin
      .from("audit_events")
      .select("id, actor_id, entity_type, entity_id, action, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  throwAdminSupabaseError(legacyAdmins.error, "Failed to load admin users");
  throwAdminSupabaseError(roleAdmins.error, "Failed to load admin role assignments");
  throwAdminSupabaseError(recentApplicationsResult.error, "Failed to load recent notary applications");
  throwAdminSupabaseError(recentActivityResult.error, "Failed to load recent admin activity");

  const legacyAdminIds = ((legacyAdmins.data ?? []) as Record<string, unknown>[])
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string");
  const roleAdminIds = ((roleAdmins.data ?? []) as Record<string, unknown>[])
    .map((row) => row.user_id)
    .filter((value): value is string => typeof value === "string");
  const adminCount = new Set([...legacyAdminIds, ...roleAdminIds]).size;

  const recentApplications = (recentApplicationsResult.data ?? []) as Record<string, unknown>[];
  const recentActivity = (recentActivityResult.data ?? []) as Record<string, unknown>[];
  const usersById = await toUserSummaryById([
    ...recentApplications.map((row) => String(row.user_id ?? "")),
    ...recentActivity.map((row) => String(row.actor_id ?? "")),
  ]);

  return {
    capabilities: context.capabilities,
    metrics: {
      notaryApplications: {
        total: totalApplications,
        pending: pendingApplications,
        approved: approvedApplications,
        rejected: rejectedApplications,
      },
      users: {
        total: totalUsers,
        active: activeUsers,
        admins: adminCount,
      },
    },
    recentNotaryApplications: recentApplications.map((row) =>
      mapNotaryApplicationRow(withUserSummary(row, usersById.get(String(row.user_id ?? "")))),
    ),
    recentActivity: recentActivity.map((row) =>
      mapAuditRow(withActorSummary(row, usersById.get(String(row.actor_id ?? "")))),
    ),
  };
};

export const listAdminUsers = async (input: { search?: string; limit?: number }) => {
  await ensureAdminProfileSchema();
  const search = input.search?.trim().toLowerCase() ?? "";
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);

  const result = await pool.query(
    `
      select
        u.id,
        u.supabase_user_id,
        u.email,
        u.phone,
        u.first_name,
        u.last_name,
        u.role,
        u.status,
        u.created_at,
        u.last_sign_in_at,
        u.last_auth_synced_at,
        ap.can_manage_admins,
        ap.can_review_notaries,
        ap.can_manage_users,
        ap.can_view_audit,
        ap.can_manage_platform_rules,
        coalesce(document_counts.document_count, 0)::int as document_count,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', ur.id,
              'role', ur.role,
              'status', ur.status,
              'is_active_profile', ur.is_active_profile,
              'granted_reason', ur.granted_reason,
              'created_at', ur.created_at,
              'updated_at', ur.updated_at
            )
            order by ur.created_at asc
          ) filter (where ur.id is not null),
          '[]'::jsonb
        ) as roles
      from public.users u
      left join public.user_roles ur on ur.user_id = u.id
      left join public.admin_permissions ap on ap.user_id = u.id
      left join lateral (
        select count(*)::int as document_count
        from public.documents d
        where d.owner_id = u.id
      ) document_counts on true
      where $1 = ''
        or lower(coalesce(u.email, '')) like '%' || $1 || '%'
        or lower(coalesce(u.phone, '')) like '%' || $1 || '%'
        or lower(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) like '%' || $1 || '%'
      group by u.id, ap.user_id, document_counts.document_count
      order by u.created_at desc
      limit $2
    `,
    [search, limit],
  );

  return result.rows.map((row) => mapUserRow(row as Record<string, unknown>));
};

export const updateAdminUserStatus = async (input: {
  userId: string;
  status: "active" | "suspended";
  actor: AdminProfileContext;
}) => {
  await ensureAdminProfileSchema();
  if (input.actor.dbUserId && input.actor.dbUserId === input.userId && input.status !== "active") {
    throw new AdminProfileServiceError(400, "You cannot suspend your own account.");
  }

  const result = await pool.query(
    `
      update public.users
      set status = $2
      where id = $1
      returning id, email, phone, first_name, last_name, role, status, created_at, supabase_user_id
    `,
    [input.userId, input.status],
  );

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw new AdminProfileServiceError(404, "User not found");
  }

  await recordAdminAudit({
    actor: input.actor,
    entityType: "user",
    entityId: input.userId,
    action: input.status === "active" ? "admin.user_reactivated" : "admin.user_suspended",
    metadata: { status: input.status },
  });

  return mapUserRow({ ...row, roles: [] });
};

export const listAdminTeam = async () => {
  await ensureAdminProfileSchema();

  const result = await pool.query(`
    select
      u.id,
      u.supabase_user_id,
      u.email,
      u.phone,
      u.first_name,
      u.last_name,
      u.role,
      u.status,
      u.created_at,
      u.last_sign_in_at,
      u.last_auth_synced_at,
      ap.can_manage_admins,
      ap.can_review_notaries,
      ap.can_manage_users,
      ap.can_view_audit,
      ap.can_manage_platform_rules,
      ap.granted_reason,
      ap.updated_at as permissions_updated_at,
      coalesce(document_counts.document_count, 0)::int as document_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', ur.id,
            'role', ur.role,
            'status', ur.status,
            'is_active_profile', ur.is_active_profile,
            'granted_reason', ur.granted_reason,
            'created_at', ur.created_at,
            'updated_at', ur.updated_at
          )
          order by ur.created_at asc
        ) filter (where ur.id is not null),
        '[]'::jsonb
      ) as roles
    from public.users u
    left join public.user_roles ur on ur.user_id = u.id
    left join public.admin_permissions ap on ap.user_id = u.id
    left join lateral (
      select count(*)::int as document_count
      from public.documents d
      where d.owner_id = u.id
    ) document_counts on true
    where u.role = 'admin'
      or exists (
        select 1 from public.user_roles active_admin
        where active_admin.user_id = u.id
          and active_admin.role = 'admin'
          and active_admin.status = 'active'
      )
      or ap.user_id is not null
    group by u.id, ap.user_id, document_counts.document_count
    order by u.email asc nulls last, u.created_at desc
  `);

  return result.rows.map((row) => ({
    ...mapUserRow(row as Record<string, unknown>),
    permissionsUpdatedAt: toIsoString((row as Record<string, unknown>).permissions_updated_at),
  }));
};

export const grantAdminByEmail = async (input: {
  email: string;
  canManageAdmins: boolean;
  actor: AdminProfileContext;
}) => {
  await ensureAdminProfileSchema();
  const email = input.email.trim().toLowerCase();
  const userResult = await pool.query(
    "select id, supabase_user_id, email from public.users where lower(email) = $1 limit 1",
    [email],
  );
  const user = userResult.rows[0] as Record<string, unknown> | undefined;

  if (!user) {
    throw new AdminProfileServiceError(404, "No user was found for that email.");
  }

  const userId = String(user.id);

  await pool.query(
    `
      insert into public.user_roles (user_id, role, status, is_active_profile, granted_by_user_id, granted_reason)
      values ($1, 'admin', 'active', false, $2, 'Granted from admin team dashboard')
      on conflict (user_id, role) do update
      set status = 'active',
        granted_by_user_id = excluded.granted_by_user_id,
        granted_reason = excluded.granted_reason,
        updated_at = now()
    `,
    [userId, input.actor.dbUserId],
  );

  await pool.query(
    `
      insert into public.admin_permissions (
        user_id,
        can_manage_admins,
        can_review_notaries,
        can_manage_users,
        can_view_audit,
        can_manage_platform_rules,
        granted_by_user_id,
        granted_reason
      )
      values ($1, $2, true, true, true, false, $3, 'Granted from admin team dashboard')
      on conflict (user_id) do update
      set can_manage_admins = excluded.can_manage_admins,
        can_review_notaries = true,
        can_manage_users = true,
        can_view_audit = true,
        granted_by_user_id = excluded.granted_by_user_id,
        granted_reason = excluded.granted_reason,
        updated_at = now()
    `,
    [userId, input.canManageAdmins, input.actor.dbUserId],
  );

  await recordAdminAudit({
    actor: input.actor,
    entityType: "user",
    entityId: userId,
    action: "admin.team_member_added",
    metadata: { email, canManageAdmins: input.canManageAdmins },
  });

  return listAdminTeam();
};

export const revokeAdminByUserId = async (input: { userId: string; actor: AdminProfileContext }) => {
  await ensureAdminProfileSchema();
  if (input.actor.dbUserId && input.actor.dbUserId === input.userId) {
    throw new AdminProfileServiceError(400, "You cannot remove your own admin access.");
  }

  await pool.query(
    `
      update public.user_roles
      set status = 'revoked',
        is_active_profile = false,
        updated_at = now()
      where user_id = $1
        and role = 'admin'
    `,
    [input.userId],
  );

  await pool.query("delete from public.admin_permissions where user_id = $1", [input.userId]);
  await pool.query("update public.users set role = 'member' where id = $1 and role = 'admin'", [input.userId]);
  await pool.query(
    `
      update public.user_roles
      set is_active_profile = true,
        updated_at = now()
      where id = (
        select id
        from public.user_roles
        where user_id = $1
          and role = 'member'
          and status = 'active'
        order by created_at asc
        limit 1
      )
    `,
    [input.userId],
  );

  await recordAdminAudit({
    actor: input.actor,
    entityType: "user",
    entityId: input.userId,
    action: "admin.team_member_removed",
  });

  return listAdminTeam();
};

export const listAdminActivity = async (input: { limit?: number }) => {
  await ensureAdminProfileSchema();
  const limit = Math.min(Math.max(input.limit ?? 80, 1), 150);
  const result = await pool.query(
    `
      select
        ae.id,
        ae.actor_id,
        ae.entity_type,
        ae.entity_id,
        ae.action,
        ae.metadata,
        ae.created_at,
        actor.email as actor_email,
        actor.first_name as actor_first_name,
        actor.last_name as actor_last_name
      from public.audit_events ae
      left join public.users actor on actor.id = ae.actor_id
      order by ae.created_at desc
      limit $1
    `,
    [limit],
  );

  return result.rows.map((row) => mapAuditRow(row as Record<string, unknown>));
};

const recordAdminAudit = async (input: {
  actor: AdminProfileContext;
  entityType: string;
  entityId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
}) => {
  await pool.query(
    `
      insert into public.audit_events (actor_id, entity_type, entity_id, action, metadata)
      values ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      input.actor.dbUserId,
      input.entityType,
      input.entityId ?? null,
      input.action,
      JSON.stringify({
        ...(input.metadata ?? {}),
        actor_supabase_id: input.actor.supabaseUserId,
        actor_email: input.actor.email,
      }),
    ],
  );
};
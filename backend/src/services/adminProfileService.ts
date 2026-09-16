import { createClient } from "@supabase/supabase-js";

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

// Schema and bootstrap admin grants are owned by migrations, not user requests.

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

const toRowsByUserId = (rows: Record<string, unknown>[], userIdKey: string) => {
  return rows.reduce<Map<string, Record<string, unknown>[]>>((map, row) => {
    const userId = row[userIdKey] == null ? "" : String(row[userIdKey]);
    if (!userId) {
      return map;
    }

    const existing = map.get(userId) ?? [];
    existing.push(row);
    map.set(userId, existing);
    return map;
  }, new Map());
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
  const search = input.search?.trim().toLowerCase() ?? "";
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);

  let usersQuery = supabaseAdmin
    .from("users")
    .select("id, supabase_user_id, email, phone, first_name, last_name, role, status, created_at, last_sign_in_at, last_auth_synced_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (search) {
    const escapedSearch = search.replace(/[%,]/g, "");
    usersQuery = usersQuery.or(
      [
        `email.ilike.%${escapedSearch}%`,
        `phone.ilike.%${escapedSearch}%`,
        `first_name.ilike.%${escapedSearch}%`,
        `last_name.ilike.%${escapedSearch}%`,
      ].join(","),
    );
  }

  const { data: usersData, error: usersError } = await usersQuery;
  throwAdminSupabaseError(usersError, "Failed to load users");

  const users = (usersData ?? []) as Record<string, unknown>[];
  return (await loadAdminUserDetails(users)).map(mapUserRow);
};

const loadAdminUserDetails = async (users: Record<string, unknown>[]) => {
  const userIds = users.map((user) => String(user.id)).filter(Boolean);
  if (userIds.length === 0) {
    return [];
  }

  const [rolesResult, permissionsResult, documentsResult] = await Promise.all([
    supabaseAdmin
      .from("user_roles")
      .select("id, user_id, role, status, is_active_profile, granted_reason, created_at, updated_at")
      .in("user_id", userIds)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("admin_permissions")
      .select("user_id, can_manage_admins, can_review_notaries, can_manage_users, can_view_audit, can_manage_platform_rules, updated_at")
      .in("user_id", userIds),
    supabaseAdmin
      .from("documents")
      .select("id, owner_id")
      .in("owner_id", userIds),
  ]);

  throwAdminSupabaseError(rolesResult.error, "Failed to load user roles");
  throwAdminSupabaseError(permissionsResult.error, "Failed to load admin permissions");
  throwAdminSupabaseError(documentsResult.error, "Failed to load user document counts");

  const rolesByUserId = toRowsByUserId((rolesResult.data ?? []) as Record<string, unknown>[], "user_id");
  const permissionsByUserId = new Map(
    ((permissionsResult.data ?? []) as Record<string, unknown>[]).map((row) => [String(row.user_id), row]),
  );
  const documentCountByUserId = ((documentsResult.data ?? []) as Record<string, unknown>[]).reduce<Map<string, number>>(
    (map, row) => {
      const ownerId = row.owner_id == null ? "" : String(row.owner_id);
      if (ownerId) {
        map.set(ownerId, (map.get(ownerId) ?? 0) + 1);
      }
      return map;
    },
    new Map(),
  );

  return users.map((user) => {
    const userId = String(user.id);
    const permissions = permissionsByUserId.get(userId);
    return {
      ...user,
      ...(permissions ?? {}),
      permissions_updated_at: permissions?.updated_at ?? null,
      document_count: documentCountByUserId.get(userId) ?? 0,
      roles: rolesByUserId.get(userId) ?? [],
    };
  });
};

export const updateAdminUserStatus = async (input: {
  userId: string;
  status: "active" | "suspended";
  actor: AdminProfileContext;
}) => {
  if (input.actor.dbUserId && input.actor.dbUserId === input.userId && input.status !== "active") {
    throw new AdminProfileServiceError(400, "You cannot suspend your own account.");
  }

  const { data: row, error } = await supabaseAdmin
    .from("users")
    .update({ status: input.status })
    .eq("id", input.userId)
    .select("id, email, phone, first_name, last_name, role, status, created_at, supabase_user_id")
    .maybeSingle();
  throwAdminSupabaseError(error, "Failed to update user status");
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
  const [legacyAdmins, roleAdmins, permissions] = await Promise.all([
    supabaseAdmin.from("users").select("id").eq("role", "admin"),
    supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin").eq("status", "active"),
    supabaseAdmin.from("admin_permissions").select("user_id"),
  ]);
  throwAdminSupabaseError(legacyAdmins.error, "Failed to load admin users");
  throwAdminSupabaseError(roleAdmins.error, "Failed to load admin roles");
  throwAdminSupabaseError(permissions.error, "Failed to load admin permissions");

  const userIds = Array.from(new Set([
    ...(legacyAdmins.data ?? []).map((row) => String(row.id)),
    ...(roleAdmins.data ?? []).map((row) => String(row.user_id)),
    ...(permissions.data ?? []).map((row) => String(row.user_id)),
  ]));
  if (userIds.length === 0) {
    return [];
  }

  const { data: users, error } = await supabaseAdmin
    .from("users")
    .select("id, supabase_user_id, email, phone, first_name, last_name, role, status, created_at, last_sign_in_at, last_auth_synced_at")
    .in("id", userIds)
    .order("email", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  throwAdminSupabaseError(error, "Failed to load admin team");

  return (await loadAdminUserDetails(users ?? [])).map((row) => ({
    ...mapUserRow(row),
    permissionsUpdatedAt: toIsoString(row.permissions_updated_at),
  }));
};

export const grantAdminByEmail = async (input: {
  email: string;
  canManageAdmins: boolean;
  actor: AdminProfileContext;
}) => {
  const email = input.email.trim().toLowerCase();
  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select(adminContextUserSelect)
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .limit(1)
    .maybeSingle();
  throwAdminSupabaseError(userError, "Failed to find user");

  if (!user) {
    throw new AdminProfileServiceError(404, "No user was found for that email.");
  }

  const userId = String(user.id);

  const updatedAt = new Date().toISOString();
  const { error: roleError } = await supabaseAdmin.from("user_roles").upsert({
    user_id: userId,
    role: "admin",
    status: "active",
    // New roles default to inactive; an existing active profile must not be reset.
    granted_by_user_id: input.actor.dbUserId,
    granted_reason: "Granted from admin team dashboard",
    updated_at: updatedAt,
  }, { onConflict: "user_id,role" });
  throwAdminSupabaseError(roleError, "Failed to grant admin role");

  const { error: permissionsError } = await supabaseAdmin.from("admin_permissions").upsert({
    user_id: userId,
    can_manage_admins: input.canManageAdmins,
    can_review_notaries: true,
    can_manage_users: true,
    can_view_audit: true,
    // Platform-rule access defaults to false; preserve an existing explicit grant.
    granted_by_user_id: input.actor.dbUserId,
    granted_reason: "Granted from admin team dashboard",
    updated_at: updatedAt,
  }, { onConflict: "user_id" });
  throwAdminSupabaseError(permissionsError, "Failed to grant admin permissions");

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
  if (input.actor.dbUserId && input.actor.dbUserId === input.userId) {
    throw new AdminProfileServiceError(400, "You cannot remove your own admin access.");
  }

  const { error: roleError } = await supabaseAdmin.from("user_roles")
    .update({ status: "revoked", is_active_profile: false, updated_at: new Date().toISOString() })
    .eq("user_id", input.userId)
    .eq("role", "admin");
  throwAdminSupabaseError(roleError, "Failed to revoke admin role");

  const { error: permissionsError } = await supabaseAdmin.from("admin_permissions")
    .delete().eq("user_id", input.userId);
  throwAdminSupabaseError(permissionsError, "Failed to remove admin permissions");

  const { error: userError } = await supabaseAdmin.from("users")
    .update({ role: "member" }).eq("id", input.userId).eq("role", "admin");
  throwAdminSupabaseError(userError, "Failed to update user role");

  const { data: activeProfile, error: profileError } = await supabaseAdmin.from("user_roles")
    .select("id").eq("user_id", input.userId).eq("status", "active")
    .eq("is_active_profile", true).limit(1).maybeSingle();
  throwAdminSupabaseError(profileError, "Failed to load active profile");

  if (!activeProfile) {
    const { error: fallbackError } = await supabaseAdmin.from("user_roles")
      .update({ is_active_profile: true, updated_at: new Date().toISOString() })
      .eq("user_id", input.userId).eq("role", "member").eq("status", "active");
    throwAdminSupabaseError(fallbackError, "Failed to restore member profile");
  }

  await recordAdminAudit({
    actor: input.actor,
    entityType: "user",
    entityId: input.userId,
    action: "admin.team_member_removed",
  });

  return listAdminTeam();
};

export const listAdminActivity = async (input: { limit?: number }) => {
  const limit = Math.min(Math.max(input.limit ?? 80, 1), 150);
  const { data, error } = await supabaseAdmin.from("audit_events")
    .select("id, actor_id, entity_type, entity_id, action, metadata, created_at")
    .order("created_at", { ascending: false }).limit(limit);
  throwAdminSupabaseError(error, "Failed to load admin activity");
  const rows = (data ?? []) as Record<string, unknown>[];
  const actors = await toUserSummaryById(rows.map((row) => String(row.actor_id ?? "")));
  return rows.map((row) => mapAuditRow(withActorSummary(row, actors.get(String(row.actor_id ?? "")))));
};

const recordAdminAudit = async (input: {
  actor: AdminProfileContext;
  entityType: string;
  entityId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
}) => {
  const { error } = await supabaseAdmin.from("audit_events").insert({
    actor_id: input.actor.dbUserId,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    action: input.action,
    metadata: {
      ...(input.metadata ?? {}),
      actor_supabase_id: input.actor.supabaseUserId,
      actor_email: input.actor.email,
    },
  });
  throwAdminSupabaseError(error, "Failed to record admin audit event");
};
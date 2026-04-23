import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const runtimeRoleValues = ["member", "pro", "notary", "admin"] as const;

export type RuntimeRole = (typeof runtimeRoleValues)[number];
export type RequestRole = RuntimeRole | "service_role";
export type UserRoleStatus = "active" | "suspended" | "revoked";

type UserRow = {
  id: string;
  supabase_user_id: string;
  email: string | null;
  role: string | null;
  status: string | null;
  first_name: string | null;
  last_name: string | null;
};

type UserRoleRow = {
  id: string;
  role: string;
  status: string;
  is_active_profile: boolean;
  granted_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type UserRoleAssignment = {
  id: string;
  role: RuntimeRole;
  status: UserRoleStatus;
  isActiveProfile: boolean;
  grantedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserIdentityContext = {
  id: string;
  supabaseUserId: string;
  email: string | null;
  role: RuntimeRole;
  status: string;
  firstName: string | null;
  lastName: string | null;
  availableRoles: RuntimeRole[];
  roleAssignments: UserRoleAssignment[];
};

export class UserRoleServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const rolePreferenceOrder: RuntimeRole[] = ["member", "pro", "notary", "admin"];

export const isRuntimeRole = (value: unknown): value is RuntimeRole => {
  return typeof value === "string" && runtimeRoleValues.includes(value as RuntimeRole);
};

export const normalizeRuntimeRole = (value?: string | null): RuntimeRole => {
  if (value === "pro" || value === "notary" || value === "admin") {
    return value;
  }

  return "member";
};

export const roleSatisfiesRequirement = (
  actualRole: string | undefined,
  requiredRole: RequestRole,
) => {
  if (!actualRole) {
    return false;
  }

  if (actualRole === "service_role") {
    return requiredRole === "service_role";
  }

  const normalizedActualRole = normalizeRuntimeRole(actualRole);
  if (normalizedActualRole === requiredRole) {
    return true;
  }

  return normalizedActualRole === "pro" && requiredRole === "member";
};

const sortRuntimeRoles = (roles: RuntimeRole[]) => {
  return Array.from(new Set(roles)).sort((left, right) => {
    return rolePreferenceOrder.indexOf(left) - rolePreferenceOrder.indexOf(right);
  });
};

const mapRoleAssignments = (rows: UserRoleRow[]): UserRoleAssignment[] => {
  return rows.reduce<UserRoleAssignment[]>((assignments, row) => {
    if (!isRuntimeRole(row.role)) {
      return assignments;
    }

    assignments.push({
      id: row.id,
      role: row.role,
      status: (row.status as UserRoleStatus) ?? "active",
      isActiveProfile: Boolean(row.is_active_profile),
      grantedReason: row.granted_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });

    return assignments;
  }, []);
};

const selectUserRowBySupabaseId = async (supabaseUserId: string) => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, supabase_user_id, email, role, status, first_name, last_name")
    .eq("supabase_user_id", supabaseUserId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as UserRow | null) ?? null;
};

const selectUserRowById = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, supabase_user_id, email, role, status, first_name, last_name")
    .eq("id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as UserRow | null) ?? null;
};

const selectRoleRowsByUserId = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("id, role, status, is_active_profile, granted_reason, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as UserRoleRow[] | null) ?? [];
};

const deriveAvailableRoles = (
  assignments: UserRoleAssignment[],
  fallbackRole: RuntimeRole,
) => {
  const activeRoles = assignments
    .filter((assignment) => assignment.status === "active")
    .map((assignment) => assignment.role);

  if (activeRoles.length === 0) {
    return [fallbackRole];
  }

  return sortRuntimeRoles(activeRoles);
};

const deriveActiveRole = (
  assignments: UserRoleAssignment[],
  fallbackRole: RuntimeRole,
) => {
  const explicitActiveRole = assignments.find(
    (assignment) => assignment.status === "active" && assignment.isActiveProfile,
  )?.role;

  if (explicitActiveRole) {
    return explicitActiveRole;
  }

  const firstActiveRole = sortRuntimeRoles(
    assignments
      .filter((assignment) => assignment.status === "active")
      .map((assignment) => assignment.role),
  )[0];

  return firstActiveRole ?? fallbackRole;
};

const buildIdentityContext = async (userRow: UserRow) => {
  const assignments = mapRoleAssignments(await selectRoleRowsByUserId(userRow.id));
  const fallbackRole = normalizeRuntimeRole(userRow.role);
  const availableRoles = deriveAvailableRoles(assignments, fallbackRole);
  const activeRole = deriveActiveRole(assignments, fallbackRole);

  return {
    id: userRow.id,
    supabaseUserId: userRow.supabase_user_id,
    email: userRow.email,
    role: activeRole,
    status: userRow.status ?? "active",
    firstName: userRow.first_name,
    lastName: userRow.last_name,
    availableRoles,
    roleAssignments: assignments,
  } satisfies UserIdentityContext;
};

export const getUserIdentityContextBySupabaseId = async (supabaseUserId: string) => {
  const userRow = await selectUserRowBySupabaseId(supabaseUserId);
  if (!userRow) {
    return null;
  }

  return buildIdentityContext(userRow);
};

export const getUserIdentityContextByUserId = async (userId: string) => {
  const userRow = await selectUserRowById(userId);
  if (!userRow) {
    return null;
  }

  return buildIdentityContext(userRow);
};

export const ensureUserIdentityFromAuth = async (input: {
  supabaseUserId: string;
  email: string | null;
  role?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) => {
  const existingUser = await selectUserRowBySupabaseId(input.supabaseUserId);

  if (!existingUser) {
    if (!input.email) {
      throw new UserRoleServiceError(400, "Email is required to create the user record");
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .insert({
        supabase_user_id: input.supabaseUserId,
        email: input.email,
        role: normalizeRuntimeRole(input.role),
        ...(input.firstName !== undefined ? { first_name: input.firstName } : {}),
        ...(input.lastName !== undefined ? { last_name: input.lastName } : {}),
      })
      .select("id, supabase_user_id, email, role, status, first_name, last_name")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create user record");
    }

    return buildIdentityContext(data as UserRow);
  }

  const nextEmail = input.email ?? existingUser.email;
  const nextFirstName = input.firstName ?? existingUser.first_name;
  const nextLastName = input.lastName ?? existingUser.last_name;
  const existingRole = isRuntimeRole(existingUser.role)
    ? existingUser.role
    : normalizeRuntimeRole(input.role);

  const shouldUpdateUser =
    nextEmail !== existingUser.email ||
    nextFirstName !== existingUser.first_name ||
    nextLastName !== existingUser.last_name ||
    existingRole !== existingUser.role;

  if (shouldUpdateUser) {
    const { error } = await supabaseAdmin
      .from("users")
      .update({
        email: nextEmail,
        role: existingRole,
        ...(nextFirstName !== undefined ? { first_name: nextFirstName } : {}),
        ...(nextLastName !== undefined ? { last_name: nextLastName } : {}),
      })
      .eq("id", existingUser.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  const refreshedContext = await getUserIdentityContextBySupabaseId(input.supabaseUserId);
  if (!refreshedContext) {
    throw new Error("Failed to load user identity context");
  }

  return refreshedContext;
};

const updateAuthUserRoleClaim = async (supabaseUserId: string, role: RuntimeRole) => {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, {
    app_metadata: { role },
  });

  if (error) {
    throw new Error(error.message);
  }
};

const setOnlyActiveProfileRole = async (userId: string, role: RuntimeRole | null) => {
  const { error: clearError } = await supabaseAdmin
    .from("user_roles")
    .update({ is_active_profile: false })
    .eq("user_id", userId)
    .eq("is_active_profile", true);

  if (clearError) {
    throw new Error(clearError.message);
  }

  if (!role) {
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .update({ is_active_profile: true })
    .eq("user_id", userId)
    .eq("role", role)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new UserRoleServiceError(400, `User does not have an active ${role} role`);
  }
};

const choosePreferredActiveRole = (assignments: UserRoleAssignment[], preferredRole?: RuntimeRole) => {
  const activeRoles = assignments
    .filter((assignment) => assignment.status === "active")
    .map((assignment) => assignment.role);

  if (preferredRole && activeRoles.includes(preferredRole)) {
    return preferredRole;
  }

  const activeMarkedRole = assignments.find(
    (assignment) => assignment.status === "active" && assignment.isActiveProfile,
  )?.role;

  if (activeMarkedRole) {
    return activeMarkedRole;
  }

  return sortRuntimeRoles(activeRoles)[0] ?? "member";
};

const reconcileActiveRole = async (input: { userId: string; supabaseUserId: string; preferredRole?: RuntimeRole }) => {
  const context = await getUserIdentityContextByUserId(input.userId);
  if (!context) {
    throw new UserRoleServiceError(404, "User record not found");
  }

  const nextActiveRole = choosePreferredActiveRole(
    context.roleAssignments,
    input.preferredRole,
  );

  await setOnlyActiveProfileRole(input.userId, nextActiveRole);

  const { error: updateUserError } = await supabaseAdmin
    .from("users")
    .update({ role: nextActiveRole })
    .eq("id", input.userId);

  if (updateUserError) {
    throw new Error(updateUserError.message);
  }

  await updateAuthUserRoleClaim(input.supabaseUserId, nextActiveRole);

  const refreshedContext = await getUserIdentityContextByUserId(input.userId);
  if (!refreshedContext) {
    throw new Error("Failed to refresh user identity context");
  }

  return refreshedContext;
};

export const switchActiveRoleBySupabaseUserId = async (input: {
  supabaseUserId: string;
  role: RuntimeRole;
}) => {
  const context = await getUserIdentityContextBySupabaseId(input.supabaseUserId);
  if (!context) {
    throw new UserRoleServiceError(404, "User record not found");
  }

  if (!context.availableRoles.includes(input.role)) {
    throw new UserRoleServiceError(403, `The ${input.role} role is not assigned to this user`);
  }

  return reconcileActiveRole({
    userId: context.id,
    supabaseUserId: context.supabaseUserId,
    preferredRole: input.role,
  });
};

export const listUserRoleAssignmentsBySupabaseUserId = async (supabaseUserId: string) => {
  const context = await getUserIdentityContextBySupabaseId(supabaseUserId);
  if (!context) {
    throw new UserRoleServiceError(404, "User record not found");
  }

  return context;
};

export const upsertUserRoleAssignmentBySupabaseUserId = async (input: {
  supabaseUserId: string;
  role: RuntimeRole;
  status: UserRoleStatus;
  makeActive?: boolean;
  grantedBySupabaseUserId?: string;
  grantedReason?: string;
}) => {
  const authUser = await supabaseAdmin.auth.admin.getUserById(input.supabaseUserId);
  if (authUser.error || !authUser.data.user) {
    throw new UserRoleServiceError(404, authUser.error?.message ?? "Auth user not found");
  }

  const authRole = authUser.data.user.app_metadata?.role;
  const authFirstName = authUser.data.user.user_metadata?.first_name;
  const authLastName = authUser.data.user.user_metadata?.last_name;

  const ensuredContext = await ensureUserIdentityFromAuth({
    supabaseUserId: input.supabaseUserId,
    email: authUser.data.user.email ?? null,
    ...(typeof authRole === "string" ? { role: authRole } : {}),
    ...(typeof authFirstName === "string" ? { firstName: authFirstName } : {}),
    ...(typeof authLastName === "string" ? { lastName: authLastName } : {}),
  });

  if (input.role === "member" && input.status !== "active") {
    throw new UserRoleServiceError(400, "The member role must remain active");
  }

  if (input.makeActive && input.status !== "active") {
    throw new UserRoleServiceError(400, "Only active roles can become the active profile");
  }

  const existingAssignment = ensuredContext.roleAssignments.find((assignment) => {
    return assignment.role === input.role;
  });

  const nextIsActiveProfile = input.makeActive !== undefined
    ? input.makeActive && input.status === "active"
    : input.status === "active" && Boolean(existingAssignment?.isActiveProfile);

  let grantedByUserId: string | undefined;
  if (input.grantedBySupabaseUserId) {
    const grantingContext = await getUserIdentityContextBySupabaseId(input.grantedBySupabaseUserId);
    grantedByUserId = grantingContext?.id;
  }

  const { error } = await supabaseAdmin
    .from("user_roles")
    .upsert(
      {
        user_id: ensuredContext.id,
        role: input.role,
        status: input.status,
        is_active_profile: nextIsActiveProfile,
        ...(grantedByUserId ? { granted_by_user_id: grantedByUserId } : {}),
        ...(input.grantedReason ? { granted_reason: input.grantedReason } : {}),
      },
      { onConflict: "user_id,role" },
    );

  if (error) {
    throw new Error(error.message);
  }

  return reconcileActiveRole({
    userId: ensuredContext.id,
    supabaseUserId: ensuredContext.supabaseUserId,
    ...(nextIsActiveProfile ? { preferredRole: input.role } : {}),
  });
};

export const toUserResponse = (context: UserIdentityContext) => {
  return {
    id: context.id,
    email: context.email ?? "",
    role: context.role,
    availableRoles: context.availableRoles,
    status: context.status,
    firstName: context.firstName,
    lastName: context.lastName,
  };
};

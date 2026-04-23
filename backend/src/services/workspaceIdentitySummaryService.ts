import { getUserIdentityContextByUserId } from "./userRoleService";

export type WorkspaceIdentitySummary = {
  userId: string;
  supabaseUserId: string;
  displayName: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
};

const toFullName = (input: { firstName: string | null; lastName: string | null }) => {
  const fullName = [input.firstName, input.lastName]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim();

  return fullName.length > 0 ? fullName : null;
};

export const getWorkspaceIdentitySummaryByUserId = async (
  userId?: string | null | undefined,
) => {
  const normalizedUserId = userId?.trim() ?? "";
  if (normalizedUserId.length === 0) {
    return null as WorkspaceIdentitySummary | null;
  }

  const user = await getUserIdentityContextByUserId(normalizedUserId);
  if (!user) {
    return null;
  }

  const fullName = toFullName({
    firstName: user.firstName,
    lastName: user.lastName,
  });

  return {
    userId: user.id,
    supabaseUserId: user.supabaseUserId,
    displayName: fullName ?? user.email ?? user.id,
    fullName,
    email: user.email,
    role: user.role,
    status: user.status,
  } satisfies WorkspaceIdentitySummary;
};
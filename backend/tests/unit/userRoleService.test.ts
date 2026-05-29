import { beforeEach, describe, expect, it, vi } from "vitest";

type UserRow = {
  id: string;
  supabase_user_id: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: string | null;
  first_name: string | null;
  last_name: string | null;
  email_confirmed_at: string | null;
  phone_confirmed_at: string | null;
  last_sign_in_at: string | null;
  last_auth_synced_at: string | null;
};

type UserRoleRow = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  is_active_profile: boolean;
  granted_reason: string | null;
  created_at: string;
  updated_at: string;
};

const state = vi.hoisted(() => ({
  users: [] as UserRow[],
  userRoles: [] as UserRoleRow[],
  authUpdateUserByIdMock: vi.fn(),
}));

const now = "2026-05-28T12:00:00.000Z";

const matchesFilters = (
  row: Record<string, unknown>,
  filters: Array<{ column: string; operator: "eq" | "in" | "neq"; value: unknown }>,
) => {
  return filters.every((filter) => {
    if (filter.operator === "neq") {
      return row[filter.column] !== filter.value;
    }

    if (filter.operator === "in") {
      return Array.isArray(filter.value) && filter.value.includes(row[filter.column]);
    }

    return row[filter.column] === filter.value;
  });
};

const getRowsForTable = (table: string) => {
  if (table === "users") {
    return state.users;
  }

  if (table === "user_roles") {
    return state.userRoles;
  }

  return [];
};

const createSelectBuilder = (table: string) => {
  const filters: Array<{ column: string; operator: "eq" | "in" | "neq"; value: unknown }> = [];

  const execute = () => ({
    data: getRowsForTable(table).filter((row) => matchesFilters(row as Record<string, unknown>, filters)),
    error: null,
  });

  const builder = {
    eq(column: string, value: unknown) {
      filters.push({ column, operator: "eq", value });
      return builder;
    },
    limit() {
      return builder;
    },
    order() {
      return builder;
    },
    maybeSingle: async () => {
      const result = execute();
      return { data: result.data[0] ?? null, error: null };
    },
    single: async () => {
      const result = execute();
      return { data: result.data[0] ?? null, error: null };
    },
    then(resolve: (value: { data: unknown[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(execute()).then(resolve, reject);
    },
  };

  return builder;
};

const createUpdateBuilder = (table: string, payload: Record<string, unknown>) => {
  const filters: Array<{ column: string; operator: "eq" | "in" | "neq"; value: unknown }> = [];

  const execute = () => {
    const rows = getRowsForTable(table);
    const updatedRows: unknown[] = [];

    rows.forEach((row) => {
      if (!matchesFilters(row as Record<string, unknown>, filters)) {
        return;
      }

      Object.assign(row as Record<string, unknown>, payload);
      updatedRows.push(row);
    });

    return { data: updatedRows, error: null };
  };

  const builder = {
    eq(column: string, value: unknown) {
      filters.push({ column, operator: "eq", value });
      return builder;
    },
    neq(column: string, value: unknown) {
      filters.push({ column, operator: "neq", value });
      return builder;
    },
    in(column: string, value: unknown[]) {
      filters.push({ column, operator: "in", value });
      return builder;
    },
    select() {
      return builder;
    },
    maybeSingle: async () => {
      const result = execute();
      return { data: result.data[0] ?? null, error: null };
    },
    then(resolve: (value: { data: unknown[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(execute()).then(resolve, reject);
    },
  };

  return builder;
};

const upsertUserRole = (payload: Record<string, unknown>) => {
  const existingRole = state.userRoles.find((row) => {
    return row.user_id === payload.user_id && row.role === payload.role;
  });

  if (existingRole) {
    Object.assign(existingRole, payload, { updated_at: now });
    return;
  }

  state.userRoles.push({
    id: `role-${String(payload.role)}`,
    user_id: String(payload.user_id),
    role: String(payload.role),
    status: String(payload.status),
    is_active_profile: Boolean(payload.is_active_profile),
    granted_reason: typeof payload.granted_reason === "string" ? payload.granted_reason : null,
    created_at: now,
    updated_at: now,
  });
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: {
            user: {
              id: "auth-user-1",
              email: "notary@example.com",
              phone: null,
              app_metadata: { role: "member" },
              user_metadata: {},
            },
          },
          error: null,
        })),
        updateUserById: state.authUpdateUserByIdMock,
      },
    },
    from: vi.fn((table: string) => ({
      select: () => createSelectBuilder(table),
      update: (payload: Record<string, unknown>) => createUpdateBuilder(table, payload),
      upsert: async (payload: Record<string, unknown>) => {
        if (table === "user_roles") {
          upsertUserRole(payload);
        }

        return { error: null };
      },
    })),
  })),
}));

describe("user role service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    state.users = [
      {
        id: "db-user-1",
        supabase_user_id: "auth-user-1",
        email: "notary@example.com",
        phone: "+15555550123",
        role: "member",
        status: "active",
        first_name: "Nora",
        last_name: "Notary",
        email_confirmed_at: null,
        phone_confirmed_at: null,
        last_sign_in_at: null,
        last_auth_synced_at: null,
      },
    ];
    state.userRoles = [];
    state.authUpdateUserByIdMock.mockResolvedValue({ error: null });
  });

  it("grants notary access without wiping a saved phone and keeps member switch access", async () => {
    const { upsertUserRoleAssignmentBySupabaseUserId } = await import("../../src/services/userRoleService");

    const context = await upsertUserRoleAssignmentBySupabaseUserId({
      supabaseUserId: "auth-user-1",
      role: "notary",
      status: "active",
      makeActive: true,
      grantedBySupabaseUserId: "admin-auth-user-1",
      grantedReason: "Approved notary application",
    });

    expect(context.phone).toBe("+15555550123");
    expect(context.role).toBe("notary");
    expect(context.availableRoles).toEqual(["member", "notary"]);
    expect(state.users[0]?.phone).toBe("+15555550123");
    expect(state.userRoles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "member", status: "active", is_active_profile: false }),
        expect.objectContaining({ role: "notary", status: "active", is_active_profile: true }),
      ]),
    );
  });

  it("keeps the dev notary test user on member without requiring a phone", async () => {
    state.users = [
      {
        id: "db-user-1",
        supabase_user_id: "auth-user-1",
        email: "dev.intelligentleads@gmail.com",
        phone: null,
        role: "member",
        status: "active",
        first_name: "Dev",
        last_name: "Notary",
        email_confirmed_at: null,
        phone_confirmed_at: null,
        last_sign_in_at: null,
        last_auth_synced_at: null,
      },
    ];

    const { ensureUserIdentityFromAuth, isUserProfileComplete } = await import("../../src/services/userRoleService");

    const context = await ensureUserIdentityFromAuth({
      supabaseUserId: "auth-user-1",
      email: "dev.intelligentleads@gmail.com",
      phone: null,
      role: "member",
    });

    expect(context.phone).toBeNull();
    expect(context.role).toBe("member");
    expect(context.availableRoles).toEqual(["member"]);
    expect(isUserProfileComplete(context)).toBe(true);
    expect(state.users[0]?.role).toBe("member");
    expect(state.userRoles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "member", status: "active", is_active_profile: true }),
      ]),
    );
    expect(state.userRoles).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "admin", status: "active" }),
      ]),
    );
  });
});
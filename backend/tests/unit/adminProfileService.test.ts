import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  poolQueryMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: mocks.fromMock,
  })),
}));

vi.mock("../../src/db/pool", () => ({
  pool: {
    query: mocks.poolQueryMock,
  },
}));

type QueryState = {
  tableName: string;
  filters: Array<{ column: string; value: unknown }>;
  orFilter: string | null;
  inFilter: { column: string; values: unknown[] } | null;
  selectOptions: { count?: string; head?: boolean } | null;
  single: boolean;
};

const hasFilter = (state: QueryState, column: string, value: unknown) => {
  return state.filters.some((filter) => filter.column === column && filter.value === value);
};

const responseFor = (state: QueryState) => {
  if (state.tableName === "users" && state.single && hasFilter(state, "supabase_user_id", "supabase-admin-1")) {
    return {
      data: {
        id: "admin-user-1",
        supabase_user_id: "supabase-admin-1",
        email: "admin@example.com",
      },
      error: null,
    };
  }

  if (state.tableName === "admin_permissions" && state.single) {
    return {
      data: {
        can_manage_admins: true,
        can_review_notaries: true,
        can_manage_users: true,
        can_view_audit: true,
        can_manage_platform_rules: false,
      },
      error: null,
    };
  }

  if (state.selectOptions?.head) {
    if (state.tableName === "notary_profile_applications") {
      if (hasFilter(state, "status", "pending")) {
        return { count: 1, error: null };
      }
      if (hasFilter(state, "status", "approved")) {
        return { count: 2, error: null };
      }
      if (hasFilter(state, "status", "rejected")) {
        return { count: 3, error: null };
      }
      return { count: 6, error: null };
    }

    if (state.tableName === "users") {
      return { count: state.orFilter ? 4 : 5, error: null };
    }
  }

  if (state.tableName === "users" && hasFilter(state, "role", "admin")) {
    return { data: [{ id: "legacy-admin-1" }], error: null };
  }

  if (state.tableName === "user_roles") {
    return { data: [{ user_id: "role-admin-1" }], error: null };
  }

  if (state.tableName === "notary_profile_applications") {
    return {
      data: [{
        id: "application-1",
        user_id: "applicant-1",
        status: "pending",
        jurisdiction: "US-OH",
        service_area_kind: "county",
        service_area_name: "Franklin",
        created_at: "2026-05-29T00:00:00.000Z",
        updated_at: "2026-05-29T00:00:00.000Z",
      }],
      error: null,
    };
  }

  if (state.tableName === "audit_events") {
    return {
      data: [{
        id: "audit-1",
        actor_id: "admin-user-1",
        entity_type: "notary_profile_application",
        entity_id: "application-1",
        action: "admin.notary_application_viewed",
        metadata: { status: "pending" },
        created_at: "2026-05-29T00:00:00.000Z",
      }],
      error: null,
    };
  }

  if (state.tableName === "users" && state.inFilter) {
    return {
      data: [
        {
          id: "applicant-1",
          supabase_user_id: "supabase-applicant-1",
          email: "applicant@example.com",
          phone: "5550101000",
          first_name: "App",
          last_name: "Licant",
        },
        {
          id: "admin-user-1",
          supabase_user_id: "supabase-admin-1",
          email: "admin@example.com",
          phone: null,
          first_name: "Ada",
          last_name: "Admin",
        },
      ],
      error: null,
    };
  }

  if (state.tableName === "users") {
    return {
      data: [
        {
          id: "member-1",
          supabase_user_id: "supabase-member-1",
          email: "member@example.com",
          phone: null,
          first_name: "Maya",
          last_name: "Member",
          role: "member",
          status: "active",
          created_at: "2026-05-28T00:00:00.000Z",
          last_sign_in_at: "2026-05-29T00:00:00.000Z",
          last_auth_synced_at: "2026-05-29T00:00:00.000Z",
        },
      ],
      error: null,
    };
  }

  if (state.tableName === "admin_permissions") {
    return {
      data: [
        {
          user_id: "member-1",
          can_manage_admins: false,
          can_review_notaries: true,
          can_manage_users: true,
          can_view_audit: true,
          can_manage_platform_rules: false,
        },
      ],
      error: null,
    };
  }

  if (state.tableName === "documents") {
    return {
      data: [
        { id: "document-1", owner_id: "member-1" },
        { id: "document-2", owner_id: "member-1" },
      ],
      error: null,
    };
  }

  return { data: [], error: null };
};

const buildQuery = (tableName: string) => {
  const state: QueryState = {
    tableName,
    filters: [],
    orFilter: null,
    inFilter: null,
    selectOptions: null,
    single: false,
  };
  const query = {
    select: vi.fn((_columns: string, options?: { count?: string; head?: boolean }) => {
      state.selectOptions = options ?? null;
      return query;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      state.filters.push({ column, value });
      return query;
    }),
    or: vi.fn((filter: string) => {
      state.orFilter = filter;
      return query;
    }),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    in: vi.fn((column: string, values: unknown[]) => {
      state.inFilter = { column, values };
      return query;
    }),
    maybeSingle: vi.fn(async () => {
      state.single = true;
      return responseFor(state);
    }),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      return Promise.resolve(responseFor(state)).then(resolve, reject);
    },
  };

  return query;
};

import {
  getAdminDashboard,
  getAdminProfileContext,
  listAdminUsers,
} from "../../src/services/adminProfileService";

describe("adminProfileService", () => {
  beforeEach(() => {
    mocks.fromMock.mockReset();
    mocks.poolQueryMock.mockReset();
    mocks.fromMock.mockImplementation((tableName: string) => buildQuery(tableName));
  });

  it("loads admin dashboard through Supabase without direct database access", async () => {
    const context = await getAdminProfileContext({ supabaseUserId: "supabase-admin-1", role: "admin" });
    const dashboard = await getAdminDashboard(context);

    expect(context.capabilities.canReviewNotaries).toBe(true);
    expect(dashboard.metrics.notaryApplications).toEqual({
      total: 6,
      pending: 1,
      approved: 2,
      rejected: 3,
    });
    expect(dashboard.metrics.users).toEqual({
      total: 5,
      active: 4,
      admins: 2,
    });
    expect(dashboard.recentNotaryApplications[0]?.applicant.email).toBe("applicant@example.com");
    expect(dashboard.recentActivity[0]?.actor?.email).toBe("admin@example.com");
    expect(mocks.poolQueryMock).not.toHaveBeenCalled();
  });

  it("loads admin users through Supabase without direct database access", async () => {
    const users = await listAdminUsers({ search: "member", limit: 25 });

    expect(users).toEqual([
      expect.objectContaining({
        id: "member-1",
        displayName: "Maya Member",
        documentCount: 2,
        adminPermissions: expect.objectContaining({
          canManageUsers: true,
        }),
      }),
    ]);
    expect(mocks.poolQueryMock).not.toHaveBeenCalled();
  });
});
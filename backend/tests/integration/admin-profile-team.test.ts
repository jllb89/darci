import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), poolQuery: vi.fn() }));

vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/supabase-js")>();
  return {
    ...actual,
    createClient: (_url: string, _key: string, options: Record<string, unknown> = {}) =>
      actual.createClient("https://supabase.example.test", "test-service-key", {
        ...options,
        global: { fetch: mocks.fetch },
      }),
  };
});

vi.mock("../../src/db/pool", () => ({ pool: { query: mocks.poolQuery } }));

import adminRoutes from "../../src/routes/admin";

type Row = Record<string, unknown>;
type Call = { table: string; method: string; url: URL; body: Row | null };
let tables: Record<string, Row[]>;
let calls: Call[];
let failure: { table: string; method: string; persistent?: boolean } | null;

const timestamp = "2026-09-16T12:00:00.000Z";
const actorId = "00000000-0000-4000-8000-000000000101";
const memberId = "00000000-0000-4000-8000-000000000102";

const user = (id: string, email: string, role = "member"): Row => ({
  id, email, role, supabase_user_id: `auth-${id}`, status: "active",
  first_name: "Test", last_name: "User", created_at: timestamp,
});

const role = (userId: string, name: string, active: boolean): Row => ({
  id: `${userId}-${name}`, user_id: userId, role: name,
  status: "active", is_active_profile: active, created_at: timestamp, updated_at: timestamp,
});

const matchesIlike = (value: unknown, pattern: string) => {
  let expression = "";
  const escape = (character: string) => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === "\\" && index + 1 < pattern.length) {
      expression += escape(pattern[++index]!);
    } else {
      expression += character === "%" ? ".*" : character === "_" ? "." : escape(character);
    }
  }
  return new RegExp(`^${expression}$`, "i").test(String(value ?? ""));
};

const matchesFilters = (row: Row, url: URL) => {
  for (const [column, value] of url.searchParams) {
    if (["select", "order", "limit", "on_conflict"].includes(column)) continue;
    if (value.startsWith("eq.") && String(row[column]) !== value.slice(3)) return false;
    if (value.startsWith("in.(") && !value.slice(4, -1).split(",").includes(String(row[column]))) return false;
    if (value.startsWith("ilike.") && !matchesIlike(row[column], value.slice(6))) return false;
  }
  return true;
};

const handleSupabase = async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const table = url.pathname.split("/").at(-1)!;
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) as Row : null;
  calls.push({ table, method, url, body });
  if (!tables[table]) throw new Error(`Unexpected Supabase table: ${table}`);

  if (failure?.table === table && failure.method === method) {
    if (!failure.persistent) failure = null;
    return new Response(JSON.stringify({ message: "Simulated database outage", code: "TEST_FAILURE" }), {
      status: 503, headers: { "Content-Type": "application/json" },
    });
  }

  let rows = tables[table].filter((row) => matchesFilters(row, url));
  if (method === "POST" && body) {
    const conflictKeys = url.searchParams.get("on_conflict")?.split(",");
    const existing = conflictKeys
      ? tables[table].find((row) => conflictKeys.every((key) => row[key] === body[key]))
      : undefined;
    if (existing) {
      Object.assign(existing, body);
      rows = [existing];
    } else {
      const created = {
        ...(table === "admin_permissions" ? {} : { id: `created-${table}-${tables[table].length}` }),
        created_at: timestamp,
        ...(table === "user_roles" ? { is_active_profile: false } : {}),
        ...(table === "admin_permissions" ? { can_manage_platform_rules: false } : {}),
        ...body,
      };
      tables[table].push(created);
      rows = [created];
    }
  } else if (method === "PATCH") {
    rows.forEach((row) => Object.assign(row, body));
  } else if (method === "DELETE") {
    tables[table] = tables[table].filter((row) => !rows.includes(row));
    rows = [];
  }

  const limit = url.searchParams.get("limit");
  if (limit) rows = rows.slice(0, Number(limit));
  const selectedColumns = url.searchParams.get("select");
  if (selectedColumns && selectedColumns !== "*") {
    rows = rows.map((row) => Object.fromEntries(
      selectedColumns.split(",").map((column) => [column.trim(), row[column.trim()]]),
    ));
  }
  const wantsSingle = new Headers(init?.headers).get("Accept")?.includes("application/vnd.pgrst.object+json");
  return new Response(JSON.stringify(wantsSingle ? rows[0] ?? null : rows), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
};

const buildApp = (actorRole: string | null = "admin", recentMfa = true) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (actorRole) req.user = { id: `auth-${actorId}`, role: actorRole, dbUserId: actorId,
      rawClaims: recentMfa ? { aal: "aal2", amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }] } : { aal: "aal1" } };
    next();
  });
  app.use("/admin", adminRoutes);
  return app;
};

const promote = (email = "member@example.test") => request(buildApp())
  .post("/admin/profile/team").send({ email, canManageAdmins: false });

describe("admin profile team without direct PostgreSQL", () => {
  beforeEach(() => {
    calls = [];
    failure = null;
    tables = {
      users: [user(actorId, "manager@example.test", "admin"), user(memberId, "member@example.test")],
      user_roles: [role(actorId, "admin", true), role(memberId, "member", true)],
      admin_permissions: [{
        user_id: actorId, can_manage_admins: true, can_manage_users: true,
        can_view_audit: true, can_review_notaries: true, can_manage_platform_rules: false,
        updated_at: timestamp,
      }],
      documents: [{ id: "document-1", owner_id: memberId }],
      audit_events: [],
    };
    mocks.fetch.mockReset().mockImplementation(handleSupabase);
    mocks.poolQuery.mockReset().mockRejectedValue(Object.assign(new Error("connect ENETUNREACH"), { code: "ENETUNREACH" }));
  });

  afterEach(() => {
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("rejects a privileged grant without recent MFA before any database mutation", async () => {
    const response = await request(buildApp("admin", false)).post("/admin/profile/team").send({ email: "member@example.test" });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("recent_reauthentication_required");
    expect(calls).toEqual([]);
  });

  it("grants admin access, records the actor, and returns the team without switching profiles", async () => {
    const response = await promote("  MEMBER@example.test  ");

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.team).toEqual(expect.arrayContaining([expect.objectContaining({
      id: memberId, role: "member", documentCount: 1,
      adminPermissions: expect.objectContaining({ canManageAdmins: false, canManagePlatformRules: false }),
      roles: expect.arrayContaining([
        expect.objectContaining({ role: "member", isActiveProfile: true }),
        expect.objectContaining({ role: "admin", status: "active", isActiveProfile: false }),
      ]),
    })]));
    expect(tables.audit_events).toEqual([expect.objectContaining({
      actor_id: actorId, entity_id: memberId, action: "admin.team_member_added",
      metadata: expect.objectContaining({ email: "member@example.test", canManageAdmins: false }),
    })]);
    expect(calls.filter((call) => call.method === "POST").map((call) => call.table))
      .toEqual(["user_roles", "admin_permissions", "audit_events"]);
    expect(calls.find((call) => call.table === "user_roles" && call.method === "POST")?.body)
      .not.toHaveProperty("is_active_profile");
  });

  it("retries a grant without duplicating roles or resetting an active admin profile", async () => {
    tables.user_roles!.find((row) => row.user_id === memberId)!.is_active_profile = false;
    tables.user_roles!.push(role(memberId, "admin", true));
    tables.admin_permissions!.push({ user_id: memberId, can_manage_platform_rules: true });

    expect((await promote()).status).toBe(200);
    expect((await promote()).status).toBe(200);
    expect(tables.user_roles!.filter((row) => row.user_id === memberId && row.role === "admin"))
      .toEqual([expect.objectContaining({ is_active_profile: true, status: "active" })]);
    expect(tables.admin_permissions!.find((row) => row.user_id === memberId)?.can_manage_platform_rules).toBe(true);
  });

  it("treats email wildcards literally instead of granting a different user access", async () => {
    tables.users!.push(user("other-user", "mem_ber@example.test"));
    tables.users!.unshift(user("decoy-user", "memXber@example.test"));
    const response = await promote("mem_ber@example.test");
    expect(response.status).toBe(200);
    expect(tables.user_roles!.some((row) => row.user_id === "other-user" && row.role === "admin")).toBe(true);
    expect(tables.user_roles!.some((row) => row.user_id === "decoy-user")).toBe(false);
  });

  it("lists legacy, assigned-role, and permissions-only admins once without writing", async () => {
    tables.user_roles!.push(role(memberId, "admin", false));
    tables.users!.push(user("permission-user", "permissions@example.test"));
    tables.admin_permissions!.push({ user_id: "permission-user", updated_at: timestamp });
    const response = await request(buildApp()).get("/admin/profile/team");
    expect(response.status).toBe(200);
    expect(response.body.team.map((row: Row) => row.id).sort()).toEqual([actorId, memberId, "permission-user"].sort());
    expect(response.body.team.find((row: Row) => row.id === "permission-user").permissionsUpdatedAt).toBe(timestamp);
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("rejects admins without team-management permission before any writes", async () => {
    tables.admin_permissions![0]!.can_manage_admins = false;
    const response = await promote();
    expect(response.status).toBe(403);
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });

  it.each(["member", "notary", null])("rejects non-admin caller %s before database access", async (actorRole) => {
    const response = await request(buildApp(actorRole)).post("/admin/profile/team")
      .send({ email: "member@example.test" });
    expect([401, 403]).toContain(response.status);
    expect(calls).toEqual([]);
  });

  it("rejects unknown users without changing permissions", async () => {
    const response = await promote("missing@example.test");
    expect(response.status).toBe(404);
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("rejects invalid input before database access", async () => {
    const response = await promote("not-an-email");
    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it.each(["user_roles", "admin_permissions", "audit_events"])("does not report success when %s fails", async (table) => {
    failure = { table, method: "POST" };
    const response = await promote();
    expect(response.status).toBe(500);
    expect(response.body).not.toHaveProperty("team");
    expect(response.body.message).toBe("Simulated database outage");
    // Retrying uses the same role/permission keys even after a partial failure.
    expect((await promote()).status).toBe(200);
    expect(tables.user_roles!.filter((row) => row.user_id === memberId && row.role === "admin")).toHaveLength(1);
  });

  it("returns a failure rather than an empty successful team when reads fail", async () => {
    failure = { table: "user_roles", method: "GET", persistent: true };
    expect((await request(buildApp()).get("/admin/profile/team")).status).toBe(500);
  }, 20_000);

  it("revokes access and restores the member profile when admin was active", async () => {
    tables.user_roles!.find((row) => row.user_id === memberId)!.is_active_profile = false;
    tables.user_roles!.push(role(memberId, "admin", true));
    tables.users!.find((row) => row.id === memberId)!.role = "admin";
    tables.admin_permissions!.push({ user_id: memberId });
    const response = await request(buildApp()).delete(`/admin/profile/team/${memberId}`);
    expect(response.status).toBe(200);
    expect(tables.user_roles!.find((row) => row.user_id === memberId && row.role === "admin"))
      .toMatchObject({ status: "revoked", is_active_profile: false });
    expect(tables.user_roles!.find((row) => row.user_id === memberId && row.role === "member")?.is_active_profile).toBe(true);
    expect(tables.admin_permissions!.some((row) => row.user_id === memberId)).toBe(false);
    expect(response.body.team.some((row: Row) => row.id === memberId)).toBe(false);
    expect(tables.audit_events![0]?.action).toBe("admin.team_member_removed");
  });

  it("keeps another active profile when revoking an inactive admin profile", async () => {
    tables.user_roles!.find((row) => row.user_id === memberId)!.is_active_profile = false;
    tables.user_roles!.push(role(memberId, "notary", true), role(memberId, "admin", false));
    expect((await request(buildApp()).delete(`/admin/profile/team/${memberId}`)).status).toBe(200);
    expect(tables.user_roles!.find((row) => row.user_id === memberId && row.role === "member")?.is_active_profile).toBe(false);
    expect(tables.user_roles!.find((row) => row.user_id === memberId && row.role === "notary")?.is_active_profile).toBe(true);
  });

  it("prevents self-removal and self-suspension", async () => {
    expect((await request(buildApp()).delete(`/admin/profile/team/${actorId}`)).status).toBe(400);
    expect((await request(buildApp()).patch(`/admin/profile/users/${actorId}/status`).send({ status: "suspended" })).status).toBe(400);
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("updates account status and loads audited activity through Supabase", async () => {
    const response = await request(buildApp()).patch(`/admin/profile/users/${memberId}/status`).send({ status: "suspended" });
    expect(response.status).toBe(200);
    expect(response.body.user.status).toBe("suspended");
    const activity = await request(buildApp()).get("/admin/profile/activity");
    expect(activity.status).toBe(200);
    expect(activity.body.activity[0]).toMatchObject({
      action: "admin.user_suspended", entityId: memberId,
      actor: { id: actorId, email: "manager@example.test" },
    });
  });
});

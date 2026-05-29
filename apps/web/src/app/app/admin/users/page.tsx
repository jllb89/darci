"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppToast } from "@/components/app/AppToastContext";
import { useStoredAuth } from "@/lib/auth";
import {
  AdminMetricStrip,
  AdminSelectFilterControl,
  AdminPageShell,
  RefreshIconButton,
  StatusPill,
  fetchAdminJson,
  formatAdminDate,
  getAdminContact,
  isActiveAdminUser,
  type AdminCapabilities,
  type AdminUser,
} from "../adminCommon";

type UsersPayload = {
  capabilities: AdminCapabilities;
  users: AdminUser[];
};

type UserFilters = {
  search: string;
  status: string;
  role: string;
};

const getUserRoleSummary = (user: AdminUser) => {
  const activeRoles = user.roles.filter((role) => role.status === "active").map((role) => role.role);
  return activeRoles.length ? activeRoles.join(", ") : user.role ?? "member";
};

const getLastSessionLabel = (user: AdminUser) => {
  if (user.lastSignInAt) {
    return formatAdminDate(user.lastSignInAt);
  }

  if (user.lastAuthSyncedAt) {
    return `Synced ${formatAdminDate(user.lastAuthSyncedAt)}`;
  }

  return "No session recorded";
};

export default function AdminUsersPage() {
  const { accessToken } = useStoredAuth();
  const { showToast } = useAppToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [capabilities, setCapabilities] = useState<AdminCapabilities | null>(null);
  const [filters, setFilters] = useState<UserFilters>({ search: "", status: "", role: "" });
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    try {
      const payload = await fetchAdminJson<UsersPayload>("/admin/profile/users", accessToken);
      setUsers(payload.users ?? []);
      setCapabilities(payload.capabilities);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load users.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const roleOptions = useMemo(() => {
    const roles = new Set<string>();
    users.forEach((user) => {
      getUserRoleSummary(user).split(", ").forEach((role) => roles.add(role));
    });
    return [...roles].sort();
  }, [users]);

  const filteredUsers = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return users.filter((user) => {
      const roles = getUserRoleSummary(user);
      const status = user.status ?? "active";
      const searchable = [user.displayName, getAdminContact(user), roles, status].join(" ").toLowerCase();

      return (!search || searchable.includes(search))
        && (!filters.status || status === filters.status)
        && (!filters.role || roles.split(", ").includes(filters.role));
    });
  }, [filters, users]);

  const activeUserCount = useMemo(() => users.filter((user) => (user.status ?? "active") === "active").length, [users]);
  const filteredDocumentCount = useMemo(
    () => filteredUsers.reduce((total, user) => total + (user.documentCount ?? 0), 0),
    [filteredUsers],
  );
  const hasActiveFilters = Boolean(filters.search || filters.status || filters.role);

  const updateUserStatus = async (user: AdminUser, status: "active" | "suspended") => {
    if (!accessToken) {
      setErrorMessage("Sign in again to manage users.");
      return;
    }

    setActionId(`status:${user.id}`);
    try {
      await fetchAdminJson<{ user: AdminUser }>(`/admin/profile/users/${encodeURIComponent(user.id)}/status`, accessToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      showToast({ tone: "success", message: status === "active" ? "User reactivated." : "User suspended." });
      await loadUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update user status.";
      setErrorMessage(message);
      showToast({ tone: "error", message });
    } finally {
      setActionId(null);
    }
  };

  const makeUserAdmin = async (user: AdminUser) => {
    if (!accessToken) {
      setErrorMessage("Sign in again to manage admins.");
      return;
    }

    if (!user.email) {
      setErrorMessage("This user needs an email address before admin access can be granted.");
      return;
    }

    setActionId(`admin:${user.id}`);
    try {
      await fetchAdminJson("/admin/profile/team", accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, canManageAdmins: false }),
      });
      showToast({ tone: "success", message: "Admin access granted." });
      await loadUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to grant admin access.";
      setErrorMessage(message);
      showToast({ tone: "error", message });
    } finally {
      setActionId(null);
    }
  };

  return (
    <AdminPageShell
      description="Search members and manage basic account status."
      title="Users"
      titleAccessory={(
        <AdminMetricStrip
          metrics={[
            { label: "Showing", value: `${filteredUsers.length}/${users.length}` },
            { label: "Active", value: activeUserCount },
            { label: "Documents", value: filteredDocumentCount },
          ]}
        />
      )}
    >
      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

      <section className="rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/70">
        <div className="relative z-20 grid gap-4 overflow-visible border-b border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/45 p-4 md:grid-cols-[1.4fr_1fr_1fr_auto_auto]">
          <label className="flex flex-col gap-2 text-xs font-medium text-Color-Neutral-Darkest">
            <span>Search users</span>
            <input
              className="h-9 w-full rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-3 text-xs text-Color-Scheme-1-Text outline-none transition-colors placeholder:text-Color-Neutral hover:bg-Color-Neutral-Lightest/50 focus-visible:border-Color-Scheme-1-Text"
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Name, email, phone, or role"
              value={filters.search}
            />
          </label>
          <AdminSelectFilterControl
            isOpen={openFilterId === "status"}
            label="Status"
            onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
            onOpenChange={(isOpen) => setOpenFilterId(isOpen ? "status" : null)}
            options={[{ label: "All statuses", value: "" }, { label: "Active", value: "active" }, { label: "Suspended", value: "suspended" }]}
            placeholder="All statuses"
            value={filters.status}
          />
          <AdminSelectFilterControl
            isOpen={openFilterId === "role"}
            label="Role"
            onChange={(value) => setFilters((current) => ({ ...current, role: value }))}
            onOpenChange={(isOpen) => setOpenFilterId(isOpen ? "role" : null)}
            options={[{ label: "All roles", value: "" }, ...roleOptions.map((role) => ({ label: role, value: role }))]}
            placeholder="All roles"
            value={filters.role}
          />
          <div className="flex items-end">
            <button
              className="inline-flex h-9 items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-Color-Neutral underline-offset-4 transition-colors hover:text-Color-Neutral-Darkest hover:underline disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!hasActiveFilters}
              onClick={() => {
                setFilters({ search: "", status: "", role: "" });
                setOpenFilterId(null);
              }}
              type="button"
            >
              Clear
            </button>
          </div>
          <div className="flex items-end justify-end">
            <RefreshIconButton isLoading={isLoading} onClick={() => void loadUsers()} />
          </div>
        </div>
        <div className="overflow-x-auto bg-Color-Neutral-Lightest/80">
          <table className="min-w-full bg-Color-Neutral-Lightest/60 text-left text-sm">
            <thead className="bg-Color-Neutral-Lightest text-xs text-Color-Neutral">
              <tr className="border-b border-Color-Scheme-1-Border/40">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Roles</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Documents created</th>
                <th className="px-4 py-3">Last session</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length ? filteredUsers.map((user) => {
                const isSuspended = user.status === "suspended";
                const roles = getUserRoleSummary(user);
                const isAdmin = isActiveAdminUser(user);
                return (
                  <tr className="align-top transition-colors hover:bg-Color-Neutral-Lighter/50" key={user.id}>
                    <td className="max-w-[280px] border-t border-Color-Scheme-1-Border/40 px-4 py-5">
                      <div className="truncate font-medium text-Color-Scheme-1-Text">{user.displayName}</div>
                      <div className="mt-1 truncate text-xs text-Color-Neutral">{getAdminContact(user)}</div>
                    </td>
                    <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral-Darkest">{roles || "member"}</td>
                    <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5"><StatusPill status={user.status ?? "active"} /></td>
                    <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral">{user.documentCount ?? 0}</td>
                    <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral">{getLastSessionLabel(user)}</td>
                    <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral">{formatAdminDate(user.createdAt)}</td>
                    <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5">
                      <div className="flex flex-wrap gap-3">
                      {capabilities?.canManageUsers ? (
                        <button
                          className="border-0 bg-transparent p-0 text-xs font-medium text-Color-Scheme-1-Text underline underline-offset-4 transition hover:text-Color-Neutral-Darkest disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={Boolean(actionId)}
                          onClick={() => void updateUserStatus(user, isSuspended ? "active" : "suspended")}
                          type="button"
                        >
                          {actionId === `status:${user.id}` ? "Working" : isSuspended ? "Reactivate" : "Suspend"}
                        </button>
                      ) : <span className="text-xs text-Color-Neutral">View only</span>}
                      {capabilities?.canManageAdmins ? (
                        isAdmin ? (
                          <span className="text-xs text-Color-Neutral">Admin</span>
                        ) : (
                          <button
                            className="border-0 bg-transparent p-0 text-xs font-medium text-Color-Scheme-1-Text underline underline-offset-4 transition hover:text-Color-Neutral-Darkest disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={Boolean(actionId) || !user.email}
                            onClick={() => void makeUserAdmin(user)}
                            type="button"
                          >
                            {actionId === `admin:${user.id}` ? "Working" : "Make admin"}
                          </button>
                        )
                      ) : null}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-8 text-center text-sm text-Color-Neutral" colSpan={7}>No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPageShell>
  );
}
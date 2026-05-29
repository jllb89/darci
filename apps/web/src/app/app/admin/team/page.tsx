"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

type TeamPayload = {
  capabilities: AdminCapabilities;
  team: AdminUser[];
};

type UsersPayload = {
  capabilities: AdminCapabilities;
  users: AdminUser[];
};

type TeamFilters = {
  search: string;
  status: string;
  access: string;
};

const getAdminAccessLabel = (member: AdminUser) => {
  return member.adminPermissions.canManageAdmins ? "Admin manager" : "Admin";
};

const getTeamLastSessionLabel = (member: AdminUser) => {
  if (member.lastSignInAt) {
    return formatAdminDate(member.lastSignInAt);
  }

  if (member.lastAuthSyncedAt) {
    return `Synced ${formatAdminDate(member.lastAuthSyncedAt)}`;
  }

  return "No session recorded";
};

export default function AdminTeamPage() {
  const { accessToken } = useStoredAuth();
  const { showToast } = useAppToast();
  const [team, setTeam] = useState<AdminUser[]>([]);
  const [capabilities, setCapabilities] = useState<AdminCapabilities | null>(null);
  const [email, setEmail] = useState("");
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [userSuggestions, setUserSuggestions] = useState<AdminUser[]>([]);
  const [isSuggestingUsers, setIsSuggestingUsers] = useState(false);
  const [filters, setFilters] = useState<TeamFilters>({ search: "", status: "", access: "" });
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    try {
      const payload = await fetchAdminJson<TeamPayload>("/admin/profile/team", accessToken);
      setTeam(payload.team ?? []);
      setCapabilities(payload.capabilities);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load admin team.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const canManageTeam = Boolean(capabilities?.canManageAdmins);

  useEffect(() => {
    const search = email.trim();
    if (!accessToken || !canManageTeam || search.length < 3) {
      setUserSuggestions([]);
      setIsSuggestingUsers(false);
      return;
    }

    let isStale = false;
    const timeoutId = window.setTimeout(() => {
      setIsSuggestingUsers(true);
      void fetchAdminJson<UsersPayload>(`/admin/profile/users?search=${encodeURIComponent(search)}`, accessToken)
        .then((payload) => {
          if (isStale) {
            return;
          }

          setUserSuggestions(
            (payload.users ?? [])
              .filter((user) => Boolean(user.email) && !isActiveAdminUser(user))
              .slice(0, 6),
          );
        })
        .catch(() => {
          if (!isStale) {
            setUserSuggestions([]);
          }
        })
        .finally(() => {
          if (!isStale) {
            setIsSuggestingUsers(false);
          }
        });
    }, 250);

    return () => {
      isStale = true;
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, canManageTeam, email]);

  const addAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) {
      setErrorMessage("Sign in again to manage admins.");
      return;
    }

    setIsLoading(true);
    try {
      const payload = await fetchAdminJson<TeamPayload>("/admin/profile/team", accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), canManageAdmins }),
      });
      setTeam(payload.team ?? []);
      setCapabilities(payload.capabilities);
      setEmail("");
      setUserSuggestions([]);
      setCanManageAdmins(false);
      showToast({ tone: "success", message: "Admin access granted." });
      setErrorMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add admin.";
      setErrorMessage(message);
      showToast({ tone: "error", message });
    } finally {
      setIsLoading(false);
    }
  };

  const removeAdmin = async (user: AdminUser) => {
    if (!accessToken) {
      setErrorMessage("Sign in again to manage admins.");
      return;
    }

    setActionId(user.id);
    try {
      const payload = await fetchAdminJson<TeamPayload>(`/admin/profile/team/${encodeURIComponent(user.id)}`, accessToken, {
        method: "DELETE",
      });
      setTeam(payload.team ?? []);
      setCapabilities(payload.capabilities);
      showToast({ tone: "success", message: "Admin access removed." });
      setErrorMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to remove admin.";
      setErrorMessage(message);
      showToast({ tone: "error", message });
    } finally {
      setActionId(null);
    }
  };

  const filteredTeam = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return team.filter((member) => {
      const access = getAdminAccessLabel(member);
      const status = member.status ?? "active";
      const searchable = [member.displayName, getAdminContact(member), access, status].join(" ").toLowerCase();

      return (!search || searchable.includes(search))
        && (!filters.status || status === filters.status)
        && (!filters.access || access === filters.access);
    });
  }, [filters, team]);

  const adminManagerCount = useMemo(
    () => team.filter((member) => member.adminPermissions.canManageAdmins).length,
    [team],
  );
  const activeAdminCount = useMemo(
    () => team.filter((member) => (member.status ?? "active") === "active").length,
    [team],
  );
  const hasActiveFilters = Boolean(filters.search || filters.status || filters.access);

  return (
    <AdminPageShell
      description="Grant and review admin access without creating another runtime role."
      title="Admin Team"
      titleAccessory={(
        <AdminMetricStrip
          metrics={[
            { label: "Showing", value: `${filteredTeam.length}/${team.length}` },
            { label: "Active", value: activeAdminCount },
            { label: "Managers", value: adminManagerCount },
          ]}
        />
      )}
    >
      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

      <section className="rounded-xl bg-Color-White p-5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-Color-Scheme-1-Text">Add admin</div>
            <div className="mt-1 text-xs text-Color-Neutral">Users must already exist before they can be granted admin access.</div>
          </div>
          {!canManageTeam ? <div className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-xs text-Color-Neutral-Darkest">Only admin managers can add admins.</div> : null}
        </div>
        <form className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]" onSubmit={addAdmin}>
          <div className="relative">
            <input
              className="h-10 w-full rounded-lg bg-Color-Neutral-Lightest px-3 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canManageTeam || isLoading}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Search user by name or email"
              type="text"
              value={email}
            />
            {email.trim().length >= 3 && canManageTeam ? (
              <div className="absolute left-0 right-0 top-12 z-30 max-h-72 overflow-y-auto rounded-xl border border-Color-Scheme-1-Border/60 bg-Color-Neutral-Lightest p-2 shadow-[0_20px_48px_rgba(0,0,0,0.14)]">
                {isSuggestingUsers ? <div className="px-3 py-2 text-xs text-Color-Neutral">Searching users...</div> : null}
                {!isSuggestingUsers && userSuggestions.length === 0 ? <div className="px-3 py-2 text-xs text-Color-Neutral">No matching non-admin users.</div> : null}
                {userSuggestions.map((user) => (
                  <button
                    className="w-full rounded-md px-3 py-2 text-left text-xs text-Color-Scheme-1-Text transition-colors hover:bg-Color-White"
                    key={user.id}
                    onClick={() => {
                      setEmail(user.email ?? "");
                      setUserSuggestions([]);
                    }}
                    type="button"
                  >
                    <span className="block font-medium">{user.displayName}</span>
                    <span className="mt-0.5 block text-Color-Neutral">{getAdminContact(user)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <label className="flex h-10 items-center gap-2 rounded-lg bg-Color-Neutral-Lightest px-3 text-sm text-Color-Neutral-Darkest">
            <input
              checked={canManageAdmins}
              disabled={!canManageTeam || isLoading}
              onChange={(event) => setCanManageAdmins(event.target.checked)}
              type="checkbox"
            />
            Can manage admins
          </label>
          <button
            className="h-10 rounded-lg bg-Color-Scheme-1-Text px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canManageTeam || isLoading || !email.trim().includes("@")}
            type="submit"
          >
            Add admin
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/70">
        <div className="relative z-20 grid gap-4 overflow-visible border-b border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/45 p-4 md:grid-cols-[1.4fr_1fr_1fr_auto_auto]">
          <label className="flex flex-col gap-2 text-xs font-medium text-Color-Neutral-Darkest">
            <span>Search admins</span>
            <input
              className="h-9 w-full rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-3 text-xs text-Color-Scheme-1-Text outline-none transition-colors placeholder:text-Color-Neutral hover:bg-Color-Neutral-Lightest/50 focus-visible:border-Color-Scheme-1-Text"
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Name, email, phone, or access"
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
            isOpen={openFilterId === "access"}
            label="Access"
            onChange={(value) => setFilters((current) => ({ ...current, access: value }))}
            onOpenChange={(isOpen) => setOpenFilterId(isOpen ? "access" : null)}
            options={[{ label: "All access", value: "" }, { label: "Admin manager", value: "Admin manager" }, { label: "Admin", value: "Admin" }]}
            placeholder="All access"
            value={filters.access}
          />
          <div className="flex items-end">
            <button
              className="inline-flex h-9 items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-Color-Neutral underline-offset-4 transition-colors hover:text-Color-Neutral-Darkest hover:underline disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!hasActiveFilters}
              onClick={() => {
                setFilters({ search: "", status: "", access: "" });
                setOpenFilterId(null);
              }}
              type="button"
            >
              Clear
            </button>
          </div>
          <div className="flex items-end justify-end">
            <RefreshIconButton isLoading={isLoading} onClick={() => void loadTeam()} />
          </div>
        </div>
        <div className="overflow-x-auto bg-Color-Neutral-Lightest/80">
          <table className="min-w-full bg-Color-Neutral-Lightest/60 text-left text-sm">
            <thead className="bg-Color-Neutral-Lightest text-xs text-Color-Neutral">
              <tr className="border-b border-Color-Scheme-1-Border/40">
                <th className="px-4 py-3">Admin</th>
                <th className="px-4 py-3">Access</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last session</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeam.length ? filteredTeam.map((member) => (
                <tr className="align-top transition-colors hover:bg-Color-Neutral-Lighter/50" key={member.id}>
                  <td className="max-w-[280px] border-t border-Color-Scheme-1-Border/40 px-4 py-5">
                    <div className="truncate font-medium text-Color-Scheme-1-Text">{member.displayName}</div>
                    <div className="mt-1 truncate text-xs text-Color-Neutral">{getAdminContact(member)}</div>
                  </td>
                  <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral-Darkest">
                    <div>{getAdminAccessLabel(member)}</div>
                    <div className="mt-1 text-xs text-Color-Neutral">{member.adminPermissions.canManageUsers ? "User management" : "No user management"}</div>
                  </td>
                  <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5"><StatusPill status={member.status ?? "active"} /></td>
                  <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral">{getTeamLastSessionLabel(member)}</td>
                  <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral">{formatAdminDate(member.permissionsUpdatedAt ?? member.createdAt)}</td>
                  <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5">
                    {canManageTeam ? (
                      <button
                        className="border-0 bg-transparent p-0 text-xs font-medium text-Color-Scheme-1-Text underline underline-offset-4 transition hover:text-Color-Neutral-Darkest disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={actionId === member.id}
                        onClick={() => void removeAdmin(member)}
                        type="button"
                      >
                        {actionId === member.id ? "Working" : "Remove"}
                      </button>
                    ) : <span className="text-xs text-Color-Neutral">View only</span>}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-8 text-center text-sm text-Color-Neutral" colSpan={6}>No admins found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPageShell>
  );
}
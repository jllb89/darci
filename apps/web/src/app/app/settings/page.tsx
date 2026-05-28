"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStoredAuth, useStoredUser } from "@/lib/auth";
import { fetchWithTokenRefresh, notaryApiBaseUrl, readApiErrorMessage } from "@/lib/notaryWorkspace";
import SignatureCanvasField from "@/components/signature/SignatureCanvasField";

type NotaryServiceAreaKind =
  | "county"
  | "parish"
  | "borough"
  | "district"
  | "city"
  | "metro"
  | "region"
  | "state"
  | "other";

type NotaryApplication = {
  id: string;
  userId: string;
  jurisdiction: string;
  serviceAreaKind: NotaryServiceAreaKind;
  serviceAreaName: string;
  signatureDataUrl: string | null;
  sealDataUrl: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNotes: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type NotaryProfile = {
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

type AdminApplicationRow = {
  id: string;
  userId: string;
  status: "pending" | "approved" | "rejected";
  jurisdiction: string;
  serviceAreaKind: NotaryServiceAreaKind;
  serviceAreaName: string;
  signatureDataUrl: string | null;
  sealDataUrl: string | null;
  reviewNotes: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    supabaseUserId: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
};

type SettingsResponse = {
  application: NotaryApplication | null;
  profile: NotaryProfile | null;
  applications: AdminApplicationRow[];
};

const serviceAreaKinds: Array<{ value: NotaryServiceAreaKind; label: string }> = [
  { value: "county", label: "County" },
  { value: "parish", label: "Parish" },
  { value: "borough", label: "Borough" },
  { value: "district", label: "District" },
  { value: "city", label: "City" },
  { value: "metro", label: "Metro area" },
  { value: "region", label: "Region" },
  { value: "state", label: "State" },
  { value: "other", label: "Other" },
];

const emptyApplicationForm = {
  jurisdiction: "",
  serviceAreaKind: "county" as NotaryServiceAreaKind,
  serviceAreaName: "",
  signatureDataUrl: null as string | null,
  sealDataUrl: null as string | null,
};

const emptyProfileForm = {
  jurisdiction: "",
  serviceAreaKind: "county" as NotaryServiceAreaKind,
  serviceAreaName: "",
  commissionNumber: "",
  commissionExpiresAt: "",
  signatureDataUrl: null as string | null,
  sealDataUrl: null as string | null,
};

const formatPersonName = (firstName: string | null, lastName: string | null) => {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Profile";
};

export default function SettingsPage() {
  const { accessToken } = useStoredAuth();
  const user = useStoredUser();
  const isAdmin = user?.role === "admin";
  const isNotary = user?.role === "notary";
  const isMember = !isNotary;
  const [application, setApplication] = useState<NotaryApplication | null>(null);
  const [profile, setProfile] = useState<NotaryProfile | null>(null);
  const [adminApplications, setAdminApplications] = useState<AdminApplicationRow[]>([]);
  const [applicationForm, setApplicationForm] = useState(emptyApplicationForm);
  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [adminReviewNotes, setAdminReviewNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingApplication, setIsSavingApplication] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    try {
      const [applicationResponse, profileResponse, adminResponse] = await Promise.all([
        fetchWithTokenRefresh(`${notaryApiBaseUrl}/users/me/notary-application`, accessToken, { cache: "no-store" }),
        fetchWithTokenRefresh(`${notaryApiBaseUrl}/users/me/notary-profile`, accessToken, { cache: "no-store" }),
        isAdmin
          ? fetchWithTokenRefresh(`${notaryApiBaseUrl}/admin/notary-applications`, accessToken, { cache: "no-store" })
          : Promise.resolve(null),
      ]);

      if (!applicationResponse.ok) {
        throw new Error(await readApiErrorMessage(applicationResponse, "Unable to load your notary application."));
      }
      if (!profileResponse.ok) {
        throw new Error(await readApiErrorMessage(profileResponse, "Unable to load your notary profile."));
      }
      if (adminResponse && !adminResponse.ok) {
        throw new Error(await readApiErrorMessage(adminResponse, "Unable to load notary applications."));
      }

      const applicationPayload = (await applicationResponse.json()) as { application: NotaryApplication | null };
      const profilePayload = (await profileResponse.json()) as { profile: NotaryProfile | null };
      const adminPayload = adminResponse ? ((await adminResponse.json()) as { applications: AdminApplicationRow[] }) : { applications: [] };

      setApplication(applicationPayload.application);
      setProfile(profilePayload.profile);
      setAdminApplications(adminPayload.applications ?? []);
      setApplicationForm(
        applicationPayload.application
          ? {
              jurisdiction: applicationPayload.application.jurisdiction,
              serviceAreaKind: applicationPayload.application.serviceAreaKind,
              serviceAreaName: applicationPayload.application.serviceAreaName,
              signatureDataUrl: applicationPayload.application.signatureDataUrl,
              sealDataUrl: applicationPayload.application.sealDataUrl,
            }
          : emptyApplicationForm,
      );
      setProfileForm(
        profilePayload.profile
          ? {
              jurisdiction: profilePayload.profile.jurisdiction ?? "",
              serviceAreaKind: profilePayload.profile.serviceAreaKind ?? "county",
              serviceAreaName: profilePayload.profile.serviceAreaName ?? "",
              commissionNumber: profilePayload.profile.commissionNumber ?? "",
              commissionExpiresAt: profilePayload.profile.commissionExpiresAt ?? "",
              signatureDataUrl: profilePayload.profile.signatureDataUrl,
              sealDataUrl: profilePayload.profile.sealDataUrl,
            }
          : emptyProfileForm,
      );
      setMessage(null);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load settings.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, isAdmin]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const submitApplication = async () => {
    if (!accessToken) {
      setErrorMessage("Sign in again to submit your notary request.");
      return;
    }

    if (!applicationForm.jurisdiction.trim() || !applicationForm.serviceAreaName.trim()) {
      setErrorMessage("Enter your jurisdiction and service area.");
      return;
    }

    setIsSavingApplication(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetchWithTokenRefresh(`${notaryApiBaseUrl}/users/me/notary-application`, accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jurisdiction: applicationForm.jurisdiction.trim(),
          serviceAreaKind: applicationForm.serviceAreaKind,
          serviceAreaName: applicationForm.serviceAreaName.trim(),
          signatureDataUrl: applicationForm.signatureDataUrl,
          sealDataUrl: applicationForm.sealDataUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to save notary application."));
      }

      setMessage("Notary application submitted for admin review.");
      await loadSettings();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save notary application.");
    } finally {
      setIsSavingApplication(false);
    }
  };

  const saveProfile = async () => {
    if (!accessToken) {
      setErrorMessage("Sign in again to update your notary profile.");
      return;
    }

    if (!profileForm.jurisdiction.trim() || !profileForm.serviceAreaName.trim()) {
      setErrorMessage("Enter your jurisdiction and service area.");
      return;
    }

    setIsSavingProfile(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetchWithTokenRefresh(`${notaryApiBaseUrl}/users/me/notary-profile`, accessToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jurisdiction: profileForm.jurisdiction.trim(),
          serviceAreaKind: profileForm.serviceAreaKind,
          serviceAreaName: profileForm.serviceAreaName.trim(),
          commissionNumber: profileForm.commissionNumber.trim() || null,
          commissionExpiresAt: profileForm.commissionExpiresAt || null,
          signatureDataUrl: profileForm.signatureDataUrl,
          sealDataUrl: profileForm.sealDataUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to save notary profile."));
      }

      setMessage("Notary profile saved.");
      await loadSettings();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save notary profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const reviewApplication = async (applicationId: string, decision: "approve" | "reject") => {
    if (!accessToken) {
      setErrorMessage("Sign in again to review notary applications.");
      return;
    }

    setActionId(applicationId);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetchWithTokenRefresh(
        `${notaryApiBaseUrl}/admin/notary-applications/${encodeURIComponent(applicationId)}/${decision}`,
        accessToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewNotes: adminReviewNotes.trim() || null }),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to review the notary application."));
      }

      setMessage(decision === "approve" ? "Notary application approved." : "Notary application rejected.");
      setAdminReviewNotes("");
      await loadSettings();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to review the notary application.");
    } finally {
      setActionId(null);
    }
  };

  const pendingApplications = useMemo(
    () => adminApplications.filter((row) => row.status === "pending"),
    [adminApplications],
  );

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="text-2xl font-medium">Settings</div>
        <div className="text-sm text-Color-Neutral">
          {isNotary
            ? "Manage your notary profile, seal, and signature."
            : isAdmin
              ? "Review notary applications and manage approvals."
              : "Request notary approval from your member profile."}
        </div>
      </div>

      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}
      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-4 rounded-2xl bg-Color-White p-5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-Color-Scheme-1-Text">Member profile</div>
              <div className="mt-1 text-xs text-Color-Neutral">Name, email, and phone are already captured in the member flow.</div>
            </div>
            {application ? (
              <span className="rounded-full bg-Color-Neutral-Lightest px-3 py-1 text-xs font-medium text-Color-Scheme-1-Text">
                Application: {application.status}
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 rounded-xl bg-Color-Neutral-Lightest/70 p-4 text-sm">
            <div>Name: {formatPersonName(user?.firstName ?? null, user?.lastName ?? null)}</div>
            <div>Email: {user?.email ?? "-"}</div>
            <div>Phone: {user?.phone ?? "-"}</div>
          </div>

          {isMember ? (
            <div className="space-y-4 rounded-xl bg-Color-Neutral-Lightest/60 p-4">
              <div className="text-sm font-medium text-Color-Scheme-1-Text">Apply as a notary</div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block md:col-span-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">State or jurisdiction</span>
                  <input
                    className="mt-2 w-full rounded-lg bg-white px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                    onChange={(event) => setApplicationForm((current) => ({ ...current, jurisdiction: event.target.value }))}
                    value={applicationForm.jurisdiction}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">County or service area</span>
                  <div className="mt-2 grid gap-2 md:grid-cols-[minmax(10rem,0.35fr)_minmax(0,1fr)]">
                    <select
                      className="rounded-lg bg-white px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                      onChange={(event) => setApplicationForm((current) => ({ ...current, serviceAreaKind: event.target.value as NotaryServiceAreaKind }))}
                      value={applicationForm.serviceAreaKind}
                    >
                      {serviceAreaKinds.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="rounded-lg bg-white px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                      onChange={(event) => setApplicationForm((current) => ({ ...current, serviceAreaName: event.target.value }))}
                      placeholder="Example: Sonoma County, Greater Los Angeles, Central Ohio"
                      value={applicationForm.serviceAreaName}
                    />
                  </div>
                </label>
              </div>

              <SignatureCanvasField
                description="Draw your notary signature for the application review."
                label="Signature"
                onChange={(nextValue) => setApplicationForm((current) => ({ ...current, signatureDataUrl: nextValue }))}
                value={applicationForm.signatureDataUrl}
              />

              <SignatureCanvasField
                description="Use the same capture flow for your seal impression."
                label="Seal"
                onChange={(nextValue) => setApplicationForm((current) => ({ ...current, sealDataUrl: nextValue }))}
                value={applicationForm.sealDataUrl}
              />

              <button
                className="w-full rounded-lg bg-Green px-5 py-3 text-sm font-medium text-Color-Neutral-Darkest transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSavingApplication || isLoading}
                onClick={() => void submitApplication()}
                type="button"
              >
                {isSavingApplication ? "Submitting" : application?.status === "approved" ? "Resubmit application" : "Submit notary application"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 rounded-2xl bg-Color-White p-5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
          <div className="text-sm font-medium text-Color-Scheme-1-Text">Notary profile</div>
          {isNotary ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block md:col-span-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Jurisdiction</span>
                  <input
                    className="mt-2 w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                    onChange={(event) => setProfileForm((current) => ({ ...current, jurisdiction: event.target.value }))}
                    value={profileForm.jurisdiction}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Service area kind</span>
                  <select
                    className="mt-2 w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                    onChange={(event) => setProfileForm((current) => ({ ...current, serviceAreaKind: event.target.value as NotaryServiceAreaKind }))}
                    value={profileForm.serviceAreaKind}
                  >
                    {serviceAreaKinds.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Service area name</span>
                  <input
                    className="mt-2 w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                    onChange={(event) => setProfileForm((current) => ({ ...current, serviceAreaName: event.target.value }))}
                    value={profileForm.serviceAreaName}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Commission number</span>
                  <input
                    className="mt-2 w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                    onChange={(event) => setProfileForm((current) => ({ ...current, commissionNumber: event.target.value }))}
                    value={profileForm.commissionNumber}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Commission expiration</span>
                  <input
                    className="mt-2 w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                    onChange={(event) => setProfileForm((current) => ({ ...current, commissionExpiresAt: event.target.value }))}
                    type="datetime-local"
                    value={profileForm.commissionExpiresAt}
                  />
                </label>
              </div>

              <SignatureCanvasField
                description="Update the signature that appears on notary-facing records."
                label="Signature"
                onChange={(nextValue) => setProfileForm((current) => ({ ...current, signatureDataUrl: nextValue }))}
                value={profileForm.signatureDataUrl}
              />

              <SignatureCanvasField
                description="Update the seal image that will be used for completion artifacts."
                label="Seal"
                onChange={(nextValue) => setProfileForm((current) => ({ ...current, sealDataUrl: nextValue }))}
                value={profileForm.sealDataUrl}
              />

              <button
                className="w-full rounded-lg bg-Green px-5 py-3 text-sm font-medium text-Color-Neutral-Darkest transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSavingProfile || isLoading}
                onClick={() => void saveProfile()}
                type="button"
              >
                {isSavingProfile ? "Saving" : "Save notary profile"}
              </button>

              <div className="rounded-xl bg-Color-Neutral-Lightest/60 p-4 text-sm text-Color-Neutral-Darkest">
                This profile is the source of truth for the notary dashboard. Update it whenever your commission, service area, seal, or signature changes.
              </div>
            </>
          ) : (
            <div className="rounded-xl bg-Color-Neutral-Lightest/60 p-4 text-sm text-Color-Neutral-Darkest">
              Once your application is approved, this section becomes your notary dashboard profile editor.
            </div>
          )}
        </div>
      </section>

      {isAdmin ? (
        <section className="space-y-4 rounded-2xl bg-Color-White p-5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-Color-Scheme-1-Text">Notary applications</div>
              <div className="mt-1 text-xs text-Color-Neutral">Approve or reject pending notary signup requests.</div>
            </div>
            <label className="block min-w-[18rem] flex-1 max-w-xl">
              <span className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Admin review note</span>
              <textarea
                className="mt-2 min-h-20 w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                onChange={(event) => setAdminReviewNotes(event.target.value)}
                placeholder="Optional note to include with the approval or rejection"
                value={adminReviewNotes}
              />
            </label>
          </div>

          {isLoading ? <div className="text-sm text-Color-Neutral">Loading applications.</div> : null}

          {pendingApplications.length ? (
            <div className="overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)] gap-3 bg-Color-Neutral-Lightest px-4 py-3 text-xs uppercase tracking-wide text-Color-Neutral">
                <div>Member</div>
                <div>Jurisdiction</div>
                <div>Service area</div>
                <div className="text-right">Actions</div>
              </div>
              <div className="divide-y divide-Color-Scheme-1-Border/15">
                {pendingApplications.map((row) => {
                  const fullName = formatPersonName(row.user?.firstName ?? null, row.user?.lastName ?? null);
                  return (
                    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)] gap-3 px-4 py-4 text-sm" key={row.id}>
                      <div className="min-w-0">
                        <div className="font-medium text-Color-Scheme-1-Text">{fullName}</div>
                        <div className="text-xs text-Color-Neutral">{row.user?.email ?? row.user?.phone ?? "No contact on file"}</div>
                      </div>
                      <div className="text-Color-Neutral-Darkest">{row.jurisdiction}</div>
                      <div className="text-Color-Neutral-Darkest">{row.serviceAreaKind} · {row.serviceAreaName}</div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="rounded-lg bg-Green px-3 py-2 text-xs font-medium text-Color-Neutral-Darkest transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={actionId === row.id}
                          onClick={() => void reviewApplication(row.id, "approve")}
                          type="button"
                        >
                          {actionId === row.id ? "Working" : "Approve"}
                        </button>
                        <button
                          className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-xs font-medium text-Color-Neutral-Darkest transition hover:bg-Color-Neutral-Lighter disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={actionId === row.id}
                          onClick={() => void reviewApplication(row.id, "reject")}
                          type="button"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-Color-Neutral-Lightest/60 p-4 text-sm text-Color-Neutral-Darkest">
              No pending notary applications.
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

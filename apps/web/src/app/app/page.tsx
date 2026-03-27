"use client";

import { StoredUser, useStoredUser } from "@/lib/auth";

const memberStats = [
  { label: "In progress", value: 6 },
  { label: "Awaiting notary", value: 2 },
  { label: "Completed", value: 18 },
];

const recentDocuments = [
  {
    title: "Purchase Agreement - Elm St",
    status: "Awaiting signatures",
    updated: "12 min ago",
  },
  {
    title: "Power of Attorney - Ramirez",
    status: "Notary scheduled",
    updated: "2 hours ago",
  },
  {
    title: "Lease Renewal - Jacobs",
    status: "Draft",
    updated: "Yesterday",
  },
];

const memberRequests = [
  {
    name: "Urgent notarization",
    requestor: "Atlas Legal",
    status: "Pending review",
  },
  {
    name: "IDN verification",
    requestor: "Oakridge Title",
    status: "In progress",
  },
];

const memberActivity = [
  "IDN-29384 verified by Avery Stone",
  "New document created: Purchase Agreement - Elm St",
  "Request updated: Urgent notarization",
];

const memberSessions = [
  {
    title: "Elm St closing",
    time: "Today · 3:30 PM",
    host: "Notary: J. Patel",
  },
  {
    title: "Ramirez POA",
    time: "Tomorrow · 10:00 AM",
    host: "Notary: L. Zhao",
  },
];

const notaryStats = [
  { label: "Pending review", value: 4 },
  { label: "Scheduled today", value: 3 },
  { label: "Completed this week", value: 11 },
];

const notaryQueue = [
  {
    id: "REQ-8812",
    member: "Avery Stone",
    document: "Purchase Agreement - Elm St",
    status: "Time proposed",
    scheduled: "Awaiting confirmation",
  },
  {
    id: "REQ-7741",
    member: "Rafael Grant",
    document: "Affidavit - Grant",
    status: "Scheduled",
    scheduled: "Today · 2:00 PM",
  },
  {
    id: "REQ-6904",
    member: "Monica Jacobs",
    document: "Lease Renewal - Jacobs",
    status: "Needs reschedule",
    scheduled: "Tomorrow · 9:30 AM",
  },
];

const notaryActivity = [
  "Meeting confirmed for REQ-7741",
  "Identity verified for REQ-6628",
  "Seal applied to DOC-6108",
];

const notaryAlerts = [
  "REQ-8812 has new proposed slots",
  "REQ-6904 requires reschedule decision",
  "Two sessions start within the next hour",
];

const opsStats = [
  { label: "Open escalations", value: 3 },
  { label: "Audit events today", value: 128 },
  { label: "Verification checks", value: 42 },
];

const opsFeed = [
  "Public verification spike detected for IDN-20488",
  "Meeting cancellation recorded on REQ-1120",
  "Admin role update completed for user review",
];

const getDisplayName = (user: StoredUser | null) => {
  if (!user) {
    return "there";
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }

  return user.email;
};

function MemberDashboard({ user }: { user: StoredUser | null }) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-2xl font-medium">Dashboard</div>
          <div className="text-sm text-Color-Neutral">Welcome back, {getDisplayName(user)}.</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {memberStats.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-Color-Scheme-1-Border/40 p-4"
          >
            <div className="text-xs uppercase text-Color-Neutral">{item.label}</div>
            <div className="mt-2 text-2xl font-medium">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Documents</div>
            <div className="mt-4 space-y-3">
              {recentDocuments.map((doc) => (
                <div key={doc.title} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{doc.title}</div>
                    <div className="text-xs text-Color-Neutral">{doc.status}</div>
                  </div>
                  <div className="text-xs text-Color-Neutral">{doc.updated}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Requests</div>
            <div className="mt-4 space-y-3 text-sm">
              {memberRequests.map((item) => (
                <div key={item.name} className="space-y-1">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-Color-Neutral">
                    {item.requestor} • {item.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Upcoming sessions</div>
            <div className="mt-4 space-y-3 text-sm">
              {memberSessions.map((session) => (
                <div key={session.title} className="space-y-1">
                  <div className="font-medium">{session.title}</div>
                  <div className="text-xs text-Color-Neutral">
                    {session.time} • {session.host}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Recent activity</div>
            <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
              {memberActivity.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotaryDashboard({ user }: { user: StoredUser | null }) {
  return (
    <div className="space-y-8">
      <div>
        <div className="text-2xl font-medium">Notary Dashboard</div>
        <div className="text-sm text-Color-Neutral">Queue and calendar for {getDisplayName(user)}.</div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {notaryStats.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-Color-Scheme-1-Border/40 p-4"
          >
            <div className="text-xs uppercase text-Color-Neutral">{item.label}</div>
            <div className="mt-2 text-2xl font-medium">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
          <div className="text-sm font-medium">Pending requests</div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-Color-Neutral">
                <tr>
                  <th className="px-3 py-2">Request</th>
                  <th className="px-3 py-2">Member</th>
                  <th className="px-3 py-2">Document</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Scheduled</th>
                </tr>
              </thead>
              <tbody>
                {notaryQueue.map((item) => (
                  <tr key={item.id} className="border-t border-Color-Scheme-1-Border/40">
                    <td className="px-3 py-3 font-medium">{item.id}</td>
                    <td className="px-3 py-3 text-Color-Neutral">{item.member}</td>
                    <td className="px-3 py-3 text-Color-Neutral">{item.document}</td>
                    <td className="px-3 py-3">{item.status}</td>
                    <td className="px-3 py-3 text-Color-Neutral">{item.scheduled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Alerts</div>
            <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
              {notaryAlerts.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Calendar</div>
            <div className="mt-4 space-y-3 text-sm text-Color-Neutral">
              <div>Today · 2:00 PM · Grant affidavit</div>
              <div>Tomorrow · 9:30 AM · Jacobs lease renewal</div>
              <div>Tomorrow · 1:15 PM · Elm St acknowledgment</div>
            </div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Recent activity</div>
            <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
              {notaryActivity.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard({ user }: { user: StoredUser | null }) {
  return (
    <div className="space-y-8">
      <div>
        <div className="text-2xl font-medium">Operations Dashboard</div>
        <div className="text-sm text-Color-Neutral">Admin view for {getDisplayName(user)}.</div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {opsStats.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-Color-Scheme-1-Border/40 p-4"
          >
            <div className="text-xs uppercase text-Color-Neutral">{item.label}</div>
            <div className="mt-2 text-2xl font-medium">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
          <div className="text-sm font-medium">Oversight feed</div>
          <div className="mt-4 space-y-3 text-sm text-Color-Neutral">
            {opsFeed.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
          <div className="text-sm font-medium">Next action</div>
          <div className="mt-4 text-sm text-Color-Neutral">
            Use the Ops Console to inspect audit events, compliance exceptions, and support escalations.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const user = useStoredUser();
  const role = user?.role ?? null;

  if (role === "notary") {
    return <NotaryDashboard user={user} />;
  }

  if (role === "admin") {
    return <AdminDashboard user={user} />;
  }

  return <MemberDashboard user={user} />;
}

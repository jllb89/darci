const stats = [
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

const templates = [
  "Real Estate Closing",
  "Affidavit",
  "Business Formation",
];

const requests = [
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

const activity = [
  "IDN-29384 verified by Avery Stone",
  "New document created: Purchase Agreement - Elm St",
  "Request updated: Urgent notarization",
];

const sessions = [
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

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-2xl font-medium">Dashboard</div>
          <div className="text-sm text-Color-Neutral">Welcome back.</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => (
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

          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Templates</div>
            <div className="mt-4 space-y-2 text-sm">
              {templates.map((template) => (
                <div key={template} className="flex items-center justify-between">
                  <div>{template}</div>
                  <button className="rounded border border-Color-Scheme-1-Border/40 px-2 py-1 text-xs">
                    Use
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Requests</div>
            <div className="mt-4 space-y-3 text-sm">
              {requests.map((item) => (
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
              {sessions.map((session) => (
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
              {activity.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

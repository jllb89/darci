type RouteBreadcrumb = {
  section?: string;
  current: string;
};

type BreadcrumbRule = {
  kind: "exact" | "prefix";
  path: string;
  breadcrumb: RouteBreadcrumb;
};

const BREADCRUMB_RULES: BreadcrumbRule[] = [
  { kind: "exact", path: "/app", breadcrumb: { current: "Start" } },
  { kind: "exact", path: "/admin", breadcrumb: { section: "Admin", current: "Home" } },
  { kind: "prefix", path: "/admin/notary-requests", breadcrumb: { section: "Admin", current: "Notary requests" } },
  { kind: "prefix", path: "/admin/users", breadcrumb: { section: "Admin", current: "Users" } },
  { kind: "prefix", path: "/admin/team", breadcrumb: { section: "Admin", current: "Admin team" } },
  { kind: "prefix", path: "/admin/activity", breadcrumb: { section: "Admin", current: "Activity" } },
  { kind: "exact", path: "/app/admin", breadcrumb: { section: "Admin", current: "Home" } },
  { kind: "prefix", path: "/app/admin/notary-requests", breadcrumb: { section: "Admin", current: "Notary requests" } },
  { kind: "prefix", path: "/app/admin/users", breadcrumb: { section: "Admin", current: "Users" } },
  { kind: "prefix", path: "/app/admin/team", breadcrumb: { section: "Admin", current: "Admin team" } },
  { kind: "prefix", path: "/app/admin/activity", breadcrumb: { section: "Admin", current: "Activity" } },
  { kind: "exact", path: "/app/notary", breadcrumb: { current: "Start" } },
  { kind: "exact", path: "/app/notary/history", breadcrumb: { section: "Notary", current: "History" } },
  { kind: "prefix", path: "/app/start", breadcrumb: { current: "New Document" } },
  { kind: "prefix", path: "/app/review", breadcrumb: { current: "Review" } },
  { kind: "prefix", path: "/app/sign", breadcrumb: { current: "Sign" } },
  {
    kind: "prefix",
    path: "/app/documents/",
    breadcrumb: { section: "Documents", current: "Document" },
  },
  {
    kind: "prefix",
    path: "/app/documents",
    breadcrumb: { section: "Documents", current: "My documents" },
  },
  {
    kind: "prefix",
    path: "/app/verification/",
    breadcrumb: { section: "Documents", current: "Verify a document" },
  },
  {
    kind: "prefix",
    path: "/app/verification",
    breadcrumb: { section: "Documents", current: "Verify a document" },
  },
  {
    kind: "prefix",
    path: "/app/activity",
    breadcrumb: { section: "Activity", current: "Activity" },
  },
  {
    kind: "prefix",
    path: "/app/notifications",
    breadcrumb: { section: "Activity", current: "Activity" },
  },
  {
    kind: "prefix",
    path: "/app/notary/requests/",
    breadcrumb: { section: "Notary", current: "Request" },
  },
  {
    kind: "prefix",
    path: "/app/notary/history",
    breadcrumb: { section: "Notary", current: "History" },
  },
  {
    kind: "prefix",
    path: "/app/notary/requests",
    breadcrumb: { section: "Notary", current: "Requests" },
  },
  {
    kind: "prefix",
    path: "/app/requests/",
    breadcrumb: { section: "Activity", current: "Request" },
  },
  {
    kind: "prefix",
    path: "/app/requests",
    breadcrumb: { section: "Activity", current: "Requests" },
  },
  {
    kind: "prefix",
    path: "/app/settings",
    breadcrumb: { section: "Settings", current: "Account" },
  },
  {
    kind: "prefix",
    path: "/app/ops",
    breadcrumb: { section: "Ops", current: "Console" },
  },
];

const getRouteBreadcrumb = (pathname: string): RouteBreadcrumb => {
  const rule = BREADCRUMB_RULES.find((entry) => {
    if (entry.kind === "exact") {
      return pathname === entry.path;
    }

    return pathname.startsWith(entry.path);
  });

  return rule?.breadcrumb ?? { current: "Start" };
};

type AppTopbarBreadcrumbProps = {
  pathname: string;
};

export default function AppTopbarBreadcrumb({ pathname }: AppTopbarBreadcrumbProps) {
  const routeBreadcrumb = getRouteBreadcrumb(pathname);

  return (
    <div
      data-app-topbar
      className="w-full border-b border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-6 py-2 md:px-10"
    >
      <div className="flex items-center justify-center text-xs font-medium">
        {routeBreadcrumb.section ? (
          <>
            <span className="text-Color-Neutral">{routeBreadcrumb.section}</span>
            <span className="px-2 text-Color-Neutral">/</span>
          </>
        ) : null}
        <span className="text-Color-Scheme-1-Text">{routeBreadcrumb.current}</span>
      </div>
    </div>
  );
}
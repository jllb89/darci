import Link from "next/link";

const requests = [
  {
    id: "REQ-8812",
    title: "Urgent notarization",
    requestor: "Atlas Legal",
    document: "Purchase Agreement - Elm St",
    created: "Mar 20, 2026",
    status: "Pending review",
  },
  {
    id: "REQ-7741",
    title: "IDN verification",
    requestor: "Oakridge Title",
    document: "Affidavit - Grant",
    created: "Mar 19, 2026",
    status: "In progress",
  },
  {
    id: "REQ-6904",
    title: "Witness scheduling",
    requestor: "Cobalt Partners",
    document: "Lease Renewal - Jacobs",
    created: "Mar 18, 2026",
    status: "Awaiting notary",
  },
];

const requestLifecycle = [
  { id: "review", label: "Review", actor: "ops" },
  { id: "processing", label: "Processing", actor: "system" },
  { id: "notary", label: "Notary", actor: "notary" },
  { id: "completed", label: "Completed", actor: "system" },
];

const requestStatusToStep: Record<string, string> = {
  "Pending review": "review",
  "In progress": "processing",
  "Awaiting notary": "notary",
  Completed: "completed",
};

const actorStyles: Record<string, string> = {
  ops: "border-amber-200 bg-amber-50 text-amber-700",
  system: "border-slate-200 bg-slate-50 text-slate-600",
  notary: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export default function RequestsPage() {
  return (
    <div className="space-y-6">
      <div className="text-2xl font-medium">Requests</div>
      <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
        <div className="text-sm font-medium">Active requests</div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-Color-Neutral">
              <tr>
                <th className="px-3 py-2">Request</th>
                <th className="px-3 py-2">Requestor</th>
                <th className="px-3 py-2">Document</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((item) => (
                <tr key={item.id} className="border-t border-Color-Scheme-1-Border/40">
                  <td className="px-3 py-3">
                    <div className="font-medium">{item.title}</div>
                    <div className="text-xs text-Color-Neutral">{item.id}</div>
                  </td>
                  <td className="px-3 py-3 text-Color-Neutral">{item.requestor}</td>
                  <td className="px-3 py-3 text-Color-Neutral">{item.document}</td>
                  <td className="px-3 py-3 text-Color-Neutral">{item.created}</td>
                  <td className="px-3 py-3">
                    {(() => {
                      const stepId = requestStatusToStep[item.status];
                      const stepIndex = requestLifecycle.findIndex(
                        (step) => step.id === stepId
                      );
                      const step =
                        stepIndex >= 0 ? requestLifecycle[stepIndex] : requestLifecycle[0];
                      const position = stepIndex >= 0 ? stepIndex + 1 : 1;

                      return (
                        <div className="flex items-center gap-2 whitespace-nowrap text-[10px] uppercase text-Color-Neutral">
                          <span className="rounded-full border border-Color-Scheme-1-Border/40 px-2 py-0.5">
                            {step.label}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 ${
                              actorStyles[step.actor] ??
                              "border-Color-Scheme-1-Border/40 text-Color-Neutral"
                            }`}
                          >
                            {step.actor}
                          </span>
                          <span className="rounded-full border border-Color-Scheme-1-Border/40 px-2 py-0.5">
                            {position}/{requestLifecycle.length}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        className="rounded border border-Color-Scheme-1-Border/40 px-2 py-1 text-xs"
                        href={`/app/requests/${item.id}`}
                      >
                        View
                      </Link>
                      <button className="rounded border border-Color-Scheme-1-Border/40 px-2 py-1 text-xs">
                        Assign
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

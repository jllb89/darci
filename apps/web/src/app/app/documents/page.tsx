import Link from "next/link";

const documents = [
  {
    id: "DOC-1024",
    title: "Purchase Agreement - Elm St",
    role: "Owner",
    category: "Real Estate",
    created: "Mar 10, 2026",
    updated: "Mar 20, 2026",
    status: "Awaiting signatures",
    track: "notary",
    stepId: "sign",
  },
  {
    id: "DOC-2041",
    title: "Power of Attorney - Ramirez",
    role: "Signer",
    category: "Legal",
    created: "Mar 08, 2026",
    updated: "Mar 19, 2026",
    status: "Notary scheduled",
    track: "notary",
    stepId: "verify",
  },
  {
    id: "DOC-3307",
    title: "Lease Renewal - Jacobs",
    role: "Viewer",
    category: "Lease",
    created: "Mar 05, 2026",
    updated: "Mar 18, 2026",
    status: "Cancelled",
    track: "standard",
    terminalState: "Cancelled",
  },
  {
    id: "DOC-4409",
    title: "Affidavit - Grant",
    role: "Owner",
    category: "Notary",
    created: "Mar 02, 2026",
    updated: "Mar 15, 2026",
    status: "Completed",
    track: "notary",
    stepId: "anchor",
  },
  {
    id: "DOC-5128",
    title: "Employment Verification - Ellis",
    role: "Owner",
    category: "HR",
    created: "Feb 28, 2026",
    updated: "Mar 01, 2026",
    status: "Expired",
    track: "standard",
    terminalState: "Expired",
  },
  {
    id: "DOC-6003",
    title: "Vendor NDA - Orion",
    role: "Signer",
    category: "Corporate",
    created: "Feb 22, 2026",
    updated: "Feb 25, 2026",
    status: "Failed",
    track: "standard",
    terminalState: "Failed",
  },
  {
    id: "DOC-6101",
    title: "New Client Intake - Vega",
    role: "Owner",
    category: "Intake",
    created: "Mar 21, 2026",
    updated: "Mar 21, 2026",
    status: "Draft",
    track: "notary",
    stepId: "upload",
  },
  {
    id: "DOC-6102",
    title: "Trust Certification - OH",
    role: "Owner",
    category: "Trust",
    created: "Mar 21, 2026",
    updated: "Mar 21, 2026",
    status: "Prepared",
    track: "notary",
    stepId: "idn",
  },
  {
    id: "DOC-6103",
    title: "POA - Westlake",
    role: "Owner",
    category: "Legal",
    created: "Mar 21, 2026",
    updated: "Mar 21, 2026",
    status: "Signing",
    track: "notary",
    stepId: "sign",
  },
  {
    id: "DOC-6104",
    title: "Loan Packet - Crestview",
    role: "Owner",
    category: "Finance",
    created: "Mar 21, 2026",
    updated: "Mar 21, 2026",
    status: "Submitted",
    track: "notary",
    stepId: "submit",
  },
  {
    id: "DOC-6105",
    title: "Title Transfer - Baker",
    role: "Owner",
    category: "Real Estate",
    created: "Mar 21, 2026",
    updated: "Mar 21, 2026",
    status: "Code issued",
    track: "notary",
    stepId: "code",
  },
  {
    id: "DOC-6106",
    title: "Estate Affidavit - Nolan",
    role: "Owner",
    category: "Notary",
    created: "Mar 21, 2026",
    updated: "Mar 21, 2026",
    status: "Code shared",
    track: "notary",
    stepId: "share",
  },
  {
    id: "DOC-6107",
    title: "Seller Disclosure - Pine",
    role: "Owner",
    category: "Real Estate",
    created: "Mar 21, 2026",
    updated: "Mar 21, 2026",
    status: "Notary access",
    track: "notary",
    stepId: "access",
  },
  {
    id: "DOC-6108",
    title: "Guardianship - Patel",
    role: "Owner",
    category: "Legal",
    created: "Mar 21, 2026",
    updated: "Mar 21, 2026",
    status: "Acknowledgment",
    track: "notary",
    stepId: "ack",
  },
  {
    id: "DOC-6109",
    title: "Construction Lien - Reed",
    role: "Owner",
    category: "Construction",
    created: "Mar 21, 2026",
    updated: "Mar 21, 2026",
    status: "Watermarked",
    track: "notary",
    stepId: "watermark",
  },
  {
    id: "DOC-6110",
    title: "Closing Statement - Park",
    role: "Owner",
    category: "Real Estate",
    created: "Mar 21, 2026",
    updated: "Mar 21, 2026",
    status: "Verification",
    track: "notary",
    stepId: "verify",
  },
  {
    id: "DOC-6111",
    title: "Escrow Release - Miles",
    role: "Owner",
    category: "Finance",
    created: "Mar 21, 2026",
    updated: "Mar 21, 2026",
    status: "Notarized",
    track: "notary",
    stepId: "notarized",
  },
  {
    id: "DOC-6112",
    title: "Lien Waiver - Ortiz",
    role: "Owner",
    category: "Construction",
    created: "Mar 21, 2026",
    updated: "Mar 21, 2026",
    status: "Anchored",
    track: "notary",
    stepId: "anchor",
  },
  {
    id: "DOC-6113",
    title: "Public Verification - Avery Stone",
    role: "Owner",
    category: "Verification",
    created: "Mar 21, 2026",
    updated: "Mar 21, 2026",
    status: "Public check",
    track: "notary",
    stepId: "public",
  },
];

const statusStyles: Record<string, string> = {
  "Awaiting signatures": "border-amber-200 bg-amber-50 text-amber-700",
  "Notary scheduled": "border-blue-200 bg-blue-50 text-blue-700",
  Draft: "border-slate-200 bg-slate-50 text-slate-600",
  Prepared: "border-slate-200 bg-slate-50 text-slate-600",
  Signing: "border-amber-200 bg-amber-50 text-amber-700",
  Submitted: "border-violet-200 bg-violet-50 text-violet-700",
  "Code issued": "border-blue-200 bg-blue-50 text-blue-700",
  "Code shared": "border-blue-200 bg-blue-50 text-blue-700",
  "Notary access": "border-emerald-200 bg-emerald-50 text-emerald-700",
  Acknowledgment: "border-slate-200 bg-slate-50 text-slate-600",
  Watermarked: "border-slate-200 bg-slate-50 text-slate-600",
  Verification: "border-amber-200 bg-amber-50 text-amber-700",
  Notarized: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Anchored: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Public check": "border-emerald-200 bg-emerald-50 text-emerald-700",
  Completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Cancelled: "border-rose-200 bg-rose-50 text-rose-700",
  Expired: "border-orange-200 bg-orange-50 text-orange-700",
  Failed: "border-red-200 bg-red-50 text-red-700",
};

const lifecycleNotary = [
  { id: "upload", label: "Upload", actor: "member" },
  { id: "idn", label: "IDN", actor: "system" },
  { id: "sign", label: "Sign", actor: "member" },
  { id: "submit", label: "Submit", actor: "member" },
  { id: "code", label: "Code", actor: "system" },
  { id: "share", label: "Share", actor: "member" },
  { id: "access", label: "Access", actor: "notary" },
  { id: "ack", label: "Ack", actor: "system" },
  { id: "watermark", label: "Watermark", actor: "system" },
  { id: "verify", label: "Verify", actor: "notary" },
  { id: "notarized", label: "Notarized", actor: "system" },
  { id: "anchor", label: "Anchor", actor: "system" },
  { id: "public", label: "Public", actor: "public" },
];

const lifecycleStandard = [
  { id: "upload", label: "Upload", actor: "member" },
  { id: "idn", label: "IDN", actor: "system" },
  { id: "sign", label: "Sign", actor: "member" },
  { id: "anchor", label: "Anchor", actor: "system" },
];

const actorStyles: Record<string, string> = {
  "member/system": "border-Color-Scheme-1-Border/40 text-Color-Neutral",
  member: "border-amber-200 bg-amber-50 text-amber-700",
  system: "border-slate-200 bg-slate-50 text-slate-600",
  notary: "border-emerald-200 bg-emerald-50 text-emerald-700",
  public: "border-indigo-200 bg-indigo-50 text-indigo-700",
};

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <div className="text-2xl font-medium">Documents</div>
      <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
        <div className="text-sm font-medium">All documents</div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-Color-Neutral">
              <tr>
                <th className="px-3 py-2">Document</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-t border-Color-Scheme-1-Border/40">
                  <td className="px-3 py-3">
                    <Link
                      className="font-medium text-Color-Scheme-1-Text hover:underline"
                      href={`/app/documents/${doc.id}`}
                    >
                      {doc.title}
                    </Link>
                    <div className="text-xs text-Color-Neutral">{doc.id}</div>
                  </td>
                  <td className="px-3 py-3 text-Color-Neutral">{doc.role}</td>
                  <td className="px-3 py-3 text-Color-Neutral">{doc.category}</td>
                  <td className="px-3 py-3 text-Color-Neutral">{doc.created}</td>
                  <td className="px-3 py-3 text-Color-Neutral">{doc.updated}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      {doc.terminalState ? (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${
                            statusStyles[doc.terminalState] ??
                            "border-Color-Scheme-1-Border/40 text-Color-Neutral"
                          }`}
                        >
                          {doc.terminalState}
                        </span>
                      ) : (
                        (() => {
                          const steps =
                            doc.track === "standard"
                              ? lifecycleStandard
                              : lifecycleNotary;
                          const stepIndex = steps.findIndex(
                            (step) => step.id === doc.stepId
                          );
                          const step =
                            stepIndex >= 0 ? steps[stepIndex] : steps[0];
                          const position =
                            stepIndex >= 0 ? stepIndex + 1 : 1;

                          return (
                            <div className="flex items-center gap-2 text-[10px] uppercase text-Color-Neutral">
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
                                {position}/{steps.length}
                              </span>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        className="rounded border border-Color-Scheme-1-Border/40 px-2 py-1 text-xs"
                        href={`/app/documents/${doc.id}`}
                      >
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Link className="text-sm text-Color-Neutral-Darkest underline" href="/app">
        Back to dashboard
      </Link>
    </div>
  );
}

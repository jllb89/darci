import Link from "next/link";

const documents = [
  { title: "Purchase Agreement - Elm St", status: "Awaiting signatures" },
  { title: "Affidavit - Grant", status: "Completed" },
];

const audit = [
  "IDN verified · Mar 20, 2026",
  "Document access granted · Mar 18, 2026",
  "Identity record updated · Mar 15, 2026",
];

export default function VerificationDetailPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-medium">IDN-29384</div>
        <div className="text-sm text-Color-Neutral">Avery Stone · Verified</div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
          <div className="text-sm font-medium">Identity summary</div>
          <div className="mt-4 grid gap-3 text-sm text-Color-Neutral md:grid-cols-2">
            <div>
              <div className="text-xs uppercase">Email</div>
              <div className="text-Color-Scheme-1-Text">avery@darci.com</div>
            </div>
            <div>
              <div className="text-xs uppercase">Phone</div>
              <div className="text-Color-Scheme-1-Text">(415) 555-0124</div>
            </div>
            <div>
              <div className="text-xs uppercase">Region</div>
              <div className="text-Color-Scheme-1-Text">California</div>
            </div>
            <div>
              <div className="text-xs uppercase">Last check</div>
              <div className="text-Color-Scheme-1-Text">2 minutes ago</div>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Documents</div>
            <div className="mt-4 space-y-2 text-sm">
              {documents.map((doc) => (
                <div key={doc.title} className="flex items-center justify-between">
                  <div className="font-medium">{doc.title}</div>
                  <div className="text-xs text-Color-Neutral">{doc.status}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Audit log</div>
            <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
              {audit.map((entry) => (
                <div key={entry}>{entry}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Link className="text-sm text-Color-Neutral-Darkest underline" href="/app/verification">
        Back to verification
      </Link>
    </div>
  );
}

import Link from "next/link";

const results = [
  {
    id: "IDN-29384",
    name: "Avery Stone",
    status: "Verified",
    updated: "2m ago",
  },
  {
    id: "IDN-10482",
    name: "Jordan Lee",
    status: "Review",
    updated: "14m ago",
  },
  {
    id: "IDN-55302",
    name: "Riley Chen",
    status: "Verified",
    updated: "1h ago",
  },
];

export default function VerificationPage() {
  return (
    <div className="space-y-6">
      <div className="text-2xl font-medium">Verification</div>
      <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
        <div className="text-sm font-medium">IDN lookup</div>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <input
            className="w-full rounded border border-Color-Scheme-1-Border/40 bg-transparent px-3 py-2 text-sm"
            placeholder="Enter IDN"
          />
          <button className="rounded bg-Green px-4 py-2 text-sm font-medium text-Color-Neutral-Darkest">
            Verify
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
        <div className="text-sm font-medium">Results</div>
        <div className="mt-4 space-y-3">
          {results.map((result) => (
            <div
              key={result.id}
              className="flex flex-col gap-2 rounded border border-Color-Scheme-1-Border/40 px-3 py-2 text-sm md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="font-medium">{result.name}</div>
                <div className="text-xs text-Color-Neutral">{result.id}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs text-Color-Neutral">{result.status}</div>
                <div className="text-xs text-Color-Neutral">{result.updated}</div>
                <Link
                  className="text-xs font-medium text-Color-Neutral-Darkest underline"
                  href={`/app/verification/${result.id}`}
                >
                  View detail
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function NotaryHomePage() {
  return (
    <div className="space-y-6">
      <div className="text-2xl font-medium">Notary Queue</div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
          <div className="text-sm font-medium">Pending requests</div>
          <div className="mt-4 text-sm text-Color-Neutral">Queue is empty.</div>
        </div>
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
          <div className="text-sm font-medium">Calendar</div>
        </div>
      </div>
    </div>
  );
}

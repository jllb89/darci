export default function OpsConsolePage() {
  return (
    <div className="space-y-6">
      <div className="text-2xl font-medium">Ops Console</div>
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr_1fr]">
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
          <div className="text-sm font-medium">Filters</div>
        </div>
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
          <div className="text-sm font-medium">Audit events</div>
        </div>
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
          <div className="text-sm font-medium">Details</div>
        </div>
      </div>
    </div>
  );
}

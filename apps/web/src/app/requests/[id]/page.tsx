export default function RequestWorkspacePage() {
  return (
    <div className="space-y-6">
      <div className="text-2xl font-medium">Request Workspace</div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Request summary</div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Request timeline</div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Code share</div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Meeting status</div>
          </div>
        </div>
      </div>
    </div>
  );
}

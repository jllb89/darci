export default function NotaryRequestWorkspacePage() {
  return (
    <div className="space-y-6">
      <div className="text-2xl font-medium">Notary Request Workspace</div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
          <div className="text-sm font-medium">Document preview</div>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Identity verification</div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Seal and signature</div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Completion</div>
          </div>
        </div>
      </div>
    </div>
  );
}

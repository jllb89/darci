export default function DocumentWorkspacePage() {
  return (
    <div className="space-y-6">
      <div className="text-2xl font-medium">Document Workspace</div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
          <div className="text-sm font-medium">Document preview</div>
          <div className="mt-4 text-sm text-Color-Neutral">Preview pending.</div>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Status timeline</div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Signature</div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Actions</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StartDocumentPage() {
  return (
    <div className="space-y-8">
      <div>
        <div className="text-2xl font-medium">Start a document</div>
        <div className="text-sm text-Color-Neutral">
          Set the jurisdiction, upload the file, and prepare for signing.
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "1. Jurisdiction",
            description: "Select state requirements and acknowledgment rules.",
          },
          {
            title: "2. Upload",
            description: "Add the document that will be notarized.",
          },
          {
            title: "3. Prepare",
            description: "Review details, then move to signing and submission.",
          },
        ].map((step) => (
          <div
            key={step.title}
            className="rounded-lg border border-Color-Scheme-1-Border/40 p-4"
          >
            <div className="text-sm font-medium">{step.title}</div>
            <div className="mt-2 text-xs text-Color-Neutral">
              {step.description}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4 rounded-lg border border-Color-Scheme-1-Border/40 p-4">
          <div className="text-sm font-medium">Jurisdiction</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-2 text-sm text-Color-Neutral">
              Select state
            </div>
            <div className="rounded border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-2 text-sm text-Color-Neutral">
              Select county (optional)
            </div>
          </div>
          <div className="rounded border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-2 text-sm text-Color-Neutral">
            Acknowledgment type
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-Color-Scheme-1-Border/40 p-4">
          <div className="text-sm font-medium">Upload</div>
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest text-xs text-Color-Neutral">
            Drag and drop PDF or click to browse
          </div>
          <button className="w-full rounded bg-Green px-4 py-2 text-sm font-medium text-Color-Neutral-Darkest">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

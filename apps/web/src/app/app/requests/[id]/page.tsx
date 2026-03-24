const statusStyles: Record<string, string> = {
  "Pending review": "border-amber-200 bg-amber-50 text-amber-700",
  "In progress": "border-blue-200 bg-blue-50 text-blue-700",
  "Awaiting notary": "border-violet-200 bg-violet-50 text-violet-700",
  Completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const timeline = [
  "Request created · Mar 20, 2026",
  "Assigned to Notary J. Patel · Mar 20, 2026",
  "Meeting scheduled · Mar 21, 2026",
];

const participants = [
  { name: "Atlas Legal", role: "Requestor" },
  { name: "Avery Stone", role: "Signer" },
  { name: "Notary J. Patel", role: "Notary" },
];

export default function RequestWorkspacePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-2xl font-medium">Urgent notarization</div>
          <div className="text-sm text-Color-Neutral">REQ-8812 · Purchase Agreement - Elm St</div>
        </div>
        <span
          className={`w-fit rounded-full border px-3 py-1 text-xs ${
            statusStyles["Pending review"]
          }`}
        >
          Pending review
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Request summary</div>
            <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
              <div>Priority: High</div>
              <div>Due: Mar 22, 2026</div>
              <div>Requested by: Atlas Legal</div>
            </div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Participants</div>
            <div className="mt-4 space-y-2 text-sm">
              {participants.map((person) => (
                <div key={person.name} className="flex items-center justify-between">
                  <div className="font-medium">{person.name}</div>
                  <div className="text-xs text-Color-Neutral">{person.role}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Request timeline</div>
            <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
              {timeline.map((event) => (
                <div key={event}>{event}</div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Code share</div>
            <div className="mt-4 text-sm text-Color-Neutral">Share code: 8F4K-2J</div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Meeting status</div>
            <div className="mt-4 text-sm text-Color-Neutral">Scheduled · Mar 21, 10:00 AM</div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Actions</div>
            <div className="mt-4 flex flex-col gap-2">
              <button className="rounded border border-Color-Scheme-1-Border/40 px-3 py-2 text-sm">
                Assign notary
              </button>
              <button className="rounded border border-Color-Scheme-1-Border/40 px-3 py-2 text-sm">
                Reschedule
              </button>
              <button className="rounded bg-Green px-3 py-2 text-sm font-medium text-Color-Neutral-Darkest">
                Mark complete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

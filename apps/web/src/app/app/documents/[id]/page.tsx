const statusStyles: Record<string, string> = {
  "Awaiting signatures": "border-amber-200 bg-amber-50 text-amber-700",
  "Notary scheduled": "border-blue-200 bg-blue-50 text-blue-700",
  Draft: "border-slate-200 bg-slate-50 text-slate-600",
  Completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const lifecycleSteps = [
  {
    id: "upload",
    shortLabel: "Upload",
    label: "Member uploads or generates document",
    fields: ["Source", "File name", "Pages", "Owner"],
  },
  {
    id: "idn",
    shortLabel: "IDN",
    label: "DARCi assigns IDN and prepares for signing",
    fields: ["IDN", "Document version", "Prepared at"],
  },
  {
    id: "sign",
    shortLabel: "Sign",
    label: "Member signs electronically",
    fields: [],
  },
  {
    id: "submit",
    shortLabel: "Submit",
    label: "Member submits for illuminotarization",
    fields: ["Request ID", "Selected notary", "Submitted at"],
  },
  {
    id: "code",
    shortLabel: "Code",
    label: "Member receives illuminotarization code",
    fields: ["Code", "Delivery method", "Expires"],
  },
  {
    id: "share",
    shortLabel: "Share",
    label: "Member provides code to illuminotary",
    fields: ["Share method", "Shared at", "Recipient"],
  },
  {
    id: "access",
    shortLabel: "Access",
    label: "Illuminotary accesses via code",
    fields: ["Notary", "Access time", "Validation result"],
  },
  {
    id: "ack",
    shortLabel: "Ack",
    label: "DARCi appends acknowledgment page",
    fields: ["Jurisdiction", "Template", "Acknowledgment page"],
  },
  {
    id: "watermark",
    shortLabel: "Watermark",
    label: "DARCi watermarks document",
    fields: ["Watermark text", "Pages watermarked", "Completed at"],
  },
  {
    id: "verify",
    shortLabel: "Verify",
    label: "Illuminotary verifies and applies seal/signature",
    fields: ["Meeting time", "Verification method", "Seal/signature"],
  },
  {
    id: "notarized",
    shortLabel: "Notarized",
    label: "Completed document submitted and hashed",
    fields: ["Final file", "Hash", "Submitted at"],
  },
  {
    id: "anchor",
    shortLabel: "Anchor",
    label: "IDN + hash written to distributed ledger",
    fields: ["Ledger TX", "Anchor status", "Anchored at"],
  },
  {
    id: "public",
    shortLabel: "Public",
    label: "Verification endpoint for public checks",
    fields: ["Verification result", "Ledger TX", "Checked at"],
  },
];

const documentsById: Record<string, {
  id: string;
  title: string;
  category: string;
  state: string;
  status: string;
  stepId: string;
  participants: Array<{ name: string; role: string; status: string }>;
  timeline: string[];
  files: Array<{ name: string; size: string }>;
  linkedDocuments: Array<{ name: string; status: string; owner: string }>;
  requirements: string[];
  stepDetails: Array<{ label: string; value: string }>;
}> = {
  "DOC-6101": {
    id: "DOC-6101",
    title: "New Client Intake - Vega",
    category: "Intake",
    state: "Ohio",
    status: "Draft",
    stepId: "upload",
    participants: [
      { name: "Avery Stone", role: "Owner", status: "Pending" },
    ],
    timeline: ["Upload started · Mar 21, 2026"],
    files: [{ name: "Client Intake - Vega.pdf", size: "860 KB" }],
    linkedDocuments: [
      {
        name: "Trust Cert and Registration Amendment - OH.pdf",
        status: "Required",
        owner: "Client",
      },
    ],
    requirements: [
      "Certificate of acknowledgment for Ohio",
      "Signer identity and contact details",
      "Notary electronic seal and signature",
    ],
    stepDetails: [
      { label: "Source", value: "Upload" },
      { label: "File name", value: "Client Intake - Vega.pdf" },
      { label: "Pages", value: "6" },
      { label: "Owner", value: "Avery Stone" },
    ],
  },
  "DOC-6102": {
    id: "DOC-6102",
    title: "Trust Certification - OH",
    category: "Trust",
    state: "Ohio",
    status: "Prepared",
    stepId: "idn",
    participants: [
      { name: "Avery Stone", role: "Owner", status: "Ready" },
    ],
    timeline: ["IDN assigned · Mar 21, 2026"],
    files: [{ name: "Trust Certification - OH.pdf", size: "1.1 MB" }],
    linkedDocuments: [
      {
        name: "Trust Cert and Registration Amendment - OH.pdf",
        status: "Required",
        owner: "Client",
      },
    ],
    requirements: [
      "Ohio acknowledgment certificate",
      "Commission expiration date",
      "Notary seal and signature",
    ],
    stepDetails: [
      { label: "IDN", value: "IDN-29384" },
      { label: "Document version", value: "v1" },
      { label: "Prepared at", value: "Mar 21, 2026" },
    ],
  },
  "DOC-6103": {
    id: "DOC-6103",
    title: "POA - Westlake",
    category: "Legal",
    state: "California",
    status: "Signing",
    stepId: "sign",
    participants: [
      { name: "Avery Stone", role: "Owner", status: "Signed" },
      { name: "Jordan Lee", role: "Signer", status: "Pending" },
    ],
    timeline: ["Signature started · Mar 21, 2026"],
    files: [{ name: "POA - Westlake.pdf", size: "940 KB" }],
    linkedDocuments: [
      {
        name: "Trust Cert and Registration Amendment - CA.pdf",
        status: "Optional",
        owner: "Client",
      },
    ],
    requirements: [
      "California acknowledgment certificate",
      "Signer identity and contact details",
      "Notary seal and signature",
    ],
    stepDetails: [],
  },
  "DOC-6104": {
    id: "DOC-6104",
    title: "Loan Packet - Crestview",
    category: "Finance",
    state: "Ohio",
    status: "Submitted",
    stepId: "submit",
    participants: [
      { name: "Avery Stone", role: "Owner", status: "Submitted" },
    ],
    timeline: ["Notarization submitted · Mar 21, 2026"],
    files: [{ name: "Loan Packet - Crestview.pdf", size: "2.3 MB" }],
    linkedDocuments: [
      {
        name: "Power of Attorney - Ramirez.pdf",
        status: "Requested",
        owner: "Client",
      },
    ],
    requirements: [
      "Ohio acknowledgment certificate",
      "Signer identity and contact details",
      "Notary seal and signature",
    ],
    stepDetails: [
      { label: "Request ID", value: "REQ-8812" },
      { label: "Selected notary", value: "J. Patel" },
      { label: "Submitted at", value: "Mar 21, 2026" },
    ],
  },
  "DOC-6105": {
    id: "DOC-6105",
    title: "Title Transfer - Baker",
    category: "Real Estate",
    state: "Ohio",
    status: "Code issued",
    stepId: "code",
    participants: [
      { name: "Avery Stone", role: "Owner", status: "Waiting" },
    ],
    timeline: ["Code issued · Mar 21, 2026"],
    files: [{ name: "Title Transfer - Baker.pdf", size: "1.6 MB" }],
    linkedDocuments: [
      {
        name: "Trust Cert and Registration Amendment - OH.pdf",
        status: "Required",
        owner: "Client",
      },
    ],
    requirements: [
      "Ohio acknowledgment certificate",
      "Signer identity and contact details",
      "Notary seal and signature",
    ],
    stepDetails: [
      { label: "Code", value: "KJ4M-2N" },
      { label: "Delivery", value: "SMS" },
      { label: "Expires", value: "Mar 22, 2026" },
    ],
  },
  "DOC-6106": {
    id: "DOC-6106",
    title: "Estate Affidavit - Nolan",
    category: "Notary",
    state: "Ohio",
    status: "Code shared",
    stepId: "share",
    participants: [
      { name: "Avery Stone", role: "Owner", status: "Shared" },
    ],
    timeline: ["Code shared · Mar 21, 2026"],
    files: [{ name: "Estate Affidavit - Nolan.pdf", size: "760 KB" }],
    linkedDocuments: [
      {
        name: "Power of Attorney - Ramirez.pdf",
        status: "Requested",
        owner: "Client",
      },
    ],
    requirements: [
      "Ohio acknowledgment certificate",
      "Signer identity and contact details",
      "Notary seal and signature",
    ],
    stepDetails: [
      { label: "Share method", value: "In app" },
      { label: "Shared at", value: "Mar 21, 2026" },
      { label: "Recipient", value: "J. Patel" },
    ],
  },
  "DOC-6107": {
    id: "DOC-6107",
    title: "Seller Disclosure - Pine",
    category: "Real Estate",
    state: "Ohio",
    status: "Notary access",
    stepId: "access",
    participants: [
      { name: "Notary J. Patel", role: "Notary", status: "Viewing" },
    ],
    timeline: ["Notary accessed · Mar 21, 2026"],
    files: [{ name: "Seller Disclosure - Pine.pdf", size: "1.4 MB" }],
    linkedDocuments: [
      {
        name: "Trust Cert and Registration Amendment - OH.pdf",
        status: "Required",
        owner: "Client",
      },
    ],
    requirements: [
      "Ohio acknowledgment certificate",
      "Signer identity and contact details",
      "Notary seal and signature",
    ],
    stepDetails: [
      { label: "Notary", value: "J. Patel" },
      { label: "Access time", value: "Mar 21, 2026" },
      { label: "Validation", value: "Valid" },
    ],
  },
  "DOC-6108": {
    id: "DOC-6108",
    title: "Guardianship - Patel",
    category: "Legal",
    state: "Ohio",
    status: "Acknowledgment",
    stepId: "ack",
    participants: [
      { name: "Avery Stone", role: "Owner", status: "Waiting" },
    ],
    timeline: ["Acknowledgment appended · Mar 21, 2026"],
    files: [{ name: "Guardianship - Patel.pdf", size: "1.1 MB" }],
    linkedDocuments: [
      {
        name: "Trust Cert and Registration Amendment - OH.pdf",
        status: "Required",
        owner: "Client",
      },
    ],
    requirements: [
      "Ohio acknowledgment certificate",
      "Signer identity and contact details",
      "Notary seal and signature",
    ],
    stepDetails: [
      { label: "Jurisdiction", value: "Ohio" },
      { label: "Template", value: "OH_ACK_V3" },
      { label: "Page", value: "Ack Page 1" },
    ],
  },
  "DOC-6109": {
    id: "DOC-6109",
    title: "Construction Lien - Reed",
    category: "Construction",
    state: "Ohio",
    status: "Watermarked",
    stepId: "watermark",
    participants: [
      { name: "Avery Stone", role: "Owner", status: "Waiting" },
    ],
    timeline: ["Watermark completed · Mar 21, 2026"],
    files: [{ name: "Construction Lien - Reed.pdf", size: "1.9 MB" }],
    linkedDocuments: [
      {
        name: "Trust Cert and Registration Amendment - OH.pdf",
        status: "Required",
        owner: "Client",
      },
    ],
    requirements: [
      "Ohio acknowledgment certificate",
      "Signer identity and contact details",
      "Notary seal and signature",
    ],
    stepDetails: [
      { label: "Watermark text", value: "Digital Original + IDN" },
      { label: "Pages", value: "12" },
      { label: "Completed at", value: "Mar 21, 2026" },
    ],
  },
  "DOC-6110": {
    id: "DOC-6110",
    title: "Closing Statement - Park",
    category: "Real Estate",
    state: "Ohio",
    status: "Verification",
    stepId: "verify",
    participants: [
      { name: "Notary J. Patel", role: "Notary", status: "In meeting" },
    ],
    timeline: ["Meeting started · Mar 21, 2026"],
    files: [{ name: "Closing Statement - Park.pdf", size: "2.2 MB" }],
    linkedDocuments: [
      {
        name: "Power of Attorney - Ramirez.pdf",
        status: "Requested",
        owner: "Client",
      },
    ],
    requirements: [
      "Ohio acknowledgment certificate",
      "Signer identity and contact details",
      "Notary seal and signature",
    ],
    stepDetails: [
      { label: "Meeting time", value: "Mar 21, 10:00 AM" },
      { label: "Verification", value: "ID scan + selfie" },
      { label: "Seal/signature", value: "Pending" },
    ],
  },
  "DOC-6111": {
    id: "DOC-6111",
    title: "Escrow Release - Miles",
    category: "Finance",
    state: "Ohio",
    status: "Notarized",
    stepId: "notarized",
    participants: [
      { name: "Notary J. Patel", role: "Notary", status: "Completed" },
    ],
    timeline: ["Notarized · Mar 21, 2026"],
    files: [{ name: "Escrow Release - Miles.pdf", size: "1.3 MB" }],
    linkedDocuments: [
      {
        name: "Trust Cert and Registration Amendment - OH.pdf",
        status: "Required",
        owner: "Client",
      },
    ],
    requirements: [
      "Ohio acknowledgment certificate",
      "Signer identity and contact details",
      "Notary seal and signature",
    ],
    stepDetails: [
      { label: "Final file", value: "Escrow Release - Miles (Final).pdf" },
      { label: "Hash", value: "0x73a2...8c1" },
      { label: "Submitted", value: "Mar 21, 2026" },
    ],
  },
  "DOC-6112": {
    id: "DOC-6112",
    title: "Lien Waiver - Ortiz",
    category: "Construction",
    state: "Ohio",
    status: "Anchored",
    stepId: "anchor",
    participants: [
      { name: "Avery Stone", role: "Owner", status: "Complete" },
    ],
    timeline: ["Ledger anchored · Mar 21, 2026"],
    files: [{ name: "Lien Waiver - Ortiz.pdf", size: "980 KB" }],
    linkedDocuments: [
      {
        name: "Trust Cert and Registration Amendment - OH.pdf",
        status: "Required",
        owner: "Client",
      },
    ],
    requirements: [
      "Ohio acknowledgment certificate",
      "Signer identity and contact details",
      "Notary seal and signature",
    ],
    stepDetails: [
      { label: "Ledger TX", value: "0x9f2b...91a" },
      { label: "Status", value: "Anchored" },
      { label: "Anchored at", value: "Mar 21, 2026" },
    ],
  },
  "DOC-6113": {
    id: "DOC-6113",
    title: "Public Verification - Avery Stone",
    category: "Verification",
    state: "Ohio",
    status: "Public check",
    stepId: "public",
    participants: [
      { name: "Public visitor", role: "Viewer", status: "Checked" },
    ],
    timeline: ["Verification requested · Mar 21, 2026"],
    files: [{ name: "Verification Summary.pdf", size: "240 KB" }],
    linkedDocuments: [
      {
        name: "Trust Cert and Registration Amendment - OH.pdf",
        status: "Required",
        owner: "Client",
      },
    ],
    requirements: [
      "IDN available for verification",
      "Ledger anchor reference",
      "Public verification result",
    ],
    stepDetails: [
      { label: "Verification", value: "Valid" },
      { label: "Ledger TX", value: "0x9f2b...91a" },
      { label: "Checked at", value: "Mar 21, 2026" },
    ],
  },
  "DOC-1024": {
    id: "DOC-1024",
    title: "Purchase Agreement - Elm St",
    category: "Real Estate",
    state: "Ohio",
    status: "Awaiting signatures",
    stepId: "sign",
    participants: [
      { name: "Avery Stone", role: "Owner", status: "Signed" },
      { name: "Jordan Lee", role: "Signer", status: "Pending" },
      { name: "Notary J. Patel", role: "Notary", status: "Scheduled" },
    ],
    timeline: [
      "Draft created · Mar 10, 2026",
      "Shared with Jordan Lee · Mar 12, 2026",
      "Notary scheduled · Mar 20, 2026",
    ],
    files: [
      { name: "Purchase Agreement - Elm St.pdf", size: "1.2 MB" },
      { name: "ID Verification Packet.pdf", size: "320 KB" },
    ],
    linkedDocuments: [
      {
        name: "Trust Cert and Registration Amendment - OH.pdf",
        status: "Required",
        owner: "Client",
      },
      {
        name: "Power of Attorney - Ramirez.pdf",
        status: "Requested",
        owner: "Client",
      },
    ],
    requirements: [
      "Certificate of acknowledgment for Ohio",
      "Signer identity and contact details",
      "Notary electronic seal and signature",
    ],
    stepDetails: [],
  },
};

const fallbackDocument = documentsById["DOC-1024"];

export default function DocumentWorkspacePage({
  params,
}: {
  params: { id: string };
}) {
  const document = documentsById[params.id] ?? fallbackDocument;
  const lifecycle = lifecycleSteps.find((step) => step.id === document.stepId);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-2xl font-medium">{document.title}</div>
          <div className="text-sm text-Color-Neutral">
            {document.id} · {document.category} - {document.state}
          </div>
        </div>
        <span
          className={`w-fit rounded-full border px-3 py-1 text-xs ${
            statusStyles[document.status] ??
            "border-Color-Scheme-1-Border/40 text-Color-Neutral"
          }`}
        >
          {document.status}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Document preview</div>
            <div className="mt-4 text-sm text-Color-Neutral">
Coming soon.
            </div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Participants</div>
            <div className="mt-4 space-y-3 text-sm">
              {document.participants.map((person) => (
                <div key={person.name} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{person.name}</div>
                    <div className="text-xs text-Color-Neutral">{person.role}</div>
                  </div>
                  <div className="text-xs text-Color-Neutral">{person.status}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Files</div>
            <div className="mt-4 space-y-2 text-sm">
              {document.files.map((file) => (
                <div key={file.name} className="flex items-center justify-between">
                  <div>{file.name}</div>
                  <div className="text-xs text-Color-Neutral">{file.size}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Linked documents</div>
            <div className="mt-4 space-y-3 text-sm">
              {document.linkedDocuments.map((doc) => (
                <div key={doc.name} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{doc.name}</div>
                    <div className="text-xs text-Color-Neutral">{doc.owner}</div>
                  </div>
                  <span className="rounded-full border border-Color-Scheme-1-Border/40 px-2 py-0.5 text-[10px] uppercase text-Color-Neutral">
                    {doc.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Document Lifecycle</div>
            <ul className="mt-3 space-y-1 text-xs">
              {lifecycleSteps.map((step) => {
                const isActive = step.id === document.stepId;
                return (
                  <li
                    key={step.id}
                    className={
                      isActive
                        ? "text-Color-Scheme-1-Text"
                        : "text-Color-Neutral"
                    }
                  >
                    {step.label}
                  </li>
                );
              })}
            </ul>
            {document.stepDetails.length > 0 && (
              <div className="mt-4 space-y-2 text-sm">
                {document.stepDetails.map((detail) => (
                  <div key={detail.label} className="flex items-center justify-between">
                    <div className="text-Color-Neutral">{detail.label}</div>
                    <div className="text-xs text-Color-Neutral">{detail.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Acknowledgment requirements</div>
            <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
              {document.requirements.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
            <a
              className="mt-3 inline-flex text-xs font-medium text-Color-Neutral-Darkest underline"
              href="https://codes.ohio.gov/ohio-revised-code/section-147.542"
              target="_blank"
              rel="noreferrer"
            >
              Ohio acknowledgment reference
            </a>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Status timeline</div>
            <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
              {document.timeline.map((event) => (
                <div key={event}>{event}</div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Signature</div>
            <div className="mt-4 text-sm text-Color-Neutral">2 of 3 required.</div>
          </div>
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Actions</div>
            <div className="mt-4 flex flex-col gap-2">
              <button className="rounded border border-Color-Scheme-1-Border/40 px-3 py-2 text-sm">
                Send reminder
              </button>
              <button className="rounded border border-Color-Scheme-1-Border/40 px-3 py-2 text-sm">
                Share link
              </button>
              <button className="rounded bg-Green px-3 py-2 text-sm font-medium text-Color-Neutral-Darkest">
                Request notary
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

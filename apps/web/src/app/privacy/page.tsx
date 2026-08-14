const sections = [
  {
    title: "What DARCi Collects",
    body: "DARCi collects the account, contact, identity, document workflow, authentication, and audit information needed to provide secure digital assent, document registration, authentication, notarization support, and related account services.",
  },
  {
    title: "How DARCi Uses Information",
    body: "DARCi uses personal information to create and secure accounts, verify access, complete requested workflows, maintain business records, provide support, send transactional notifications, and comply with legal, security, and platform obligations.",
  },
  {
    title: "SMS Authentication",
    body: "When you enter a phone number and request a verification code, DARCi may send a transactional SMS one-time passcode for authentication, sign-in, signup, phone verification, or account security. Message and data rates may apply, and message frequency varies by login activity. Reply STOP to opt out or HELP for help.",
  },
  {
    title: "Sharing And Retention",
    body: "DARCi does not sell personal information. Information is shared only with service providers, platform operators, professional participants, or other parties as needed to provide requested workflows, comply with law, protect the service, or honor user-directed permissions. DARCi retains records as needed for legal, security, operational, and product obligations.",
  },
  {
    title: "Contact",
    body: "For privacy questions or account support, contact support@darciregistry.com.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-Color-Neutral-Lightest px-6 py-16 text-Color-Scheme-1-Text md:px-12">
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <header className="flex flex-col gap-4 border-b border-Color-Scheme-1-Border pb-8">
          <p className="text-sm font-medium uppercase tracking-[0.08em] text-Color-Neutral-Darkest/70">
            DARCi Registry
          </p>
          <h1 className="font-display text-4xl font-medium leading-tight md:text-5xl">
            Privacy Policy
          </h1>
          <p className="text-base leading-7 text-Color-Neutral-Darkest/80">
            This policy summarizes how DARCi handles information for account access,
            authentication, document workflows, support, and required platform records.
          </p>
        </header>

        <div className="flex flex-col gap-8">
          {sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-3">
              <h2 className="font-display text-2xl font-medium leading-snug">
                {section.title}
              </h2>
              <p className="text-base leading-7 text-Color-Neutral-Darkest/80">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
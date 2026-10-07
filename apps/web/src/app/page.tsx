import Link from "next/link";
import AdvantageSection from "@/components/AdvantageSection";
import LandingIcon from "@/components/LandingIcon";
import Navbar from "@/components/Navbar";
import PricingSection from "@/components/PricingSection";

const essentials = [
  { icon: "document", title: "Digital original", body: "Create, sign, and keep your documents digitally." },
  { icon: "send", title: "Send codes, not files", body: "Recipients get secure access without email attachments." },
  { icon: "verify", title: "Verified by ID, checked anytime", body: "Check the finalized document against its recorded SHA-256 fingerprint." },
  { icon: "seal", title: "Illuminotary seals the record", body: "A commissioned notary confirms identity and intent in person." },
] as const;

const workflow = [
  { icon: "upload", title: "Choose your product or upload your documents", body: "Create a Trust package or POA, or upload a document for notarization." },
  { icon: "identifier", title: "Review your documents and unique document ID", body: "Check the information before continuing. Uploaded-document signatures are optional." },
  { icon: "signature", title: "Sign and meet your illuminotary", body: "Complete any required signatures, choose a notary, and arrange your in-person session." },
  { icon: "globe", title: "Verify the completed record", body: "Once finalized, share the public verification link to check the document's integrity." },
] as const;

const faqs = [
  { question: "What is IPEN acknowledgment?", answer: "IPEN is in-person electronic notarization. You meet with a notary to confirm identity and intent, while DARCi supports the digital document and acknowledgment workflow." },
  { question: "How does document verification work?", answer: "After notarization, DARCi records a SHA-256 fingerprint of the finalized document. Verification checks whether a file matches those recorded bytes. This launch does not use an external ledger; a matching hash is an integrity check, not independent proof of identity or legal validity." },
  { question: "Is DARCi legally compliant?", answer: "DARCi supports jurisdiction-specific in-person electronic notarization workflows. Availability and requirements depend on the jurisdiction and document. Your notary reviews the applicable requirements; a digital integrity record alone does not establish legal validity." },
  { question: "How long does illuminotarization take?", answer: "Timing depends on document preparation, signatures, notary availability, and your in-person appointment. After the notary completes the session, DARCi processes the final package and records its integrity evidence." },
  { question: "Can anyone verify my documents?", answer: "You can share a public verification link for a finalized document. The verification record describes its status and recorded integrity evidence; a matching hash alone does not establish legal validity." },
];

const headingClass = "font-display text-4xl font-medium leading-tight [overflow-wrap:anywhere] md:text-5xl";
const focusClass = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current";

function CallToAction({ image, title, body, white = false }: { image: string; title: string; body: string; white?: boolean }) {
  return (
    <section className="relative bg-black bg-cover bg-center px-6 py-20 md:px-16 md:py-28" style={{ backgroundImage: `url('${image}')` }}>
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
      <div className="relative mx-auto flex max-w-[1280px] flex-col gap-12 text-white lg:flex-row lg:gap-20">
        <h2 className={`min-w-0 flex-1 ${headingClass}`}>{title}</h2>
        <div className="min-w-0 flex-1 space-y-8">
          <p className="text-base leading-6">{body}</p>
          <Link href="/start" className={`inline-flex min-h-12 items-center gap-3 px-6 py-3 text-sm font-medium text-black ${focusClass} ${white ? "bg-white" : "bg-Green"}`}>
            Get started <LandingIcon name="arrow" className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <div className="w-full bg-Color-Neutral-Lightest text-Color-Scheme-1-Text">
      <Navbar showLogout={false} />
      <main id="main-content">
        <section className="relative bg-black bg-cover bg-center px-6 py-24 md:px-24 md:py-48" style={{ backgroundImage: "url('/images/hero/hero.webp')" }}>
          <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
          <div className="relative mx-auto flex max-w-[1280px] flex-col gap-12 text-white lg:flex-row lg:items-end lg:gap-20">
            <div className="min-w-0 flex-1 space-y-8">
              <h1 className="font-display text-4xl font-normal leading-[1.2] [overflow-wrap:anywhere] md:text-5xl">Introducing illuminotarization: Notarization that moves at your speed.</h1>
              <div className="flex flex-wrap gap-4">
                <Link href="/start" className={`inline-flex min-h-12 items-center bg-Green px-6 py-3 text-sm font-medium text-black ${focusClass}`}>Get started</Link>
                <a href="#features" className={`inline-flex min-h-12 items-center bg-white/20 px-6 py-3 text-sm font-medium ${focusClass}`}>Learn more</a>
              </div>
            </div>
            <p className="min-w-0 flex-1 text-base leading-6">Notarization simplified. Create, sign, verify, and authenticate documents with a guided digital workflow and an in-person notary session.</p>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 px-6 py-20 md:px-16 md:py-28">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-16">
            <div className="flex flex-col gap-10 lg:flex-row lg:gap-20">
              <div className="min-w-0 flex-1 space-y-4">
                <p className="text-base leading-6">Essentials</p>
                <h2 className={headingClass}>The mechanics that make illuminotarization work.</h2>
              </div>
              <p className="min-w-0 flex-1 text-base leading-6">DARCi brings document preparation, signatures, and in-person notarization together. Your notary reviews the requirements for your document and jurisdiction.</p>
            </div>
            <div className="grid border-t border-Color-Scheme-1-Border sm:grid-cols-2 lg:grid-cols-4">
              {essentials.map((item, index) => (
                <article key={item.title} className={`min-w-0 space-y-6 px-4 py-8 ${index < 3 ? "lg:border-r lg:border-Color-Scheme-1-Border" : ""}`}>
                  <LandingIcon name={item.icon} />
                  <h3 className="font-display text-2xl font-medium leading-tight md:text-3xl">{item.title}</h3>
                  <p className="text-base leading-6">{item.body}</p>
                </article>
              ))}
            </div>
            <Link href="/start" className={`inline-flex min-h-11 w-fit items-center gap-2 text-base underline underline-offset-4 ${focusClass}`}>
              Start right now <LandingIcon name="arrow" className="h-5 w-5" />
            </Link>
          </div>
        </section>

        <CallToAction image="/images/cta/cta1.webp" title="Ready to illuminotarize?" body="Select one of our products and see how DARCi moves at your speed." white />

        <section id="how-it-works" className="scroll-mt-24 px-6 py-20 md:px-16 md:py-28">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-10 lg:flex-row lg:gap-20">
            <div className="min-w-0 flex-1 space-y-6">
              <p className="text-base leading-6">Workflow</p>
              <h2 className={headingClass}>The illuminotary digital experience.</h2>
            </div>
            <ol className="min-w-0 flex-1 space-y-10">
              {workflow.map((step) => (
                <li key={step.title} className="flex gap-5 md:gap-10">
                  <LandingIcon name={step.icon} />
                  <div className="min-w-0 space-y-4">
                    <h3 className="font-display text-xl font-medium leading-8">{step.title}</h3>
                    <p className="text-sm leading-6">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <AdvantageSection />
        {/* No testimonial is published until its attribution and permission are confirmed. */}
        <CallToAction image="/images/cta/cta2.webp" title="Your illuminotary work starts now" body="Prepare your documents digitally, complete the required signatures, and arrange your appointment with a qualified notary." />
        <PricingSection />
        <CallToAction image="/images/cta/cta3.webp" title="Move faster without compromise" body="DARCi guides the document workflow so you can focus on what matters. Explore membership and start your next document." />

        <section id="questions" className="scroll-mt-24 bg-white px-6 py-20 md:px-16 md:py-28">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-12 lg:flex-row lg:gap-20">
            <div className="min-w-0 flex-1 space-y-6">
              <h2 className={headingClass}>Questions</h2>
              <p className="text-base leading-6">Find answers about DARCi, notarization, and how our platform works.</p>
              <a href="mailto:support@illuminote.io" className={`inline-flex min-h-12 items-center gap-3 bg-Color-Neutral-Lighter px-6 py-3 text-sm ${focusClass}`}>Contact support <LandingIcon name="arrow" className="h-5 w-5" /></a>
            </div>
            <div className="min-w-0 flex-1 border-b border-Color-Scheme-1-Border">
              {faqs.map((faq) => (
                <details key={faq.question} className="group border-t border-Color-Scheme-1-Border py-5">
                  <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 [&::-webkit-details-marker]:hidden ${focusClass}`}>
                    <h3 className="min-w-0 font-display text-2xl font-medium leading-tight [overflow-wrap:anywhere] md:text-3xl">{faq.question}</h3>
                    <LandingIcon name="plus" className="h-6 w-6 transition-transform group-open:rotate-45 motion-reduce:transition-none" />
                  </summary>
                  <p className="pt-4 text-sm leading-6">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-black px-6 py-16 text-white md:px-16">
        <div className="mx-auto max-w-[1280px] space-y-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/" aria-label="DARCi home" className={`w-fit ${focusClass}`}><img src="/icons/navbar/darci_white.svg" alt="DARCi" className="h-5 w-auto" /></Link>
            <nav aria-label="Footer product navigation" className="flex flex-col items-start gap-2 text-sm">
              <p className="mb-2 text-white/60">Product</p>
              {[{label:"Features",href:"#features"},{label:"How it works",href:"#how-it-works"},{label:"Pricing",href:"#pricing"},{label:"Questions",href:"#questions"}].map(item => <a key={item.href} href={item.href} className={`inline-flex min-h-11 items-center hover:underline ${focusClass}`}>{item.label}</a>)}
            </nav>
            <div id="contact" className="flex min-w-0 scroll-mt-24 flex-col items-start gap-2 text-sm">
              <p className="mb-2 text-white/60">Get in touch</p>
              <a href="mailto:support@illuminote.io" className={`inline-flex min-h-11 items-center break-all hover:underline ${focusClass}`}>support@illuminote.io</a>
              <a href="mailto:incidentreports@illuminote.io" className={`inline-flex min-h-11 flex-col items-start justify-center gap-1 break-all hover:underline ${focusClass}`}><span className="text-xs text-white/60">Report an incident</span>incidentreports@illuminote.io</a>
              <Link href="/privacy" className={`inline-flex min-h-11 items-center underline underline-offset-4 ${focusClass}`}>Privacy Policy</Link>
            </div>
          </div>
          <p className="border-t border-white/20 pt-8 text-xs text-white/60">© {new Date().getFullYear()} DARCi. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

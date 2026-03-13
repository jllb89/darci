/* eslint-disable @next/next/no-img-element */

import AdvantageSection from "@/components/AdvantageSection";
import Navbar from "@/components/Navbar";

export default function Home() {
  return (
    <div className="w-full bg-Color-Neutral-Lightest text-Color-Scheme-1-Text">
      <div className="w-full">
        <Navbar />

        <div
          className="relative w-full bg-black/40 bg-cover bg-center px-6 py-24 md:px-24 md:py-48"
          style={{
            backgroundImage: "url('/images/hero/hero.webp')",
          }}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative mx-auto flex w-full max-w-[1280px] flex-col gap-16">
            <div className="flex flex-col gap-12 lg:flex-row lg:items-stretch lg:gap-20">
              <div className="flex-1 space-y-8">
                <div
                  className="font-display"
                  style={{
                    color: "#ffffff",
                    fontSize: "5.25rem",
                    fontStyle: "normal",
                    fontWeight: 400,
                    lineHeight: "120%",
                    letterSpacing: "-0.1575rem",
                  }}
                >
                  Notarization that moves at your speed
                </div>
                <div className="flex flex-wrap items-start gap-4">
                  <div
                    data-alternate="True"
                    data-icon-position="No icon"
                    data-small="False"
                    data-style="Primary"
                    className="flex items-center gap-2 bg-Green px-6 py-3"
                  >
                    <div className="text-Color-Neutral-Darkest text-sm font-medium font-sans leading-6">
                      Get started
                    </div>
                  </div>
                  <div
                    data-alternate="True"
                    data-icon-position="No icon"
                    data-small="False"
                    data-style="Secondary"
                    className="flex items-center gap-2 bg-white/20 px-6 py-3"
                  >
                    <div className="text-Color-White text-sm font-medium font-sans leading-6">
                      Learn more
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 flex flex-col justify-end">
                <div className="text-Color-White text-body-400">
                  DARCI combines in-person IPEN acknowledgment with fully digital
                  workflows. Create, sign, verify, and anchor documents without the
                  wait.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full bg-Color-Neutral-Lightest px-6 py-20 md:px-16 md:py-28">
          <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-20">
            <div className="flex flex-col gap-10 lg:flex-row lg:gap-20">
              <div className="flex-1 space-y-4">
                <div className="text-Color-Scheme-1-Text text-base font-regular font-sans leading-6">
                  Essentials
                </div>
                <div
                  className="text-Color-Scheme-1-Text text-4xl font-medium font-display leading-tight md:text-5xl md:leading-[62.4px]"
                  style={{ letterSpacing: "-0.1rem" }}
                >
                  The mechanics that make notarization work
                </div>
              </div>
              <div className="flex-1 text-Color-Scheme-1-Text text-body-400">
                DARCI strips away the friction. You get a notary&apos;s seal and a
                document that holds up in court, but without the waiting room and
                the paperwork shuffle.
              </div>
            </div>
            <div className="flex flex-col">
              <div className="flex flex-col border-t border-Color-Scheme-1-Border lg:flex-row">
                {[
                  {
                    title: "Minutes instead of days",
                    body: "Template to sealed document in one sitting",
                  },
                  {
                    title: "Send codes, not files",
                    body: "Recipients get secure access without email attachments",
                  },
                  {
                    title: "Verified by ID, checked anytime",
                    body: "Public endpoint confirms authenticity in seconds",
                  },
                  {
                    title: "In-person notary seals the record",
                    body: "Licensed notary confirms identity and intent",
                  },
                ].map((item, index) => (
                  <div
                    key={item.title}
                    className={`flex-1 border-Color-Scheme-1-Border px-4 py-8 ${
                      index < 3 ? "lg:border-r" : ""
                    }`}
                  >
                    <div className="flex flex-col gap-6">
                      <div className="relative h-12 w-12 overflow-hidden">
                        <div className="absolute left-[6px] top-[4px] h-10 w-9 bg-Color-Scheme-1-Text" />
                      </div>
                      <div className="flex flex-col gap-4">
                        <div className="text-Color-Scheme-1-Text text-2xl font-medium font-display leading-10 tracking-tight md:text-3xl">
                          {item.title}
                        </div>
                        <div className="text-Color-Scheme-1-Text text-base font-normal font-roboto leading-6">
                          {item.body}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div
                data-alternate="False"
                data-icon-position="Trailing"
                data-small="False"
                data-style="Link"
                className="flex items-center gap-2 overflow-hidden"
              >
                <div className="text-Color-Neutral-Darkest text-base font-medium font-sans leading-6">
                  start right now
                </div>
                <img
                  src="/icons/navbar/body/chevron-right.svg"
                  alt=""
                  className="h-3 w-3"
                />
              </div>
            </div>
          </div>
        </div>

        <div
          className="relative w-full bg-black/40 bg-cover bg-center px-6 py-20 md:px-16 md:py-28"
          style={{
            backgroundImage:
              "url('/images/cta/cta1.webp')",
          }}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative mx-auto flex w-full max-w-[1280px] flex-col gap-12 lg:flex-row lg:gap-20">
            <div className="flex-1">
              <div className="text-Color-White text-4xl font-medium font-display leading-tight md:text-5xl md:leading-[62.4px]">
                Ready to notarize faster?
              </div>
            </div>
            <div className="flex-1 space-y-8">
              <div className="text-Color-White text-base font-regular font-sans leading-6">
                Select one of our templates and see how DARCI moves at your speed.
              </div>
              <div className="flex flex-wrap items-start gap-4">
                <div
                  data-alternate="True"
                  data-icon-position="No icon"
                  data-small="False"
                  data-style="Primary"
                  className="flex items-center gap-2 bg-Color-White px-6 py-3 outline outline-1 outline-Color-White"
                >
                  <div className="text-Color-Neutral-Darkest text-sm font-medium font-sans leading-6">
                    Get started
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full bg-Color-Neutral-Lightest px-6 py-20 md:px-16 md:py-28">
          <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16">
            <div className="flex flex-col gap-10 lg:flex-row lg:gap-20">
              <div className="flex-1 space-y-6">
                <div className="text-Color-Scheme-1-Text text-base font-regular font-sans leading-6">
                  Workflow
                </div>
                <div className="text-Color-Scheme-1-Text text-4xl font-medium font-display leading-tight md:text-5xl md:leading-[62.4px]">
                  Moves that get you verified.
                </div>
              </div>
              <div className="flex-1 space-y-6">
                {[
                  {
                    title: "Choose your template or upload",
                    body: "Start from scratch or use what fits",
                  },
                  {
                    title: "DARCI generates your unique document ID",
                    body: "Your file gets ready for what comes next",
                  },
                  {
                    title: "Add your signature electronically",
                    body: "The notary needs this before they can proceed",
                  },
                  {
                    title: "Verification made public",
                    body:
                      "Your notarized document gets a unique ID that anyone can check anytime. No special access required, no middleman needed.",
                  },
                ].map((step, index) => (
                  <div key={step.title} className="flex gap-10">
                    <div className="flex flex-col items-center gap-4">
                      <div className="relative h-12 w-12 overflow-hidden">
                        <div className="absolute left-[6px] top-[4px] h-10 w-9 bg-Color-Scheme-1-Text" />
                      </div>
                      {index < 3 ? (
                        <div className="h-24 w-0 bg-Color-Scheme-1-Border outline outline-Color-Scheme-1-Border" />
                      ) : null}
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="text-Color-Scheme-1-Text text-xl font-medium font-display leading-8 tracking-tight">
                        {step.title}
                      </div>
                      <div className="text-Color-Scheme-1-Text text-sm font-regular font-sans leading-6">
                        {step.body}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <AdvantageSection />

        <div className="w-full bg-Color-Scheme-1-Background px-6 py-20 md:px-16 md:py-28">
          <div className="mx-auto flex w-full max-w-[1280px] items-center justify-center">
            <div className="w-full max-w-[768px] space-y-8 text-center">
              <div
                data-alternate="False"
                data-logo="2"
                className="relative mx-auto h-12 w-28 overflow-hidden"
              >
                <div className="absolute h-5 w-28 bg-Color-Scheme-1-Text" />
              </div>
              <div className="text-Color-Scheme-1-Text text-2xl font-medium font-display leading-10 tracking-tight md:text-3xl">
                &quot;DARCI cut our notarization time in half. My clients get verified
                documents the same day instead of waiting a week, and I&apos;m not exhausted
                by the end of my shift.&quot;
              </div>
              <div className="mx-auto flex w-72 flex-col items-center gap-4">
                <img className="h-16 w-16 rounded-full" src="https://placehold.co/64x64" alt="Sarah Mitchell" />
                <div className="text-Color-Scheme-1-Text text-base font-medium font-sans leading-6">
                  Sarah Mitchell
                </div>
                <div className="text-Color-Scheme-1-Text text-sm font-medium font-sans leading-6">
                  Notary public, California
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="relative w-full bg-black/40 bg-cover bg-center px-6 py-20 md:px-16 md:py-28"
          style={{
            backgroundImage:
              "url('https://placehold.co/1440x500/png?text=Notary+CTA')",
          }}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative mx-auto flex w-full max-w-[1280px] flex-col gap-12 lg:flex-row lg:gap-20">
            <div className="flex-1">
              <div className="text-Color-White text-4xl font-medium font-display leading-tight md:text-5xl md:leading-[62.4px]">
                Your notary work starts now
              </div>
            </div>
            <div className="flex-1 space-y-8">
              <div className="text-Color-White text-base font-medium font-sans leading-6">
                DARCI strips away the waiting. Sign up today and notarize your first
                document in minutes, not days. The legal weight stays the same. The
                speed doesn&apos;t.
              </div>
              <div className="flex items-start gap-4">
                <div
                  data-alternate="True"
                  data-icon-position="No icon"
                  data-small="False"
                  data-style="Primary"
                  className="flex items-center gap-2 bg-Green px-6 py-3 outline outline-1 outline-Green"
                >
                  <div className="text-Color-Neutral-Darkest text-sm font-medium font-sans leading-6">
                    Get started
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full bg-Color-Scheme-1-Background px-6 py-20 md:px-16 md:py-28">
          <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center gap-12">
            <div className="w-full max-w-[768px] space-y-6 text-center">
              <div className="text-Color-Scheme-1-Text text-base font-bold font-sans leading-6">
                Plans
              </div>
              <div className="text-Color-Scheme-1-Text text-4xl font-medium font-display leading-tight md:text-5xl md:leading-[62.4px]">
                Pick your tier
              </div>
              <div className="text-Color-Scheme-1-Text text-base font-medium font-sans leading-6">
                Choose monthly or yearly billing below
              </div>
            </div>
            <div className="inline-flex items-start bg-Color-Scheme-1-Text p-1 outline outline-1 outline-offset-[-1px] outline-Color-Scheme-1-Border/20">
              <div className="flex items-center gap-2 bg-Color-Scheme-1-Background px-6 py-2 outline outline-1 outline-offset-[-1px] outline-Color-Scheme-1-Border/20">
                <div className="text-Color-Scheme-1-Text text-sm font-medium font-sans leading-6">
                  Monthly
                </div>
              </div>
              <div className="flex items-center gap-2 px-6 py-2">
                <div className="text-Color-Scheme-1-Text text-sm font-medium font-sans leading-6">
                  Yearly
                </div>
              </div>
            </div>
            <div className="w-full space-y-12">
              <div className="flex flex-col border-b border-Color-Scheme-1-Border/20 lg:flex-row">
                <div className="hidden h-80 w-96 lg:block" />
                {[
                  { title: "Starter", price: "$79", note: "Per month", detail: "Best for individuals and small practices" },
                  { title: "Professional", price: "$299", note: "Per month", detail: "Built for growing notary operations." },
                  { title: "Enterprise", price: "Custom", note: "", detail: "For high-volume notarization needs and everything in between." },
                ].map((plan) => (
                  <div
                    key={plan.title}
                    className="flex-1 border-l border-Color-Scheme-1-Border/20 px-6 py-8"
                  >
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <div className="text-Color-Scheme-1-Text text-xl font-medium font-display leading-8 tracking-tight">
                          {plan.title}
                        </div>
                        <div>
                          <div className="text-Color-Scheme-1-Text text-6xl font-medium font-display leading-tight md:text-7xl">
                            {plan.price}
                          </div>
                          {plan.note ? (
                            <div className="text-Color-Scheme-1-Text text-base font-bold font-sans leading-6">
                              {plan.note}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-Color-Scheme-1-Text text-sm font-medium font-sans leading-6">
                          {plan.detail}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 bg-Color-Neutral-Darkest px-6 py-3 outline outline-1 outline-Color-Neutral-Darkest">
                          <div className="text-Color-White text-sm font-medium font-sans leading-6">
                            {plan.title === "Enterprise" ? "Contact us" : "Get started"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="w-full space-y-8">
              <div className="border-b border-Color-Scheme-1-Border/20 py-5">
                <div className="text-Color-Scheme-1-Text text-xl font-medium font-display leading-8 tracking-tight">
                  Notarizations
                </div>
              </div>
              <div className="space-y-0 border-b border-Color-Scheme-1-Border/20">
                {[
                  { label: "Monthly notarizations included", values: ["10", "100", "Unlimited"] },
                  { label: "Team members and seats", values: ["check", "check", "check"] },
                  { label: "Templates and customization", values: ["check", "check", "check"] },
                  { label: "Public verification endpoint", values: ["", "check", "check"] },
                  { label: "Priority support included", values: ["", "", "check"] },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="grid border-b border-Color-Scheme-1-Border/20 md:grid-cols-[1.4fr_repeat(3,1fr)]"
                  >
                    <div className="border-r border-Color-Scheme-1-Border/20 px-6 py-4">
                      <div className="text-Color-Scheme-1-Text text-sm font-medium font-sans leading-6">
                        {row.label}
                      </div>
                    </div>
                    {row.values.map((value, idx) => (
                      <div
                        key={`${row.label}-${idx}`}
                        className={`flex items-center justify-center border-Color-Scheme-1-Border/20 px-6 py-4 ${
                          idx < 2 ? "md:border-r" : ""
                        }`}
                      >
                        {value === "check" ? (
                          <div className="relative h-6 w-6 overflow-hidden">
                            <div className="absolute left-[4.06px] top-[6.3px] h-3 w-4 border border-Color-Scheme-1-Text bg-Color-Scheme-1-Text" />
                          </div>
                        ) : (
                          <div className="text-Color-Scheme-1-Text text-base font-medium font-sans leading-6">
                            {value}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="border-b border-Color-Scheme-1-Border/20 py-5">
                <div className="text-Color-Scheme-1-Text text-xl font-medium font-display leading-8 tracking-tight">
                  Compliance
                </div>
              </div>
              <div className="space-y-0 border-b border-Color-Scheme-1-Border/20">
                {[
                  { label: "Watermarking and sealing", values: ["Yes", "Yes", "Yes"] },
                  { label: "Ledger anchoring", values: ["check", "check", "check"] },
                  { label: "Cryptographic hashing", values: ["check", "check", "check"] },
                  { label: "Audit exports and reports", values: ["", "check", "check"] },
                  { label: "Dedicated account manager", values: ["", "", "check"] },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="grid border-b border-Color-Scheme-1-Border/20 md:grid-cols-[1.4fr_repeat(3,1fr)]"
                  >
                    <div className="border-r border-Color-Scheme-1-Border/20 px-6 py-4">
                      <div className="text-Color-Scheme-1-Text text-sm font-medium font-sans leading-6">
                        {row.label}
                      </div>
                    </div>
                    {row.values.map((value, idx) => (
                      <div
                        key={`${row.label}-${idx}`}
                        className={`flex items-center justify-center border-Color-Scheme-1-Border/20 px-6 py-4 ${
                          idx < 2 ? "md:border-r" : ""
                        }`}
                      >
                        {value === "check" ? (
                          <div className="relative h-6 w-6 overflow-hidden">
                            <div className="absolute left-[4.06px] top-[6.3px] h-3 w-4 border border-Color-Scheme-1-Text bg-Color-Scheme-1-Text" />
                          </div>
                        ) : (
                          <div className="text-Color-Scheme-1-Text text-base font-medium font-sans leading-6">
                            {value}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="border-b border-Color-Scheme-1-Border/20 py-5">
                <div className="text-Color-Scheme-1-Text text-xl font-medium font-display leading-8 tracking-tight">
                  Support
                </div>
              </div>
              <div className="space-y-0 border-b border-Color-Scheme-1-Border/20">
                {[
                  { label: "Email support", values: ["Yes", "Yes", "Yes"] },
                  { label: "Phone support available", values: ["check", "check", "check"] },
                  { label: "Monthly notarizations included", values: ["check", "check", "check"] },
                  { label: "Team members and seats", values: ["", "check", "check"] },
                  { label: "Templates and customization", values: ["", "", "check"] },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="grid border-b border-Color-Scheme-1-Border/20 md:grid-cols-[1.4fr_repeat(3,1fr)]"
                  >
                    <div className="border-r border-Color-Scheme-1-Border/20 px-6 py-4">
                      <div className="text-Color-Scheme-1-Text text-sm font-medium font-sans leading-6">
                        {row.label}
                      </div>
                    </div>
                    {row.values.map((value, idx) => (
                      <div
                        key={`${row.label}-${idx}`}
                        className={`flex items-center justify-center border-Color-Scheme-1-Border/20 px-6 py-4 ${
                          idx < 2 ? "md:border-r" : ""
                        }`}
                      >
                        {value === "check" ? (
                          <div className="relative h-6 w-6 overflow-hidden">
                            <div className="absolute left-[4.06px] top-[6.3px] h-3 w-4 border border-Color-Scheme-1-Text bg-Color-Scheme-1-Text" />
                          </div>
                        ) : (
                          <div className="text-Color-Scheme-1-Text text-base font-medium font-sans leading-6">
                            {value}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div
          className="relative w-full bg-black/40 bg-cover bg-center px-6 py-20 md:px-16 md:py-28"
          style={{
            backgroundImage:
              "url('https://placehold.co/1440x500/png?text=Move+Faster')",
          }}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative mx-auto flex w-full max-w-[1280px] flex-col gap-12 lg:flex-row lg:gap-20">
            <div className="flex-1">
              <div className="text-Color-White text-4xl font-medium font-display leading-tight md:text-5xl md:leading-[62.4px]">
                Move faster without compromise
              </div>
            </div>
            <div className="flex-1 space-y-8">
              <div className="text-Color-White text-base font-medium font-sans leading-6">
                DARCI handles the heavy lifting so you can focus on what matters.
                Start notarizing today and feel the difference speed and security
                make.
              </div>
              <div className="flex items-start gap-4">
                <div
                  data-alternate="True"
                  data-icon-position="No icon"
                  data-small="False"
                  data-style="Primary"
                  className="flex items-center gap-2 bg-Green px-6 py-3 outline outline-1 outline-Green"
                >
                  <div className="text-Color-Neutral-Darkest text-sm font-medium font-sans leading-6">
                    Get started
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full bg-Color-Scheme-1-Background px-6 py-20 md:px-16 md:py-28">
          <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center gap-10 text-center">
            <div className="space-y-6">
              <div className="text-Color-Scheme-1-Text text-4xl font-medium font-display leading-tight md:text-5xl md:leading-[62.4px]">
                Stay ahead
              </div>
              <div className="text-Color-Scheme-1-Text text-4xl font-medium font-display leading-tight md:text-5xl md:leading-[62.4px]">
                in digital notarization
              </div>
              <div className="text-Color-Scheme-1-Text text-base font-medium font-sans leading-6">
                Get updates on new features and notarization insights delivered to
                your inbox
              </div>
            </div>
            <div className="w-full max-w-[520px] space-y-3">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex-1 p-3 outline outline-1 outline-Color-Neutral-Darkest">
                  <input
                    className="w-full bg-transparent text-sm font-medium font-sans leading-6 text-black/60 outline-none"
                    placeholder="Enter your email"
                    type="email"
                  />
                </div>
                <div className="flex items-center gap-2 bg-Color-Neutral-Darkest px-6 py-3 outline outline-1 outline-Color-Neutral-Darkest">
                  <div className="text-Color-White text-sm font-medium font-sans leading-6">
                    Subscribe
                  </div>
                </div>
              </div>
              <div className="text-Color-Scheme-1-Text text-xs font-medium font-sans leading-5">
                By subscribing you agree to our terms and privacy policy
              </div>
            </div>
          </div>
        </div>

        <div className="w-full bg-Color-Scheme-1-Background px-6 py-20 md:px-16 md:py-28">
          <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 lg:flex-row lg:gap-20">
            <div className="w-full max-w-[500px] space-y-8">
              <div className="space-y-6">
                <div className="text-Color-Scheme-1-Text text-4xl font-medium font-display leading-tight md:text-5xl md:leading-[62.4px]">
                  Questions
                </div>
                <div className="text-Color-Scheme-1-Text text-base font-medium font-sans leading-6">
                  Find answers about DARCI, notarization, and how our platform works
                </div>
              </div>
              <div>
                <div
                  data-alternate="False"
                  data-icon-position="No icon"
                  data-small="False"
                  data-style="Secondary"
                  className="flex items-center gap-2 bg-Color-Neutral-Lighter px-6 py-3"
                >
                  <div className="text-Color-Neutral-Darkest text-sm font-medium font-sans leading-6">
                    Contact us
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 border-b border-Color-Scheme-1-Border/20">
              {[
                {
                  question: "What is IPEN acknowledgment?",
                  answer:
                    "IPEN is in-person electronic notarization. It combines face-to-face verification with digital workflows, giving you the legal rigor of traditional notarization without the delays. You meet with a notary to confirm identity and intent, then the process moves entirely digital from there.",
                },
                {
                  question: "How does ledger anchoring work?",
                  answer:
                    "After notarization, DARCI cryptographically hashes your document and anchors it to a distributed ledger. This creates permanent, verifiable proof of authenticity. Anyone can check the public verification endpoint anytime to confirm your document hasn't been altered.",
                },
                {
                  question: "Is DARCI legally compliant?",
                  answer:
                    "Yes. DARCI meets all legal standards for digital notarization and document verification. We handle IDN assignment, watermarking, sealing, and hashing to ensure compliance at every step. Your documents hold the same legal weight as traditional notarized records.",
                },
                {
                  question: "How long does notarization take?",
                  answer:
                    "The in-person acknowledgment takes minutes. Once you meet with a notary, the digital workflow completes in seconds. Most documents are fully verified and anchored within hours, not days.",
                },
                {
                  question: "Can anyone verify my documents?",
                  answer:
                    "Yes. DARCI includes a public verification endpoint. Anyone with your document can check its authenticity anytime. This gives your clients and partners confidence without requiring them to contact you or use special software.",
                },
              ].map((faq) => (
                <div key={faq.question} className="border-t border-Color-Scheme-1-Border/20 py-5">
                  <div className="flex items-center gap-6">
                    <div className="flex-1 text-Color-Scheme-1-Text text-3xl font-medium font-display leading-tight md:text-4xl md:leading-[50.4px]">
                      {faq.question}
                    </div>
                    <div className="relative h-8 w-8 overflow-hidden">
                      <div className="absolute left-[8.3px] top-[10.94px] h-2 w-4 border border-Color-Scheme-1-Text bg-Color-Scheme-1-Text" />
                    </div>
                  </div>
                  <div className="pb-6 pt-4">
                    <div className="text-Color-Scheme-1-Text text-sm font-medium font-sans leading-6">
                      {faq.answer}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="w-full bg-Color-Neutral-Darkest px-6 py-20 md:px-16">
          <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-20">
            <div className="flex flex-col gap-12 lg:flex-row lg:gap-32">
              <div className="flex-1" />
              <div className="flex flex-1 flex-col gap-4">
                <div className="text-Color-Scheme-2-Text text-base font-medium font-sans leading-6">
                  Product
                </div>
                {[
                  "Features",
                  "How it works",
                  "Pricing",
                  "Security",
                  "Company",
                ].map((item) => (
                  <div key={item} className="text-Color-Scheme-2-Text text-sm font-medium font-sans leading-6">
                    {item}
                  </div>
                ))}
              </div>
              <div className="flex flex-1 flex-col gap-4">
                <div className="text-Color-Scheme-2-Text text-base font-medium font-sans leading-6">
                  About
                </div>
                {[
                  "Blog",
                  "Contact",
                ].map((item) => (
                  <div key={item} className="text-Color-Scheme-2-Text text-sm font-medium font-sans leading-6">
                    {item}
                  </div>
                ))}
              </div>
              <div className="flex flex-1 flex-col gap-4">
                <div className="text-Color-Scheme-2-Text text-base font-medium font-sans leading-6">
                  Guides
                </div>
                {[
                  "Support",
                  "Legal",
                ].map((item) => (
                  <div key={item} className="text-Color-Scheme-2-Text text-sm font-medium font-sans leading-6">
                    {item}
                  </div>
                ))}
              </div>
              <div className="w-full max-w-sm space-y-6">
                <div className="space-y-4">
                  <div className="text-Color-Scheme-2-Text text-base font-medium font-sans leading-6">
                    Updates
                  </div>
                  <div className="text-Color-Scheme-2-Text text-sm font-medium font-sans leading-6">
                    Get notified when we release new features and improvements.
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <div className="flex-1 bg-Color-Neutral-Darker p-3">
                      <div className="text-Color-Neutral text-sm font-medium font-sans leading-6">
                        your@email.com
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-Color-Neutral-Darker px-6 py-3">
                      <div className="text-Color-White text-sm font-medium font-sans leading-6">
                        Subscribe
                      </div>
                    </div>
                  </div>
                  <div className="text-Color-Scheme-2-Text text-xs font-medium font-sans leading-5">
                    By subscribing you agree to our Privacy Policy and consent to
                    receive updates from DARCI.
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-8">
              <div className="h-px w-full outline outline-1 outline-offset-[-0.5px] outline-Color-Scheme-1-Border/20" />
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-6 text-Color-Scheme-2-Text text-sm font-medium font-sans leading-6 lg:flex-row">
                  <span>© 2024 DARCI. All rights reserved.</span>
                  <div className="flex flex-wrap gap-6">
                    <span className="underline">Privacy Policy</span>
                    <span className="underline">Terms of Service</span>
                    <span className="underline">Cookie Settings</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  {[1, 2, 3, 4, 5].map((item) => (
                    <div key={item} className="relative h-6 w-6 overflow-hidden">
                      <div className="absolute left-[2px] top-[2.24px] h-5 w-5 bg-Color-Scheme-2-Text" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

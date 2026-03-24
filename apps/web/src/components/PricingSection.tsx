"use client";

import { useState } from "react";

export default function PricingSection() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  const plans = [
    {
      title: "Starter",
      price: billing === "monthly" ? "$79" : "$790",
      note: billing === "monthly" ? "Per month" : "Per year",
      detail: "Best for individuals and small practices",
    },
    {
      title: "Professional",
      price: billing === "monthly" ? "$299" : "$2,990",
      note: billing === "monthly" ? "Per month" : "Per year",
      detail: "Built for growing notary operations.",
    },
    {
      title: "Enterprise",
      price: "Custom",
      note: "",
      detail: "For high-volume notarization needs and everything in between.",
    },
  ];
  return (
    <section className="w-full bg-Color-Scheme-1-Background px-6 py-20 md:px-16 md:py-28">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center gap-12">
        <div className="w-full max-w-[768px] space-y-6 text-center">
          <div className="text-Color-Scheme-1-Text text-base font-regular font-sans leading-6">
            Plans
          </div>
          <div className="text-Color-Scheme-1-Text text-4xl font-medium font-display leading-tight md:text-5xl md:leading-[62.4px]">
            Pick your tier
          </div>
          <div className="text-Color-Scheme-1-Text text-base font-regular font-sans leading-6">
            Choose monthly or yearly billing below
          </div>
        </div>
        <div className="inline-flex items-start bg-Color-Scheme-1-Foreground p-1 outline outline-1 outline-offset-[-1px] outline-Color-Scheme-1-Border/40">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={`flex items-center gap-2 px-6 py-2 outline outline-1 outline-offset-[-1px] outline-Color-Scheme-1-Border/40 ${
              billing === "monthly"
                ? "bg-Green"
                : "bg-Color-Scheme-1-Foreground"
            }`}
          >
            <div className="text-Color-Scheme-1-Text text-sm font-medium font-sans leading-6">
              Monthly
            </div>
          </button>
          <button
            type="button"
            onClick={() => setBilling("yearly")}
            className={`flex items-center gap-2 px-6 py-2 ${
              billing === "yearly"
                ? "bg-Green outline outline-1 outline-offset-[-1px] outline-Color-Scheme-1-Border/40"
                : "bg-Color-Scheme-1-Foreground"
            }`}
          >
            <div className="text-Color-Scheme-1-Text text-sm font-medium font-sans leading-6">
              Yearly
            </div>
          </button>
        </div>
        <div className="w-full space-y-12">
          <div className="flex flex-col border-b border-Color-Scheme-1-Border/40 lg:flex-row">
            <div className="hidden h-80 w-96 lg:block" />
            {plans.map((plan) => (
              <div
                key={plan.title}
                className="flex-1 border-l border-Color-Scheme-1-Border/40 px-6 py-8"
              >
                <div className="flex h-full flex-col justify-between gap-8">
                  <div className="space-y-4">
                    <div className="text-Color-Scheme-1-Text text-xl font-regular font-display leading-8 tracking-tight">
                      {plan.title}
                    </div>
                    <div>
                      <div className="text-Color-Scheme-1-Text text-6xl font-medium font-display leading-tight md:text-7xl">
                        {plan.price}
                      </div>
                      {plan.note ? (
                        <div className="text-Color-Scheme-1-Text text-base font-regular font-sans leading-6">
                          {plan.note}
                        </div>
                      ) : null}
                    </div>
                    <div className="text-Color-Scheme-1-Text text-sm font-regular font-sans leading-6">
                      {plan.detail}
                    </div>
                  </div>
                  <div>
                    <div className="flex h-11 items-center justify-center gap-2 bg-Color-Neutral-Darkest px-6 outline outline-1 outline-Color-Neutral-Darkest">
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
          <div className="border-b border-Color-Scheme-1-Border/40 py-5">
            <div className="text-Color-Scheme-1-Text text-xl font-medium font-display leading-8 tracking-tight">
              Notarizations
            </div>
          </div>
          <div className="space-y-0 border-b border-Color-Scheme-1-Border/40">
            {[
              { label: "Signer invite links", values: ["check", "check", "check"] },
              { label: "Multi-signer workflows", values: ["", "check", "check"] },
              { label: "Real-time status updates", values: ["check", "check", "check"] },
              { label: "Notary session scheduling", values: ["", "check", "check"] },
              { label: "Document storage retention", values: ["90 days", "1 year", "Unlimited"] },
            ].map((row) => (
              <div
                key={row.label}
                className="grid border-b border-Color-Scheme-1-Border/40 md:grid-cols-[1.4fr_repeat(3,1fr)]"
              >
                <div className="border-r border-Color-Scheme-1-Border/40 px-6 py-4">
                  <div className="text-Color-Scheme-1-Text text-sm font-medium font-sans leading-6">
                    {row.label}
                  </div>
                </div>
                {row.values.map((value, idx) => (
                  <div
                    key={`${row.label}-${idx}`}
                    className={`flex items-center justify-center border-Color-Scheme-1-Border/40 px-6 py-4 ${
                      idx < 2 ? "md:border-r" : ""
                    }`}
                  >
                    {value === "check" ? (
                      <img
                        src="/icons/pricing/check.svg"
                        alt=""
                        className="h-5 w-5"
                      />
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

          <div className="border-b border-Color-Scheme-1-Border/40 py-5">
            <div className="text-Color-Scheme-1-Text text-xl font-medium font-display leading-8 tracking-tight">
              Compliance
            </div>
          </div>
          <div className="space-y-0 border-b border-Color-Scheme-1-Border/40">
            {[
              { label: "Watermarking and sealing", values: ["Yes", "Yes", "Yes"] },
              { label: "Ledger anchoring", values: ["check", "check", "check"] },
              { label: "Cryptographic hashing", values: ["check", "check", "check"] },
              { label: "Tamper-evident seal", values: ["check", "check", "check"] },
              { label: "ID verification logs", values: ["", "check", "check"] },
            ].map((row) => (
              <div
                key={row.label}
                className="grid border-b border-Color-Scheme-1-Border/40 md:grid-cols-[1.4fr_repeat(3,1fr)]"
              >
                <div className="border-r border-Color-Scheme-1-Border/40 px-6 py-4">
                  <div className="text-Color-Scheme-1-Text text-sm font-medium font-sans leading-6">
                    {row.label}
                  </div>
                </div>
                {row.values.map((value, idx) => (
                  <div
                    key={`${row.label}-${idx}`}
                    className={`flex items-center justify-center border-Color-Scheme-1-Border/40 px-6 py-4 ${
                      idx < 2 ? "md:border-r" : ""
                    }`}
                  >
                    {value === "check" ? (
                      <img
                        src="/icons/pricing/check.svg"
                        alt=""
                        className="h-5 w-5"
                      />
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

          <div className="border-b border-Color-Scheme-1-Border/40 py-5">
            <div className="text-Color-Scheme-1-Text text-xl font-medium font-display leading-8 tracking-tight">
              Support
            </div>
          </div>
          <div className="space-y-0 border-b border-Color-Scheme-1-Border/40">
            {[
              { label: "Email support", values: ["Yes", "Yes", "Yes"] },
              { label: "Phone support available", values: ["check", "check", "check"] },
              { label: "Onboarding assistance", values: ["", "check", "check"] },
              { label: "Training resources", values: ["check", "check", "check"] },
              { label: "Response time SLA", values: ["", "", "check"] },
            ].map((row) => (
              <div
                key={row.label}
                className="grid border-b border-Color-Scheme-1-Border/40 md:grid-cols-[1.4fr_repeat(3,1fr)]"
              >
                <div className="border-r border-Color-Scheme-1-Border/40 px-6 py-4">
                  <div className="text-Color-Scheme-1-Text text-sm font-medium font-sans leading-6">
                    {row.label}
                  </div>
                </div>
                {row.values.map((value, idx) => (
                  <div
                    key={`${row.label}-${idx}`}
                    className={`flex items-center justify-center border-Color-Scheme-1-Border/40 px-6 py-4 ${
                      idx < 2 ? "md:border-r" : ""
                    }`}
                  >
                    {value === "check" ? (
                      <img
                        src="/icons/pricing/check.svg"
                        alt=""
                        className="h-5 w-5"
                      />
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
    </section>
  );
}

"use client";

import { useState } from "react";

const advantageItems = [
  {
    index: "01",
    label: "Notarize",
    title: "In hours, not days",
    description:
      "Members get documents notarized in hours instead of days. Notaries handle more work without burning out.",
    image: "/images/advantages/a1.webp",
  },
  {
    index: "02",
    label: "Verify",
    title: "Anytime, anywhere",
    description:
      "Every step meets legal standards. Watermarking, sealing, hashing, and ledger anchoring happen automatically so compliance is never a question.",
    image: "/images/advantages/a2.webp",
  },
  {
    index: "03",
    label: "Anchor",
    title: "Proof that lasts",
    description:
      "Members complete notarization faster. Notaries handle more volume without exhaustion. The work moves at a pace that feels natural, not rushed.",
    image: "/images/advantages/a3.webp",
  },
  {
    index: "04",
    label: "Comply",
    title: "Standards built in",
    description:
      "Watermarking, sealing, hashing, and ledger anchoring happen automatically. Compliance isn't something you chase—it's something you get.",
    image: "/images/advantages/a4.webp",
  },
];

export default function AdvantageSection() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <section className="w-full bg-Green px-6 py-20 md:px-16 md:py-28">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16">
        <div className="w-full max-w-[768px] space-y-6">
          <div className="text-Color-Scheme-1-Text text-base font-regular font-sans leading-6">
            Advantage
          </div>
          <div className="text-Color-Scheme-1-Text text-4xl font-medium font-display leading-tight md:text-5xl md:leading-[62.4px]">
            Why DARCi wins
          </div>
          <div className="text-Color-Scheme-1-Text text-base font-medium font-sans leading-6">
            Speed without sacrificing legal rigor
          </div>
        </div>
        <div className="flex min-h-[800px] flex-col overflow-hidden  lg:h-[620px] lg:flex-row">
          {advantageItems.map((item, idx) => {
            const isOpen = activeIndex === idx;

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => setActiveIndex(idx)}
                onPointerEnter={() => setActiveIndex(idx)}
                onFocus={() => setActiveIndex(idx)}
                onPointerDown={() => setActiveIndex(idx)}
                className={`flex w-full min-w-0 items-stretch bg-Green-Secondary text-left transition-[flex] duration-700 lg:h-full lg:w-auto ${
                  idx < advantageItems.length - 1
                    ? "lg:border-r lg:border-Color-Neutral-Darker/40"
                    : ""
                }`}
                style={{
                  flex: isOpen ? "3.6 1 0%" : "0.25 1 0%",
                }}
              >
                <div className="flex h-full w-14 flex-col justify-between px-10 py-6">
                  <div className="-ml-4 text-Color-Scheme-1-Text text-3xl font-medium font-display tracking-tight">
                    {item.index}
                  </div>
                  <div className="-rotate-90 origin-left text-Color-Scheme-1-Text pl-2 text-3xl font-medium font-display leading-10 tracking-tight">
                    {item.label}
                  </div>
                </div>
                <div
                  className={`flex flex-1 flex-col gap-8 px-10 py-10 text-left transition-opacity duration-200 ease-in-out ${
                    isOpen ? "opacity-100" : "pointer-events-none opacity-0"
                  }`}
                  style={{ transitionDelay: isOpen ? "300ms" : "0ms" }}
                  aria-hidden={!isOpen}
                >
                  <div className="max-w-[520px] space-y-6">
                    <div className="text-Color-Scheme-1-Text text-4xl font-medium font-display leading-[52.8px] tracking-wide md:text-5xl">
                      {item.title}
                    </div>
                    <div className="text-Color-Scheme-1-Text text-sm font-regular font-sans leading-6">
                      {item.description}
                    </div>
                  </div>
                  <div className="max-w-[720px] h-116 w-full overflow-hidden">
                    <img
                      className="h-full w-full object-cover object-top"
                      src={item.image}
                      alt={item.title}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

type ProcessStep = {
  title: string;
  body: string;
};

const PROCESS_STEPS: ProcessStep[] = [
  {
    title: "1. Create",
    body: "Enter your information to generate your document.",
  },
  {
    title: "2. Review",
    body: "Check your details and preview your document before signing.",
  },
  {
    title: "3. Sign",
    body: "Sign your document electronically.",
  },
  {
    title: "4. Verify",
    body: "A notary confirms your identity and finalizes the document.",
  },
  {
    title: "5. Secure",
    body: "Your document is sealed and available for verification anytime.",
  },
];

type ProcessBandProps = {
  currentStep?: number;
};

type FixedGeometry = {
  left: number;
  top: number;
  width: number;
};

export default function ProcessBand({ currentStep = 1 }: ProcessBandProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const bandRef = useRef<HTMLDivElement | null>(null);
  const [isCompact, setIsCompact] = useState(false);
  const [fixedGeometry, setFixedGeometry] = useState<FixedGeometry | null>(null);
  const [bandHeight, setBandHeight] = useState(0);
  const [expandedBandHeight, setExpandedBandHeight] = useState(0);

  const safeCurrentStep = Math.min(
    Math.max(Math.round(currentStep), 1),
    PROCESS_STEPS.length,
  );
  const progressLineWidth = (safeCurrentStep / PROCESS_STEPS.length) * 100;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const nearestScrollRoot = sentinel.closest("main");

    const updateCompactState = () => {
      const rootTop =
        nearestScrollRoot instanceof HTMLElement
          ? nearestScrollRoot.getBoundingClientRect().top
          : 0;
      const sentinelTop = sentinel.getBoundingClientRect().top;

      setIsCompact((current) => {
        if (sentinelTop <= rootTop + 0.5) {
          return true;
        }

        if (sentinelTop >= rootTop + 2) {
          return false;
        }

        return current;
      });
    };

    updateCompactState();

    const scrollTarget =
      nearestScrollRoot instanceof HTMLElement ? nearestScrollRoot : window;

    scrollTarget.addEventListener("scroll", updateCompactState, { passive: true });
    window.addEventListener("resize", updateCompactState);

    return () => {
      scrollTarget.removeEventListener("scroll", updateCompactState);
      window.removeEventListener("resize", updateCompactState);
    };
  }, []);

  useEffect(() => {
    const host = sentinelRef.current?.parentElement;
    if (!host) {
      return;
    }

    const updateGeometry = () => {
      const rect = host.getBoundingClientRect();
      const topbarElement = document.querySelector("[data-app-topbar]");
      const topbarBottom =
        topbarElement instanceof HTMLElement
          ? topbarElement.getBoundingClientRect().bottom
          : 0;

      setFixedGeometry({
        left: rect.left,
        top: topbarBottom,
        width: rect.width,
      });
    };

    updateGeometry();

    if (!isCompact) {
      return;
    }

    window.addEventListener("resize", updateGeometry);

    return () => {
      window.removeEventListener("resize", updateGeometry);
    };
  }, [isCompact]);

  useEffect(() => {
    const bandElement = bandRef.current;
    if (!bandElement) {
      return;
    }

    const updateBandHeight = () => {
      const nextHeight = bandElement.getBoundingClientRect().height;
      setBandHeight(nextHeight);

      if (!isCompact) {
        setExpandedBandHeight(nextHeight);
      }
    };

    updateBandHeight();

    const observer = new ResizeObserver(() => {
      updateBandHeight();
    });

    observer.observe(bandElement);

    return () => {
      observer.disconnect();
    };
  }, [isCompact]);

  const isFixed = isCompact && fixedGeometry !== null;
  const reservedExpandedHeight = expandedBandHeight > 0 ? expandedBandHeight : bandHeight;

  return (
    <div>
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />
      <div aria-hidden style={{ height: isFixed ? reservedExpandedHeight : 0 }} />
      <div
        ref={bandRef}
          className={`z-20 transition-all duration-500 ease-in-out ${
          isCompact
            ? "border-b border-Color-Scheme-1-Border/60 bg-Color-Neutral-Lightest/95 backdrop-blur-sm"
            : ""
        }`}
        style={
          isFixed
            ? {
                left: fixedGeometry.left,
                position: "fixed",
                top: fixedGeometry.top,
                width: fixedGeometry.width,
                zIndex: 40,
              }
            : undefined
        }
      >
        <div
          className={`relative flex flex-col border-Color-Scheme-1-Border lg:flex-row lg:border-l lg:border-r ${
            isCompact ? "" : "border-t"
          }`}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px]">
            <div
              className="h-full bg-Color-Scheme-1-Text transition-[width] duration-700 ease-in-out"
              style={{ width: `${progressLineWidth}%` }}
            />
          </div>
          {PROCESS_STEPS.map((item, index) => {
            const stepNumber = index + 1;
            const isActive = stepNumber === safeCurrentStep;

            return (
              <div
                key={item.title}
                  className={`flex-1 border-Color-Scheme-1-Border transition-all duration-500 ease-in-out ${
                  isCompact ? "px-3 py-3" : "px-4 py-8"
                } ${
                  index < PROCESS_STEPS.length - 1 ? "border-b lg:border-b-0 lg:border-r" : ""
                } ${
                  isActive
                    ? "border-t-2 border-t-Color-Scheme-1-Text bg-Color-Neutral-Lightest"
                    : "border-t-2 border-t-transparent"
                }`}
              >
                <div
                  className="flex h-full flex-col gap-2"
                >
                  <div
                    className={`relative h-12 w-12 shrink-0 origin-top overflow-hidden transition-[opacity,max-height,transform] duration-500 ease-in-out ${
                      isCompact
                        ? "max-h-0 -translate-y-1 opacity-0 pointer-events-none"
                        : "max-h-12 translate-y-0 opacity-100"
                    }`}
                  >
                    <div
                      className={`absolute left-[6px] top-[4px] h-10 w-9 ${
                        isActive ? "bg-Color-Scheme-1-Text" : "bg-Color-Neutral-Lighter"
                      }`}
                    />
                  </div>
                  <div
                    className="flex flex-col overflow-hidden"
                  >
                    <div
                      className={`font-display font-medium leading-tight tracking-tight transition-all duration-500 ease-in-out ${
                        isCompact ? "text-sm md:text-[15px]" : "text-base md:text-lg"
                      } ${
                        isActive ? "text-Color-Scheme-1-Text" : "text-Color-Neutral"
                      }`}
                    >
                      {item.title}
                    </div>
                    <div
                      className={`overflow-hidden font-roboto font-normal leading-5 transition-[max-height,opacity,margin-top,font-size] duration-500 ease-in-out ${
                        isCompact
                          ? "mt-0 max-h-0 text-xs opacity-0"
                          : "mt-3 max-h-24 text-sm opacity-100"
                      } ${
                        isActive ? "text-Color-Scheme-1-Text" : "text-Color-Neutral"
                      }`}
                    >
                      {item.body}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
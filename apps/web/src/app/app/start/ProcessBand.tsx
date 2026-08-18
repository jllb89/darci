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
  forceCompact?: boolean;
  hideOnSmallScreens?: boolean;
};

const COMPACT_TRANSITION_DURATION_MS = 760;
const PROCESS_BAND_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const STICKY_TOP_COMPENSATION_PX = 64;
const STICKY_CONTENT_GAP_PX = 24;

export default function ProcessBand({ currentStep = 1, forceCompact = false, hideOnSmallScreens = false }: ProcessBandProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const bandRef = useRef<HTMLDivElement | null>(null);
  const isCompactRef = useRef(forceCompact);
  const expandedBandHeightRef = useRef(0);
  const [isCompact, setIsCompact] = useState(false);
  const effectiveIsCompact = forceCompact || isCompact;

  const safeCurrentStep = Math.min(
    Math.max(Math.round(currentStep), 1),
    PROCESS_STEPS.length,
  );
  const progressLineWidth = (safeCurrentStep / PROCESS_STEPS.length) * 100;

  useEffect(() => {
    isCompactRef.current = effectiveIsCompact;
  }, [effectiveIsCompact]);

  useEffect(() => {
    const band = bandRef.current;
    if (!band) {
      return;
    }

    const updateExpandedHeight = () => {
      if (isCompactRef.current) {
        return;
      }

      expandedBandHeightRef.current = band.getBoundingClientRect().height;
    };

    updateExpandedHeight();

    const observer = new ResizeObserver(() => {
      updateExpandedHeight();
    });

    observer.observe(band);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const band = bandRef.current;
    if (!band) {
      return;
    }

    const nearestScrollRoot = band.closest("main");
    const stickyMetricTarget =
      nearestScrollRoot instanceof HTMLElement ? nearestScrollRoot : document.documentElement;

    const updateStickyMetrics = () => {
      const bandHeight = band.getBoundingClientRect().height;
      const followOffset = Math.max(
        STICKY_CONTENT_GAP_PX,
        bandHeight - STICKY_TOP_COMPENSATION_PX + STICKY_CONTENT_GAP_PX,
      );

      stickyMetricTarget.style.setProperty("--darci-process-band-height", `${bandHeight}px`);
      stickyMetricTarget.style.setProperty(
        "--darci-process-band-follow-offset",
        `${followOffset}px`,
      );
    };

    updateStickyMetrics();

    const observer = new ResizeObserver(() => {
      updateStickyMetrics();
    });

    observer.observe(band);
    window.addEventListener("resize", updateStickyMetrics);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateStickyMetrics);
      stickyMetricTarget.style.removeProperty("--darci-process-band-height");
      stickyMetricTarget.style.removeProperty("--darci-process-band-follow-offset");
    };
  }, []);

  useEffect(() => {
    if (forceCompact) {
      return;
    }

    const bandRoot = sentinelRef.current;
    const stickyHost = bandRoot?.parentElement;
    const sentinel = stickyHost?.previousElementSibling;

    if (!(sentinel instanceof HTMLDivElement)) {
      return;
    }

    const nearestScrollRoot = sentinel.closest("main");

    const updateCompactState = () => {
      const rootTop =
        nearestScrollRoot instanceof HTMLElement
          ? nearestScrollRoot.getBoundingClientRect().top
          : 0;
      const sentinelTop = sentinel.getBoundingClientRect().top;
      const collapseThreshold = rootTop - STICKY_TOP_COMPENSATION_PX - 1;
      const expandThreshold =
        rootTop +
        Math.max(expandedBandHeightRef.current - STICKY_TOP_COMPENSATION_PX, 0);

      if (!isCompactRef.current && sentinelTop <= collapseThreshold) {
        setIsCompact(true);
        isCompactRef.current = true;
        return;
      }

      if (isCompactRef.current && sentinelTop >= expandThreshold) {
        setIsCompact(false);
        isCompactRef.current = false;
      }
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
  }, [forceCompact]);

  return (
    <div
      ref={sentinelRef}
      className={`relative z-[900] -mx-6 md:-mx-10 ${hideOnSmallScreens ? "max-[900px]:hidden [@media(max-height:720px)]:hidden" : ""}`}
    >
      <div
        ref={bandRef}
        className={`relative isolate z-[910] transition-[background-color,box-shadow,border-radius] ${
          effectiveIsCompact
            ? "bg-Color-Neutral-Lightest shadow-[0_8px_20px_rgba(0,0,0,0.08)] backdrop-blur-sm"
            : ""
        }`}
        style={{
          transitionDuration: `${COMPACT_TRANSITION_DURATION_MS}ms`,
          transitionTimingFunction: PROCESS_BAND_EASING,
        }}
      >
        <div
          className={`relative flex flex-col border-Color-Scheme-1-Border lg:flex-row ${
            effectiveIsCompact ? "" : "border-t"
          }`}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px]">
            <div
              className="h-full bg-Color-Scheme-1-Text transition-[width]"
              style={{
                width: `${progressLineWidth}%`,
                transitionDuration: `${COMPACT_TRANSITION_DURATION_MS + 80}ms`,
                transitionTimingFunction: PROCESS_BAND_EASING,
              }}
            />
          </div>
          {PROCESS_STEPS.map((item, index) => {
            const stepNumber = index + 1;
            const isActive = stepNumber === safeCurrentStep;

            return (
              <div
                key={item.title}
                className={`flex-1 border-Color-Scheme-1-Border transition-[padding,border-color,background-color] ${
                  effectiveIsCompact ? "px-3 py-3" : "px-4 py-8"
                } ${
                  index < PROCESS_STEPS.length - 1 ? "border-b lg:border-b-0 lg:border-r" : ""
                } ${
                  isActive
                    ? "border-t-2 border-t-Color-Scheme-1-Text bg-Color-Neutral-Lightest"
                    : "border-t-2 border-t-transparent"
                }`}
                style={{
                  transitionDuration: `${COMPACT_TRANSITION_DURATION_MS}ms`,
                  transitionTimingFunction: PROCESS_BAND_EASING,
                }}
              >
                <div className="flex h-full flex-col gap-2">
                  <div
                    className={`relative h-12 w-12 shrink-0 origin-top overflow-hidden transition-[opacity,max-height,transform] ${
                      effectiveIsCompact
                        ? "max-h-0 -translate-y-1 opacity-0 pointer-events-none"
                        : "max-h-12 translate-y-0 opacity-100"
                    }`}
                    style={{
                      transitionDuration: `${COMPACT_TRANSITION_DURATION_MS}ms`,
                      transitionTimingFunction: PROCESS_BAND_EASING,
                    }}
                  >
                    <div
                      className={`absolute left-[6px] top-[4px] h-10 w-9 ${
                        isActive ? "bg-Color-Scheme-1-Text" : "bg-Color-Neutral-Lighter"
                      }`}
                    />
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <div
                      className={`font-display font-medium leading-tight tracking-tight transition-[color,font-size] ${
                        effectiveIsCompact ? "text-sm md:text-[15px]" : "text-base md:text-lg"
                      } ${
                        isActive ? "text-Color-Scheme-1-Text" : "text-Color-Neutral"
                      }`}
                      style={{
                        transitionDuration: `${COMPACT_TRANSITION_DURATION_MS}ms`,
                        transitionTimingFunction: PROCESS_BAND_EASING,
                      }}
                    >
                      {item.title}
                    </div>
                    <div
                      className={`overflow-hidden font-roboto font-normal leading-5 transition-[max-height,opacity,margin-top,font-size,color] ${
                        isCompact
                          ? "mt-0 max-h-0 text-xs opacity-0"
                          : "mt-3 max-h-24 text-sm opacity-100"
                      } ${
                        isActive ? "text-Color-Scheme-1-Text" : "text-Color-Neutral"
                      }`}
                      style={{
                        transitionDuration: `${COMPACT_TRANSITION_DURATION_MS}ms`,
                        transitionTimingFunction: PROCESS_BAND_EASING,
                      }}
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
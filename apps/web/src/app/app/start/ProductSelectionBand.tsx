"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ProductFlowModeDefinition,
  ProductFlowModeKey,
} from "@/app/app/start/startPageTypes";

type ProductSelectionBandProps = {
  productFlowModes: ProductFlowModeDefinition[];
  isLoadingProductFlowModes: boolean;
  onSelectModeAction: (modeKey: ProductFlowModeKey) => void;
};

export default function ProductSelectionBand({
  productFlowModes,
  isLoadingProductFlowModes,
  onSelectModeAction,
}: ProductSelectionBandProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const selectionTimeoutRef = useRef<number | null>(null);

  const sortedModes = useMemo(() => {
    return productFlowModes
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }, [productFlowModes]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setHasMounted(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (selectionTimeoutRef.current !== null) {
        window.clearTimeout(selectionTimeoutRef.current);
      }
    };
  }, []);

  const handleModeSelection = (modeKey: ProductFlowModeKey) => {
    if (isExiting) {
      return;
    }

    setIsExiting(true);

    selectionTimeoutRef.current = window.setTimeout(() => {
      onSelectModeAction(modeKey);
    }, 320);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {sortedModes.map((mode, index) => (
            <button
              key={mode.modeKey}
              type="button"
              onClick={() => handleModeSelection(mode.modeKey)}
              className={`w-full cursor-pointer rounded-xl border border-Color-Scheme-1-Border px-5 py-5 text-left transition-[opacity,transform,border-color] duration-200 ease-out hover:border-Color-Scheme-1-Text sm:w-[360px] sm:min-h-[144px] ${
                hasMounted && !isExiting ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
              }`}
              style={{
                transitionDelay: hasMounted && !isExiting ? `${index * 55}ms` : `${index * 35}ms`,
              }}
            >
              <div className="font-display text-sm font-medium text-Color-Scheme-1-Text">
                {mode.displayName}
              </div>
              <div className="mt-2 text-xs text-Color-Neutral">
                <span className="leading-relaxed">
                  {mode.description ?? "Select this product to begin."}
                </span>
              </div>
              <div className="mt-2 text-Color-Scheme-1-Text">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 20 20">
                  <path
                    d="m7.5 5.5 5 4.5-5 4.5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </div>
            </button>
          ))}
      </div>

      {isLoadingProductFlowModes ? (
        <div className="text-sm text-Color-Neutral">Loading product options...</div>
      ) : null}

      {!isLoadingProductFlowModes && productFlowModes.length === 0 ? (
        <div className="rounded-md border border-dashed border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-3 text-xs text-Color-Neutral">
          No product modes are currently available.
        </div>
      ) : null}
    </div>
  );
}

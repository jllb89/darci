import { ReactNode } from "react";

type HelpTooltipProps = {
  label: string;
  content: ReactNode;
};

export function HelpTooltip({ label, content }: HelpTooltipProps) {
  return (
    <span className="group relative inline-flex items-center">
      <button
        aria-label={label}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-Color-Scheme-1-Border/40 bg-white text-[11px] font-medium text-Color-Neutral"
        type="button"
      >
        ?
      </button>
      <span
        className="pointer-events-none absolute left-full top-1/2 z-20 ml-3 w-[min(26rem,calc(100vw-5rem))] max-w-lg -translate-y-1/2 translate-x-1 rounded-lg border border-black/90 bg-black px-3 py-2 text-left text-xs leading-5 text-white opacity-0 shadow-2xl shadow-black/30 transition-all duration-200 ease-out invisible group-hover:visible group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-x-0 group-focus-within:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
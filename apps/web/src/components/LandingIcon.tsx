type LandingIconName = "document" | "send" | "verify" | "seal" | "upload" | "identifier" | "signature" | "globe" | "arrow" | "plus";

const paths: Record<LandingIconName, string[]> = {
  document: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M8 13h8M8 17h6"],
  send: ["m22 2-7 20-4-9-9-4 20-7Z", "M22 2 11 13"],
  verify: ["M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z", "m8 12 3 3 5-6"],
  seal: ["M8 14V9a4 4 0 1 1 8 0v5", "M6 14h12l2 4H4l2-4ZM4 22h16"],
  upload: ["M12 16V3m-5 5 5-5 5 5", "M4 16v5h16v-5"],
  identifier: ["M4 3v18M10 3v18M14 3v18M20 3v18", "M2 8h20M2 16h20"],
  signature: ["m14 4 6 6M4 20l4-1L21 6a2.8 2.8 0 0 0-4-4L4 15v5Z", "M12 21h10"],
  globe: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"],
  arrow: ["M4 12h16m-6-6 6 6-6 6"],
  plus: ["M5 12h14M12 5v14"],
};

export default function LandingIcon({ name, className = "h-12 w-12" }: { name: LandingIconName; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      {paths[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
